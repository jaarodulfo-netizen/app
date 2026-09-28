from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from bson import ObjectId
import os
import logging
import uuid
import secrets
import bcrypt
import jwt
import requests
import asyncio
import hashlib
import hmac
import shutil
from datetime import datetime, timezone, timedelta, time
from zoneinfo import ZoneInfo

try:
    import imageio_ffmpeg

    FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_BIN = os.environ.get("FFMPEG_BIN", "ffmpeg")

HLS_ROOT = Path("/tmp/kerma-hls")
stream_procs: dict = {}
stream_status: dict = {}

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
ALLOWED_DOMAINS = {"kermagames.com", "trivelta.com"}
ACCESS_TTL = timedelta(hours=12)
ACTIVE_WINDOW = timedelta(minutes=30)

logger = logging.getLogger(__name__)

# --- Object storage (MongoDB GridFS) ---
APP_NAME = "kerma-secure"
file_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="kerma_files")


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    existing = await db.kerma_file_index.find_one({"path": path})
    if existing:
        try:
            await file_bucket.delete(existing["gridfs_id"])
        except Exception:
            pass
    gridfs_id = await file_bucket.upload_from_stream(
        path,
        data,
        metadata={"content_type": content_type},
    )
    await db.kerma_file_index.update_one(
        {"path": path},
        {"$set": {"path": path, "gridfs_id": gridfs_id, "content_type": content_type, "size": len(data)}},
        upsert=True,
    )
    return {"path": path, "size": len(data)}


async def get_object(path: str):
    record = await db.kerma_file_index.find_one({"path": path})
    if not record:
        raise FileNotFoundError(path)
    stream = await file_bucket.open_download_stream(record["gridfs_id"])
    data = await stream.read()
    return data, record.get("content_type", "application/octet-stream")


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class LoginBody(BaseModel):
    email: str
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class OfficerCreate(BaseModel):
    email: str
    name: str


class OfficerUpdate(BaseModel):
    active: bool


class EmployeeIn(BaseModel):
    name: str
    role: str = ""
    cardNo: str = ""
    faceSync: bool = False
    faceMatch: Optional[str] = None
    level: str = "L1 · GENERAL"
    photoPath: Optional[str] = None


class CameraIn(BaseModel):
    label: str
    location: str = ""
    nvr: str = ""
    nvrName: str = ""
    img: Optional[str] = None
    rtsp: str = ""


class DeviceIn(BaseModel):
    type: str
    name: str
    ip: str = ""
    fw: str = ""
    detail: str = ""
    signal: int = 95


class DoorIn(BaseModel):
    name: str
    zone: str = "GENERAL"
    x: float
    y: float
    camId: Optional[str] = None


class DoorUpdate(BaseModel):
    name: Optional[str] = None
    zone: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    camId: Optional[str] = None


class AttendanceConfigIn(BaseModel):
    device_id: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str, jti: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "jti": jti,
        "exp": datetime.now(timezone.utc) + ACCESS_TTL,
        "type": "access",
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def domain_allowed(email: str) -> bool:
    return email.split("@")[-1].lower() in ALLOWED_DOMAINS


def iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def public_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "is_active": u.get("is_active", True),
        "must_change_password": u.get("must_change_password", False),
        "last_login": iso(u.get("last_login")),
        "created_at": iso(u.get("created_at")),
    }


def doc_id(d):
    d["id"] = str(d.pop("_id"))
    return d


def sniff_agent(ua: str) -> str:
    browser = "Browser"
    for b in ("Edg", "Chrome", "Firefox", "Safari"):
        if b in ua:
            browser = "Edge" if b == "Edg" else b
            break
    os_name = "Unknown OS"
    for o, label in (("Windows", "Windows"), ("Mac OS", "macOS"), ("Android", "Android"), ("iPhone", "iOS"), ("Linux", "Linux")):
        if o in ua:
            os_name = label
            break
    return f"{browser} · {os_name}"


bearer = HTTPBearer(auto_error=False)


def decode_token(token: str) -> dict:
    payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account deactivated")
    jti = payload.get("jti")
    if jti:
        session = await db.sessions.find_one({"jti": jti})
        if not session:
            raise HTTPException(status_code=401, detail="Session revoked")
        await db.sessions.update_one({"jti": jti}, {"$set": {"last_seen": datetime.now(timezone.utc)}})
    return user


async def require_commander(user=Depends(get_current_user)):
    if user.get("role") != "commander":
        raise HTTPException(status_code=403, detail="Commander role required")
    return user


@api_router.get("/")
async def root():
    return {"message": "Kerma Security Command OS API"}


@api_router.post("/auth/login")
async def login(body: LoginBody, request: Request):
    email = body.email.strip().lower()
    if not domain_allowed(email):
        raise HTTPException(status_code=403, detail="Access restricted to @kermagames.com and @trivelta.com accounts")

    ident = f"{request.client.host if request.client else 'unknown'}:{email}"
    attempts = await db.login_attempts.find_one({"identifier": ident})
    if attempts and attempts.get("count", 0) >= 5:
        last = attempts.get("last")
        if isinstance(last, datetime) and (datetime.now(timezone.utc) - last.replace(tzinfo=timezone.utc if last.tzinfo is None else last.tzinfo)).total_seconds() < 900:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Locked for 15 minutes.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"count": 1}, "$set": {"last": datetime.now(timezone.utc)}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated — contact your commander")

    await db.login_attempts.delete_one({"identifier": ident})
    now = datetime.now(timezone.utc)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now}})

    jti = uuid.uuid4().hex
    await db.sessions.insert_one(
        {
            "jti": jti,
            "user_id": str(user["_id"]),
            "ip": request.client.host if request.client else "unknown",
            "agent": sniff_agent(request.headers.get("user-agent", "")),
            "created_at": now,
            "last_seen": now,
        }
    )
    token = create_access_token(str(user["_id"]), user["email"], user["role"], jti)
    user["last_login"] = now
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(user=Depends(get_current_user)):
    return {"ok": True}


@api_router.post("/auth/change-password")
async def change_password(body: ChangePasswordBody, user=Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 10:
        raise HTTPException(status_code=400, detail="New password must be at least 10 characters")
    if body.new_password == body.current_password:
        raise HTTPException(status_code=400, detail="New password must differ from the temporary one")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "must_change_password": False}},
    )
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"ok": True, "user": public_user(updated)}


@api_router.get("/auth/officers")
async def list_officers(user=Depends(require_commander)):
    users = await db.users.find({}, {"password_hash": 0}).sort("created_at", -1).to_list(200)
    cutoff = datetime.now(timezone.utc) - ACTIVE_WINDOW
    result = []
    for u in users:
        entry = public_user(u)
        entry["active_sessions"] = await db.sessions.count_documents({"user_id": str(u["_id"]), "last_seen": {"$gte": cutoff}})
        result.append(entry)
    return result


@api_router.get("/auth/officers/{officer_id}/sessions")
async def officer_sessions(officer_id: str, user=Depends(require_commander)):
    cutoff = datetime.now(timezone.utc) - ACTIVE_WINDOW
    sessions = await db.sessions.find({"user_id": officer_id}).sort("created_at", -1).to_list(20)

    def is_active_sess(s):
        ls = s.get("last_seen")
        return bool(ls and ls.replace(tzinfo=timezone.utc) >= cutoff)

    return [
        {
            "id": str(s["_id"]),
            "ip": s.get("ip"),
            "agent": s.get("agent"),
            "created_at": iso(s.get("created_at")),
            "last_seen": iso(s.get("last_seen")),
            "active": is_active_sess(s),
        }
        for s in sessions
    ]


@api_router.patch("/auth/officers/{officer_id}")
async def set_officer_active(officer_id: str, body: OfficerUpdate, user=Depends(require_commander)):
    target = await db.users.find_one({"_id": ObjectId(officer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Officer not found")
    if str(target["_id"]) == str(user["_id"]):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if not body.active and target.get("role") == "commander" and target.get("is_active", True):
        other_commanders = await db.users.count_documents({"role": "commander", "is_active": True, "_id": {"$ne": target["_id"]}})
        if other_commanders == 0:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last active commander")
    await db.users.update_one({"_id": target["_id"]}, {"$set": {"is_active": body.active}})
    if not body.active:
        await db.sessions.delete_many({"user_id": str(target["_id"])})
    updated = await db.users.find_one({"_id": target["_id"]})
    return public_user(updated)


@api_router.delete("/auth/officers/{officer_id}")
async def delete_officer(officer_id: str, user=Depends(require_commander)):
    target = await db.users.find_one({"_id": ObjectId(officer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Officer not found")
    if str(target["_id"]) == str(user["_id"]):
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if target.get("role") == "commander":
        other_commanders = await db.users.count_documents({"role": "commander", "_id": {"$ne": target["_id"]}})
        if other_commanders == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last commander")
    await db.users.delete_one({"_id": target["_id"]})
    await db.sessions.delete_many({"user_id": str(target["_id"])})
    return {"ok": True}


@api_router.post("/auth/officers")
async def create_officer(body: OfficerCreate, user=Depends(require_commander)):
    email = body.email.strip().lower()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if not domain_allowed(email):
        raise HTTPException(status_code=403, detail="Only @kermagames.com or @trivelta.com emails are allowed")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    temp_password = secrets.token_urlsafe(9)
    doc = {
        "email": email,
        "name": name,
        "password_hash": hash_password(temp_password),
        "role": "officer",
        "is_active": True,
        "must_change_password": True,
        "created_at": datetime.now(timezone.utc),
        "created_by": user["email"],
    }
    await db.users.insert_one(doc)
    return {"email": email, "name": name, "role": "officer", "temp_password": temp_password}


# --- Hikvision event ingestion (gateway key, not user JWT) ---

def gateway_auth(request: Request):
    key = request.headers.get("X-API-Key", "")
    if not key or not hmac.compare_digest(key.encode(), os.environ["GATEWAY_API_KEY"].encode()):
        raise HTTPException(status_code=401, detail="Invalid gateway key")


def parse_time(v):
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


async def normalize_event(raw: dict) -> dict:
    ac = raw.get("AccessControllerEvent", raw)
    card_no = ac.get("cardNo") or ac.get("card") or None
    person = raw.get("person") or ac.get("employeeNoString") or ac.get("employeeNo") or ac.get("employeeID") or None
    if card_no and not raw.get("person"):
        emp = await db.employees.find_one({"cardNo": card_no})
        if emp:
            person = emp["name"]
    person = person or ("CARD " + card_no if card_no else "UNKNOWN CREDENTIAL")

    mode = str(ac.get("currentVerifyMode") or ac.get("verifyMode") or raw.get("method") or "").lower()
    if "face" in mode:
        method = "FACE"
    elif "card" in mode or card_no:
        method = "CARD"
    else:
        method = (raw.get("method") or "OTHER").upper()

    door_code = raw.get("doorCode")
    door_name = raw.get("door")
    zone = raw.get("zone", "")
    door_no = ac.get("doorNo")
    if not door_code and door_no is not None:
        try:
            door_code = f"D-{int(door_no):02d}"
        except (ValueError, TypeError):
            door_code = str(door_no)
    if door_code and not door_name:
        door_doc = await db.doors.find_one({"code": door_code})
        if door_doc:
            door_name = door_doc["name"]
            zone = zone or door_doc.get("zone", "")
    door_name = door_name or door_code or "UNKNOWN DOOR"
    door_code = door_code or "—"

    explicit = raw.get("result")
    if explicit:
        granted = str(explicit).lower() == "granted"
    else:
        state = str(ac.get("eventState") or ac.get("status") or ac.get("attendanceStatus") or "").lower()
        granted = ac.get("success")
        if granted is None:
            granted = not any(x in state for x in ("fail", "deny", "invalid"))
        granted = bool(granted)

    when = parse_time(ac.get("dateTime") or ac.get("time") or raw.get("time"))
    detail = raw.get("detail") or ("ACCESS GRANTED" if granted else f"ACCESS DENIED · CODE {ac.get('eventCode') or ac.get('minor') or '—'}")
    dedupe = hashlib.sha256(
        f"{ac.get('deviceSerial') or raw.get('device')}|{ac.get('serialNo') or raw.get('eventId')}|{when.isoformat()}|{person}|{door_code}".encode()
    ).hexdigest()
    source_device = raw.get("device") or raw.get("deviceName") or ac.get("deviceName") or None
    source_device_id = raw.get("deviceId") or raw.get("device_id") or ac.get("deviceId") or None
    source_serial = raw.get("deviceSerial") or ac.get("deviceSerial") or raw.get("serialNumber") or None
    source_ip = raw.get("deviceIp") or raw.get("ipAddress") or ac.get("ipAddress") or None
    return {
        "person": person,
        "cardNo": card_no,
        "door": door_name,
        "doorCode": door_code,
        "zone": zone,
        "method": method,
        "result": "granted" if granted else "denied",
        "detail": detail,
        "time": when,
        "dedupeKey": dedupe,
        "source_device": source_device,
        "source_device_id": source_device_id,
        "source_serial": source_serial,
        "source_ip": source_ip,
        "created_at": datetime.now(timezone.utc),
    }


def event_out(d: dict) -> dict:
    t = d.get("time")
    return {
        "id": str(d["_id"]),
        "ts": int(t.timestamp() * 1000) if isinstance(t, datetime) else int(datetime.now(timezone.utc).timestamp() * 1000),
        "person": d.get("person"),
        "door": d.get("door"),
        "doorCode": d.get("doorCode"),
        "zone": d.get("zone", ""),
        "method": d.get("method", "CARD"),
        "result": d.get("result", "granted"),
        "detail": d.get("detail", ""),
    }


@api_router.post("/ingest/hikvision")
async def ingest_hikvision(request: Request):
    gateway_auth(request)
    body = await request.json()
    rows = body.get("InfoList") or body.get("AcsEvent", {}).get("InfoList") or body.get("events")
    rows = rows or [body]
    inserted = 0
    for raw in rows:
        doc = await normalize_event(raw)
        try:
            await db.events.insert_one(doc)
            inserted += 1
        except Exception as e:
            if "duplicate key" not in str(e):
                raise
    return {"received": len(rows), "inserted": inserted}


@api_router.get("/events")
async def list_events(limit: int = 200, user=Depends(get_current_user)):
    docs = await db.events.find({}, {"raw": 0}).sort("time", -1).to_list(min(limit, 500))
    return [event_out(d) for d in docs]


class OfficerEventIn(BaseModel):
    person: str
    door: str
    doorCode: str = "—"
    zone: str = ""
    method: str = "REMOTE"
    result: str = "granted"
    detail: str = ""


@api_router.post("/events")
async def create_officer_event(body: OfficerEventIn, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = body.model_dump()
    doc["time"] = now
    doc["dedupeKey"] = hashlib.sha256(f"officer|{user['email']}|{now.isoformat()}|{body.door}".encode()).hexdigest()
    doc["created_at"] = now
    r = await db.events.insert_one(doc)
    doc["_id"] = r.inserted_id
    return event_out(doc)


# --- RTSP → HLS live streaming ---

def make_stream_token(camera_id: str, exp: int) -> str:
    msg = f"{camera_id}.{exp}"
    sig = hmac.new(os.environ["STREAM_SIGNING_KEY"].encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}.{sig}"


def check_stream_token(camera_id: str, token: str) -> bool:
    try:
        cid, exp, sig = token.split(".")
        msg = f"{cid}.{exp}"
        expected = hmac.new(os.environ["STREAM_SIGNING_KEY"].encode(), msg.encode(), hashlib.sha256).hexdigest()
        return cid == camera_id and int(exp) > int(datetime.now().timestamp()) and hmac.compare_digest(sig, expected)
    except Exception:
        return False


async def watch_stream(camera_id: str, proc):
    tail = []
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        tail.append(line.decode(errors="replace").strip())
        tail = tail[-20:]
        if b"frame=" in line or b"Opening" in line:
            stream_status[camera_id] = {"state": "live", "stderrTail": tail}
    rc = await proc.wait()
    stream_status[camera_id] = {"state": "error" if rc else "stopped", "stderrTail": tail, "returncode": rc}
    stream_procs.pop(camera_id, None)


@api_router.post("/cameras/{camera_id}/stream/start")
async def start_stream(camera_id: str, user=Depends(get_current_user)):
    cam = await db.cameras.find_one({"_id": ObjectId(camera_id)})
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not cam.get("rtsp"):
        raise HTTPException(status_code=400, detail="No RTSP URL configured for this channel")
    token = make_stream_token(camera_id, int(datetime.now().timestamp() + 3600))
    if camera_id in stream_procs:
        return {"state": stream_status.get(camera_id, {}).get("state", "connecting"), "token": token}
    out = HLS_ROOT / camera_id
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True, exist_ok=True)
    source = cam["rtsp"]
    cmd = [FFMPEG_BIN, "-hide_banner", "-loglevel", "warning"]
    if source.startswith("rtsp://"):
        cmd += ["-rtsp_transport", "tcp"]
    else:
        cmd += ["-stream_loop", "-1", "-re"]
    cmd += [
        "-i", source,
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
        "-g", "25", "-keyint_min", "25", "-sc_threshold", "0",
        "-c:a", "aac",
        "-f", "hls", "-hls_time", "1", "-hls_list_size", "6",
        "-hls_flags", "delete_segments+independent_segments+temp_file",
        "-hls_segment_filename", str(out / "seg-%06d.ts"),
        str(out / "index.m3u8"),
    ]
    proc = await asyncio.create_subprocess_exec(*cmd, stderr=asyncio.subprocess.PIPE)
    stream_procs[camera_id] = proc
    stream_status[camera_id] = {"state": "connecting", "stderrTail": []}
    asyncio.create_task(watch_stream(camera_id, proc))
    return {"state": "connecting", "token": token}


@api_router.post("/cameras/{camera_id}/stream/stop")
async def stop_stream(camera_id: str, user=Depends(get_current_user)):
    proc = stream_procs.get(camera_id)
    if proc and proc.returncode is None:
        proc.terminate()
    return {"state": "stopping"}


@api_router.get("/cameras/{camera_id}/stream/status")
async def stream_state(camera_id: str, user=Depends(get_current_user)):
    st = stream_status.get(camera_id, {"state": "stopped"})
    if st.get("state") == "connecting" and (HLS_ROOT / camera_id / "index.m3u8").exists():
        st = {"state": "live", "stderrTail": st.get("stderrTail", [])}
        stream_status[camera_id] = st
    return st


@api_router.get("/streams/{camera_id}/{file_path:path}")
async def hls_file(camera_id: str, file_path: str, token: str = ""):
    from fastapi.responses import FileResponse

    if not token or not check_stream_token(camera_id, token):
        raise HTTPException(status_code=403, detail="Invalid stream token")
    if Path(file_path).name != file_path or Path(file_path).suffix not in {".m3u8", ".ts"}:
        raise HTTPException(status_code=403, detail="Invalid file")
    p = (HLS_ROOT / camera_id / file_path).resolve()
    if HLS_ROOT not in p.parents or not p.is_file():
        raise HTTPException(status_code=404, detail="Segment not found")
    if p.suffix == ".m3u8":
        text = p.read_text()
        lines = [
            f"{line}?token={token}" if line.strip() and not line.startswith("#") else line
            for line in text.splitlines()
        ]
        return Response(
            content="\n".join(lines) + "\n",
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )
    return FileResponse(p, media_type="video/mp2t", headers={"Cache-Control": "no-store"})


# --- Attendance (one dedicated facial terminal) ---

ATTENDANCE_TZ = ZoneInfo("America/Monterrey")


def attendance_device_match(device: dict) -> list:
    clauses = [{"source_device_id": str(device["_id"])}]
    if device.get("name"):
        clauses.append({"source_device": device["name"]})
    if device.get("ip"):
        clauses.append({"source_ip": device["ip"]})
    if device.get("detail"):
        clauses.append({"source_serial": device["detail"]})
    return clauses


@api_router.get("/attendance/config")
async def get_attendance_config(user=Depends(get_current_user)):
    cfg = await db.attendance_config.find_one({"_id": "primary"})
    if not cfg:
        return {"device_id": None, "device": None}
    try:
        device = await db.devices.find_one({"_id": ObjectId(cfg["device_id"])})
    except Exception:
        device = None
    if not device:
        return {"device_id": cfg.get("device_id"), "device": None}
    return {
        "device_id": str(device["_id"]),
        "device": {
            "id": str(device["_id"]),
            "name": device.get("name"),
            "ip": device.get("ip"),
            "detail": device.get("detail"),
            "status": device.get("status", "online"),
        },
    }


@api_router.put("/attendance/config")
async def set_attendance_config(body: AttendanceConfigIn, user=Depends(require_commander)):
    try:
        device = await db.devices.find_one({"_id": ObjectId(body.device_id)})
    except Exception:
        device = None
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.get("type") != "face":
        raise HTTPException(status_code=400, detail="Attendance device must be a facial terminal")
    await db.attendance_config.update_one(
        {"_id": "primary"},
        {"$set": {"device_id": body.device_id, "updated_at": datetime.now(timezone.utc), "updated_by": user["email"]}},
        upsert=True,
    )
    return {"ok": True, "device_id": body.device_id}


@api_router.get("/attendance")
async def attendance_summary(date: Optional[str] = None, user=Depends(get_current_user)):
    cfg = await db.attendance_config.find_one({"_id": "primary"})
    if not cfg:
        return {"date": date, "device": None, "rows": [], "summary": {"present": 0, "events": 0}}

    try:
        device = await db.devices.find_one({"_id": ObjectId(cfg["device_id"])})
    except Exception:
        device = None
    if not device:
        return {"date": date, "device": None, "rows": [], "summary": {"present": 0, "events": 0}}

    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.now(ATTENDANCE_TZ).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")

    local_start = datetime.combine(target_day, time.min, tzinfo=ATTENDANCE_TZ)
    local_end = local_start + timedelta(days=1)
    start_utc = local_start.astimezone(timezone.utc)
    end_utc = local_end.astimezone(timezone.utc)

    query = {
        "time": {"$gte": start_utc, "$lt": end_utc},
        "result": "granted",
        "$or": attendance_device_match(device),
    }
    docs = await db.events.find(query).sort("time", 1).to_list(5000)

    grouped = {}
    for e in docs:
        person = e.get("person") or "UNKNOWN"
        row = grouped.setdefault(person, {"person": person, "events": 0, "first_in": None, "last_out": None})
        row["events"] += 1
        t = e.get("time")
        if isinstance(t, datetime):
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            local_t = t.astimezone(ATTENDANCE_TZ)
            if row["first_in"] is None:
                row["first_in"] = local_t.isoformat()
            row["last_out"] = local_t.isoformat()

    rows = sorted(grouped.values(), key=lambda r: (r["first_in"] or "", r["person"]))
    return {
        "date": target_day.isoformat(),
        "device": {"id": str(device["_id"]), "name": device.get("name"), "ip": device.get("ip")},
        "rows": rows,
        "summary": {"present": len(rows), "events": len(docs)},
    }


# --- File upload (employee photos) ---

@api_router.post("/upload/photo")
async def upload_photo(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5MB")
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        ext = "jpg"
    path = f"{APP_NAME}/photos/{user['_id'] if isinstance(user.get('_id'), str) else str(user['_id'])}/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, file.content_type)
    await db.files.insert_one(
        {
            "storage_path": result["path"],
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size": result["size"],
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"path": result["path"]}


@api_router.get("/files/{path:path}")
async def serve_file(path: str, request: Request):
    token = request.query_params.get("auth")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        decode_token(token)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = await get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))


# --- Registry: employees / cameras / devices / doors ---

@api_router.get("/employees")
async def list_employees(user=Depends(get_current_user)):
    docs = await db.employees.find().sort("created_at", -1).to_list(500)
    return [doc_id(d) for d in docs]


@api_router.post("/employees")
async def create_employee(body: EmployeeIn, user=Depends(get_current_user)):
    doc = body.model_dump()
    doc["created_at"] = datetime.now(timezone.utc)
    doc["created_by"] = user["email"]
    r = await db.employees.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.delete("/employees/{item_id}")
async def delete_employee(item_id: str, user=Depends(get_current_user)):
    r = await db.employees.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}


@api_router.get("/cameras")
async def list_cameras(user=Depends(get_current_user)):
    docs = await db.cameras.find().sort("created_at", 1).to_list(500)
    return [doc_id(d) for d in docs]


@api_router.post("/cameras")
async def create_camera(body: CameraIn, user=Depends(get_current_user)):
    count = await db.cameras.count_documents({})
    doc = body.model_dump()
    doc["code"] = f"CAM-{count + 1:02d}"
    doc["status"] = "live"
    doc["created_at"] = datetime.now(timezone.utc)
    r = await db.cameras.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.delete("/cameras/{item_id}")
async def delete_camera(item_id: str, user=Depends(get_current_user)):
    r = await db.cameras.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"ok": True}


@api_router.get("/devices")
async def list_devices(user=Depends(get_current_user)):
    docs = await db.devices.find().sort("created_at", 1).to_list(500)
    return [doc_id(d) for d in docs]


@api_router.post("/devices")
async def create_device(body: DeviceIn, user=Depends(get_current_user)):
    if body.type not in {"gateway", "nvr", "face", "card"}:
        raise HTTPException(status_code=400, detail="Device type must be gateway, nvr, face or card")
    doc = body.model_dump()
    doc["status"] = "online"
    doc["created_at"] = datetime.now(timezone.utc)
    r = await db.devices.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.delete("/devices/{item_id}")
async def delete_device(item_id: str, user=Depends(get_current_user)):
    r = await db.devices.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.cameras.update_many({"nvr": item_id}, {"$set": {"nvr": "", "nvrName": ""}})
    return {"ok": True}


@api_router.get("/doors")
async def list_doors(user=Depends(get_current_user)):
    docs = await db.doors.find().sort("created_at", 1).to_list(200)
    return [doc_id(d) for d in docs]


@api_router.post("/doors")
async def create_door(body: DoorIn, user=Depends(get_current_user)):
    count = await db.doors.count_documents({})
    doc = body.model_dump()
    doc["code"] = f"D-{count + 1:02d}"
    doc["status"] = "locked"
    doc["created_at"] = datetime.now(timezone.utc)
    r = await db.doors.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.put("/doors/{item_id}")
async def update_door(item_id: str, body: DoorUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    r = await db.doors.update_one({"_id": ObjectId(item_id)}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Door not found")
    doc = await db.doors.find_one({"_id": ObjectId(item_id)})
    return doc_id(doc)


@api_router.delete("/doors/{item_id}")
async def delete_door(item_id: str, user=Depends(get_current_user)):
    r = await db.doors.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Door not found")
    return {"ok": True}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


# --- Kerma Monterrey device inventory seed ---
KERMA_DEVICE_SEED = [
    {"type": "gateway", "name": "Kerma Monterrey Gateway", "ip": "", "fw": "", "detail": "Gateway ID: kerma-monterrey", "signal": 100},
    {"type": "face", "name": "VIP Entrance", "ip": "192.168.2.39", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "VIP Exit", "ip": "192.168.1.56", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 1 Entrance", "ip": "192.168.3.159", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 1 Exit", "ip": "192.168.0.206", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 2 Entrance", "ip": "192.168.0.169", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 2 Exit", "ip": "192.168.3.4", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Main Inventory", "ip": "192.168.2.226", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Cleaning Storage", "ip": "192.168.1.169", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Roof Stairs", "ip": "192.168.1.124", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Technicians Inventory", "ip": "192.168.3.208", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Attendance Main", "ip": "192.168.0.77", "fw": "", "detail": "Dedicated attendance facial terminal", "signal": 95},
    {"type": "card", "name": "1st Floor AC", "ip": "192.168.3.111", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "2nd Floor AC", "ip": "192.168.3.112", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "Break Room", "ip": "192.168.3.113", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "3rd Floor AC", "ip": "192.168.3.114", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "Restrooms", "ip": "192.168.3.115", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "1st Floor 2nd AC", "ip": "192.168.3.116", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "nvr", "name": "NVR 1", "ip": "192.168.3.101", "fw": "", "detail": "DS-7732NI-M4/16P · HTTP 80 · RTSP 554", "signal": 95},
    {"type": "nvr", "name": "NVR 2", "ip": "192.168.3.102", "fw": "", "detail": "DS-7732NXI-I4/16P · HTTP 80 · RTSP 554", "signal": 95},
]


async def seed_kerma_devices():
    attendance_id = None
    for item in KERMA_DEVICE_SEED:
        existing = await db.devices.find_one({"name": item["name"]})
        if existing:
            await db.devices.update_one(
                {"_id": existing["_id"]},
                {"$set": {**item, "status": existing.get("status", "online")}},
            )
            device_id = existing["_id"]
        else:
            doc = {**item, "status": "online", "created_at": datetime.now(timezone.utc)}
            result = await db.devices.insert_one(doc)
            device_id = result.inserted_id
        if item["name"] == "Attendance Main":
            attendance_id = device_id

    if attendance_id is not None:
        await db.attendance_config.update_one(
            {"_id": "primary"},
            {"$setOnInsert": {
                "device_id": str(attendance_id),
                "updated_at": datetime.now(timezone.utc),
                "updated_by": "system-seed",
            }},
            upsert=True,
        )


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.sessions.create_index("jti", unique=True)
    await db.sessions.create_index("user_id")
    await db.events.create_index("dedupeKey", unique=True)
    await db.events.create_index("time")
    HLS_ROOT.mkdir(parents=True, exist_ok=True)
    await db.kerma_file_index.create_index("path", unique=True)
    await seed_kerma_devices()
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(
            {
                "email": admin_email,
                "name": "Juan Alvarez",
                "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
                "role": "commander",
                "is_active": True,
                "must_change_password": True,
                "created_at": datetime.now(timezone.utc),
            }
        )
        logger.info("Seeded commander account %s", admin_email)


@app.on_event("shutdown")
async def shutdown_db_client():
    for proc in list(stream_procs.values()):
        if proc.returncode is None:
            proc.terminate()
    shutil.rmtree(HLS_ROOT, ignore_errors=True)
    client.close()
