from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, WebSocket, WebSocketDisconnect
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
import re
import requests
import asyncio
import hashlib
import hmac
import shutil
import json
import base64
from hikvision_image import encode_hikvision_face_jpeg
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


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "kerma-security-v2",
        "gateway_connected": "kerma-monterrey" in gateway_connections if "gateway_connections" in globals() else False,
    }

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


class OfficerPermissionUpdate(BaseModel):
    enrollment: bool
    sync: bool
    cctv: bool


OFFICER_DEFAULT_PERMISSIONS = {"enrollment": True, "sync": False, "cctv": True}


def effective_permissions(user: dict) -> dict:
    if user.get("role") == "commander":
        return {"enrollment": True, "sync": True, "cctv": True}
    stored = user.get("permissions") or {}
    return {key: bool(stored.get(key, val)) for key, val in OFFICER_DEFAULT_PERMISSIONS.items()}


def ensure_permission(user: dict, capability: str) -> None:
    if not effective_permissions(user).get(capability, False):
        raise HTTPException(status_code=403, detail=f"Missing {capability} permission")


class EmployeeIn(BaseModel):
    name: str
    role: str = ""
    cardNo: str = ""
    cardNos: Optional[List[str]] = None
    personId: Optional[str] = None
    validFrom: Optional[str] = None
    validTo: Optional[str] = None
    faceSync: bool = False
    faceMatch: Optional[str] = None
    level: str = "L1 · GENERAL"
    photoPath: Optional[str] = None
    doorRights: Optional[dict] = None
    accessLevelId: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    cardNo: Optional[str] = None
    cardNos: Optional[List[str]] = None
    personId: Optional[str] = None
    validFrom: Optional[str] = None
    validTo: Optional[str] = None
    faceSync: Optional[bool] = None
    faceMatch: Optional[str] = None
    level: Optional[str] = None
    photoPath: Optional[str] = None
    doorRights: Optional[dict] = None
    accessLevelId: Optional[str] = None


class AccessLevelIn(BaseModel):
    name: str
    description: str = ""
    doorRights: dict = {}


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
    gatewayDeviceId: Optional[str] = None
    doors: List[int] = []


class DoorIn(BaseModel):
    name: str
    zone: str = "GENERAL"
    x: Optional[float] = None
    y: Optional[float] = None
    floor: Optional[int] = None
    camId: Optional[str] = None
    deviceId: Optional[str] = None
    gatewayDeviceId: Optional[str] = None
    doorNo: Optional[int] = None
    visible: bool = True


class DoorUpdate(BaseModel):
    name: Optional[str] = None
    zone: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    floor: Optional[int] = None
    camId: Optional[str] = None
    deviceId: Optional[str] = None
    gatewayDeviceId: Optional[str] = None
    doorNo: Optional[int] = None
    visible: Optional[bool] = None


class DoorPlacement(BaseModel):
    floor: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None


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
        "permissions": effective_permissions(u),
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


async def require_cctv(user=Depends(get_current_user)):
    ensure_permission(user, "cctv")
    return user


async def require_enrollment(user=Depends(get_current_user)):
    ensure_permission(user, "enrollment")
    return user


async def require_manual_sync(user=Depends(get_current_user)):
    ensure_permission(user, "enrollment")
    ensure_permission(user, "sync")
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


@api_router.put("/auth/officers/{officer_id}/permissions")
async def update_officer_permissions(officer_id: str, body: OfficerPermissionUpdate, user=Depends(require_commander)):
    try:
        oid = ObjectId(officer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid officer ID")
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="Officer not found")
    if target.get("role") != "officer":
        raise HTTPException(status_code=403, detail="Only officer capabilities can be edited")
    permissions = body.model_dump()
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"_id": oid, "role": "officer"},
        {"$set": {"permissions": permissions, "permissionsUpdatedAt": now,
                  "permissionsUpdatedBy": user["email"]}},
    )
    await db.security_permission_audit.insert_one({
        "type": "officer_permissions_changed", "targetUserId": str(oid),
        "targetEmail": target["email"], "previous": effective_permissions(target),
        "updated": permissions, "actor": user["email"], "at": now,
    })
    return public_user(await db.users.find_one({"_id": oid}))


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
    detail = str(d.get("detail") or "").strip()
    display_labels = {
        "exit button pressed": "BUTTON PRESSED",
        "exit button released": "BUTTON RELEASED",
        "lock released": "LOCK RELEASED",
        "lock closed": "LOCK CLOSED",
        "door opened normally": "DOOR OPENED",
        "door closed normally": "DOOR CLOSED",
        "always-open state started": "ALWAYS OPEN STARTED",
        "always-open state ended": "ALWAYS OPEN ENDED",
    }
    detail = display_labels.get(detail.lower(), detail)

    result = str(d.get("result") or "status").lower()
    if detail in {"BUTTON PRESSED", "BUTTON RELEASED", "LOCK RELEASED", "LOCK CLOSED", "DOOR OPENED", "DOOR CLOSED", "ALWAYS OPEN STARTED", "ALWAYS OPEN ENDED"}:
        result = "status"

    return {
        "id": str(d["_id"]),
        "ts": int(t.timestamp() * 1000) if isinstance(t, datetime) else int(datetime.now(timezone.utc).timestamp() * 1000),
        "person": d.get("person"),
        "door": d.get("door"),
        "doorCode": d.get("doorCode"),
        "zone": d.get("zone", ""),
        "method": d.get("method", "CARD"),
        "result": result,
        "detail": detail,
        "cardNo": d.get("cardNo"),
        "source_device": d.get("source_device"),
        "source_device_id": d.get("source_device_id"),
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
    query = {}
    attendance_device = await _attendance_device()
    if attendance_device:
        matches = attendance_device_match(attendance_device)
        if matches:
            query = {"$nor": matches}
    docs = await db.events.find(query, {"raw": 0}).sort("time", -1).to_list(min(limit, 500))
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

def make_stream_token(camera_id: str, exp: int, user_id: str) -> str:
    # Bind stream URLs to a real active user; permission changes revoke access.
    msg = f"{camera_id}.{user_id}.{exp}"
    sig = hmac.new(os.environ["STREAM_SIGNING_KEY"].encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}.{sig}"


def check_stream_token(camera_id: str, token: str) -> Optional[str]:
    try:
        cid, user_id, exp, sig = token.split(".")
        if not ObjectId.is_valid(user_id):
            return None
        msg = f"{cid}.{user_id}.{exp}"
        expected = hmac.new(os.environ["STREAM_SIGNING_KEY"].encode(), msg.encode(), hashlib.sha256).hexdigest()
        if cid != camera_id or int(exp) <= int(datetime.now().timestamp()):
            return None
        return user_id if hmac.compare_digest(sig, expected) else None
    except Exception:
        return None


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
async def start_stream(camera_id: str, user=Depends(require_cctv)):
    cam = await db.cameras.find_one({"_id": ObjectId(camera_id)})
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not cam.get("rtsp"):
        raise HTTPException(status_code=400, detail="No RTSP URL configured for this channel")
    token = make_stream_token(camera_id, int(datetime.now().timestamp() + 600), str(user["_id"]))
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
async def stop_stream(camera_id: str, user=Depends(require_cctv)):
    proc = stream_procs.get(camera_id)
    if proc and proc.returncode is None:
        proc.terminate()
    return {"state": "stopping"}


@api_router.get("/cameras/{camera_id}/stream/status")
async def stream_state(camera_id: str, user=Depends(require_cctv)):
    st = stream_status.get(camera_id, {"state": "stopped"})
    if st.get("state") == "connecting" and (HLS_ROOT / camera_id / "index.m3u8").exists():
        st = {"state": "live", "stderrTail": st.get("stderrTail", [])}
        stream_status[camera_id] = st
    return st


@api_router.get("/streams/{camera_id}/{file_path:path}")
async def hls_file(camera_id: str, file_path: str, token: str = ""):
    from fastapi.responses import FileResponse

    user_id = check_stream_token(camera_id, token) if token else None
    if not user_id:
        raise HTTPException(status_code=403, detail="Invalid stream token")
    stream_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not stream_user or not stream_user.get("is_active", True) or not effective_permissions(stream_user)["cctv"]:
        raise HTTPException(status_code=403, detail="CCTV permission revoked")
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


# --- Attendance / payroll (one dedicated facial terminal) ---

from attendance_punch import classify_attendance_punch, measure_attendance

ATTENDANCE_TZ = ZoneInfo("America/Monterrey")
ATTENDANCE_SHIFTS = {
    "A": {"start": time(7, 0), "hours": 8},
    "B": {"start": time(15, 0), "hours": 8},
    "C": {"start": time(23, 0), "hours": 8},
}
ATTENDANCE_SESSION_MAX_HOURS = 16


def attendance_device_match(device: dict) -> list:
    clauses = []
    # Gateway events use gatewayDeviceId as source_device_id. Older/manual records
    # may use the Mongo object id, display name, IP or serial, so keep all aliases.
    if device.get("gatewayDeviceId"):
        clauses.append({"source_device_id": str(device["gatewayDeviceId"])})
    clauses.append({"source_device_id": str(device["_id"])})
    if device.get("name"):
        clauses.append({"source_device": device["name"]})
    if device.get("ip"):
        clauses.append({"source_ip": device["ip"]})
    if device.get("detail"):
        clauses.append({"source_serial": device["detail"]})
    return clauses


async def _is_attendance_gateway_event(event: dict) -> bool:
    device = await _attendance_device()
    if not device:
        return False
    event_device_id = str(event.get("deviceId") or event.get("device_id") or "")
    event_device_name = str(event.get("deviceName") or "")
    gateway_device_id = str(device.get("gatewayDeviceId") or "")
    if gateway_device_id and event_device_id == gateway_device_id:
        return True
    if event_device_name and device.get("name") and event_device_name == str(device.get("name")):
        return True
    return False


def _local_dt(value):
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(ATTENDANCE_TZ)


def _shift_start_for_scan(local_scan: datetime):
    candidates = []
    for day_offset in (-1, 0, 1):
        d = local_scan.date() + timedelta(days=day_offset)
        for code, cfg in ATTENDANCE_SHIFTS.items():
            start = datetime.combine(d, cfg["start"], tzinfo=ATTENDANCE_TZ)
            candidates.append((abs((local_scan - start).total_seconds()), code, start))
    _, code, scheduled_start = min(candidates, key=lambda x: x[0])
    scheduled_end = scheduled_start + timedelta(hours=ATTENDANCE_SHIFTS[code]["hours"])
    return code, scheduled_start, scheduled_end


def _duration_parts(first_in: datetime, last_out: datetime):
    if not first_in or not last_out or last_out <= first_in:
        return 0, 0, 0
    worked = max(0, int((last_out - first_in).total_seconds()))
    regular = min(worked, 8 * 3600)
    overtime = max(0, worked - regular)
    return worked, regular, overtime


def _seconds_hhmm(seconds: int) -> str:
    seconds = max(0, int(seconds or 0))
    hours, rem = divmod(seconds, 3600)
    minutes = rem // 60
    return f"{hours:02d}:{minutes:02d}"


async def _attendance_device():
    cfg = await db.attendance_config.find_one({"_id": "primary"})
    if not cfg:
        return None
    try:
        return await db.devices.find_one({"_id": ObjectId(cfg["device_id"])})
    except Exception:
        return None


async def _attendance_sessions(start_day, end_day, device):
    # Query with generous buffers so Shift C can begin before midnight and finish
    # the following morning, and overtime never gets cut at a calendar boundary.
    query_local_start = datetime.combine(start_day - timedelta(days=1), time.min, tzinfo=ATTENDANCE_TZ)
    query_local_end = datetime.combine(end_day + timedelta(days=2), time.min, tzinfo=ATTENDANCE_TZ)
    query = {
        "time": {
            "$gte": query_local_start.astimezone(timezone.utc),
            "$lt": query_local_end.astimezone(timezone.utc),
        },
        "$or": attendance_device_match(device),
    }
    attendance_docs = await db.attendance_events.find(query).sort("time", 1).to_list(20000)
    legacy_docs = await db.events.find(query).sort("time", 1).to_list(20000)
    docs_by_key = {}
    for doc in attendance_docs + legacy_docs:
        result = str(doc.get("result") or "").lower()
        raw_punch = classify_attendance_punch(doc.get("raw_gateway_event"))
        # Some attendance firmwares report a valid explicit IN/OUT/break
        # as a status event. Do not count denied or alarm records as punches.
        if result != "granted" and not (result == "status" and raw_punch):
            continue
        key = str(doc.get("dedupeKey") or doc.get("_id"))
        docs_by_key[key] = doc
    docs = sorted(docs_by_key.values(), key=lambda d: d.get("time") or datetime.min.replace(tzinfo=timezone.utc))

    # Prefer the original person/card identity over name: two employees may
    # share a display name. Numeric Hikvision person IDs can lose leading zeroes.
    by_person = {}
    for e in docs:
        person = str(e.get("person") or "").strip()
        if not person or person.upper() in {"UNKNOWN", "UNKNOWN CREDENTIAL"}:
            continue
        local_t = _local_dt(e.get("time"))
        if not local_t:
            continue
        person_id = str(e.get("personId") or "").strip()
        card_no = str(e.get("cardNo") or "").strip()
        if person_id and person_id.isascii() and person_id.isdecimal():
            identity = ("person_id", str(int(person_id)))
        elif person_id:
            identity = ("person_id", person_id)
        elif card_no and card_no.isascii() and card_no.isdecimal():
            identity = ("person_id", str(int(card_no)))
        elif card_no:
            identity = ("card", card_no)
        else:
            identity = ("name", person.casefold())
        bucket = by_person.setdefault(identity, {"person": person, "scans": []})
        bucket["scans"].append({
            "time": local_t,
            "method": e.get("method"),
            "detail": e.get("detail"),
            "cardNo": card_no,
            "personId": person_id,
            "punch": classify_attendance_punch(e.get("raw_gateway_event")),
        })

    sessions = []
    for bucket in by_person.values():
        person = bucket["person"]
        scans = sorted(bucket["scans"], key=lambda x: x["time"])
        i = 0
        while i < len(scans):
            first = scans[i]["time"]
            shift, scheduled_start, scheduled_end = _shift_start_for_scan(first)
            capture_end = scheduled_start + timedelta(hours=ATTENDANCE_SESSION_MAX_HOURS)

            session_scans = [scans[i]]
            j = i + 1
            while j < len(scans) and scans[j]["time"] < capture_end:
                session_scans.append(scans[j])
                j += 1

            measure = measure_attendance(session_scans)
            worked = measure["worked_seconds"]
            regular = min(worked, 8 * 3600)
            overtime = max(0, worked - regular)
            shift_day = scheduled_start.date()

            if start_day <= shift_day <= end_day:
                sessions.append({
                    "person": person,
                    "person_id": scans[i].get("personId") or None,
                    "card_no": scans[i].get("cardNo") or None,
                    "shift": shift,
                    "shift_date": shift_day.isoformat(),
                    "scheduled_start": scheduled_start.isoformat(),
                    "scheduled_end": scheduled_end.isoformat(),
                    "first_in": measure["first_in"].isoformat() if measure["first_in"] else None,
                    "last_out": measure["last_out"].isoformat() if measure["last_out"] else None,
                    "events": len(session_scans),
                    "worked_seconds": worked,
                    "regular_seconds": regular,
                    "overtime_seconds": overtime,
                    "break_seconds": measure["break_seconds"],
                    "break_count": measure["break_count"],
                    "worked": _seconds_hhmm(worked),
                    "regular": _seconds_hhmm(regular),
                    "overtime": _seconds_hhmm(overtime),
                    "breaks": _seconds_hhmm(measure["break_seconds"]),
                    "punches_confirmed": measure["punches_confirmed"],
                    "estimated": measure["estimated"],
                    "warning": measure["warning"],
                    "punches": [
                        {"time": s["time"].isoformat(), "type": s.get("punch") or "unclassified",
                         "method": s.get("method")} for s in session_scans
                    ],
                    "complete": measure["punches_confirmed"],
                    "status": measure["status"],
                })

            i = max(j, i + 1)

    sessions.sort(key=lambda r: (r["shift_date"], r["scheduled_start"], r["person"]))
    return sessions


def _attendance_summary(rows):
    return {
        "present": len(rows),
        "events": sum(int(r.get("events", 0)) for r in rows),
        "break_seconds": sum(int(r.get("break_seconds", 0)) for r in rows),
        "breaks": _seconds_hhmm(sum(int(r.get("break_seconds", 0)) for r in rows)),
        "needs_review": sum(1 for r in rows if not r.get("punches_confirmed")),
        "worked_seconds": sum(int(r.get("worked_seconds", 0)) for r in rows),
        "regular_seconds": sum(int(r.get("regular_seconds", 0)) for r in rows),
        "overtime_seconds": sum(int(r.get("overtime_seconds", 0)) for r in rows),
        "worked": _seconds_hhmm(sum(int(r.get("worked_seconds", 0)) for r in rows)),
        "regular": _seconds_hhmm(sum(int(r.get("regular_seconds", 0)) for r in rows)),
        "overtime": _seconds_hhmm(sum(int(r.get("overtime_seconds", 0)) for r in rows)),
        "incomplete": sum(1 for r in rows if r.get("status") != "complete"),
    }


@api_router.get("/attendance/config")
async def get_attendance_config(user=Depends(get_current_user)):
    cfg = await db.attendance_config.find_one({"_id": "primary"})
    if not cfg:
        return {"device_id": None, "device": None, "shifts": ATTENDANCE_SHIFTS}
    try:
        device = await db.devices.find_one({"_id": ObjectId(cfg["device_id"])})
    except Exception:
        device = None
    if not device:
        return {"device_id": cfg.get("device_id"), "device": None, "shifts": ATTENDANCE_SHIFTS}
    return {
        "device_id": str(device["_id"]),
        "device": {
            "id": str(device["_id"]),
            "name": device.get("name"),
            "ip": device.get("ip"),
            "detail": device.get("detail"),
            "status": device.get("status", "online"),
            "gatewayDeviceId": device.get("gatewayDeviceId"),
        },
        "shifts": {
            "A": "07:00-15:00",
            "B": "15:00-23:00",
            "C": "23:00-07:00",
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
    device = await _attendance_device()
    if not device:
        return {"date": date, "device": None, "rows": [], "summary": _attendance_summary([])}

    try:
        target_day = datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.now(ATTENDANCE_TZ).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")

    rows = await _attendance_sessions(target_day, target_day, device)
    return {
        "date": target_day.isoformat(),
        "device": {"id": str(device["_id"]), "name": device.get("name"), "ip": device.get("ip")},
        "rows": rows,
        "summary": _attendance_summary(rows),
    }


@api_router.get("/attendance/report")
async def attendance_report(start: str, end: str, user=Depends(get_current_user)):
    try:
        start_day = datetime.strptime(start, "%Y-%m-%d").date()
        end_day = datetime.strptime(end, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="start and end must be YYYY-MM-DD")
    if end_day < start_day:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    if (end_day - start_day).days > 62:
        raise HTTPException(status_code=400, detail="Attendance reports are limited to 63 days")

    device = await _attendance_device()
    if not device:
        return {"start": start, "end": end, "device": None, "rows": [], "summary": _attendance_summary([])}

    rows = await _attendance_sessions(start_day, end_day, device)
    return {
        "start": start_day.isoformat(),
        "end": end_day.isoformat(),
        "device": {"id": str(device["_id"]), "name": device.get("name"), "ip": device.get("ip")},
        "rows": rows,
        "summary": _attendance_summary(rows),
    }


# --- On-premise Kerma Gateway tunnel ---
gateway_connections: dict[str, WebSocket] = {}
gateway_pending: dict[str, asyncio.Future] = {}


async def gateway_event_doc(event: dict) -> dict:
    when = parse_time(event.get("time"))
    card_no = str(event.get("cardNo")) if event.get("cardNo") is not None else None

    # Resolve the human-readable employee name for both CARD and FACE events.
    # Hikvision facial events commonly send only personId/employeeNo, which
    # previously caused attendance to be stored under the numeric ID.
    person_id = str(event.get("personId") or event.get("employeeNo") or event.get("employeeNoString") or "").strip()
    person = str(event.get("personName") or "").strip() or None
    employee = None
    if person_id:
        employee = await db.employees.find_one({
            "$or": [
                {"personId": person_id},
                {"employeeNo": person_id},
                {"employeeNoString": person_id},
            ]
        })
    if not employee and person_id.isascii() and person_id.isdigit() and int(person_id) > 0:
        # Hikvision SDK numeric IDs may drop leading zeroes in events.
        # The V2 Person ID remains the exact 10-digit card string.
        match_numeric_id = "^0*" + str(int(person_id)) + "$"
        employee = await db.employees.find_one({"personId": {"$regex": match_numeric_id}})
    if not employee and card_no:
        employee = await db.employees.find_one({"$or": [{"cardNo": card_no}, {"cardNos": card_no}]})
    if employee:
        person = employee.get("name") or person
    person = person or person_id or (("CARD " + card_no) if card_no else "UNKNOWN CREDENTIAL")

    gateway_device_id = event.get("deviceId")
    device_name = event.get("deviceName") or gateway_device_id or "UNKNOWN DEVICE"
    door_no = event.get("doorNo")

    raw_detail = str(event.get("description") or "").strip()
    desc = raw_detail.lower()
    outcome = str(event.get("outcome") or "status").lower().strip()

    # Some Hikvision facial terminals report a successful face read as a
    # generic/status event. Normalize those into granted access so the
    # dedicated attendance terminal records an IN/OUT scan.
    granted_markers = (
        "access granted",
        "authentication successful",
        "authentication passed",
        "verification successful",
        "verification passed",
        "face verified",
        "face verification",
        "face matched",
        "match successful",
        "valid card",
        "success",
    )
    denied_markers = (
        "access denied",
        "authentication failed",
        "verification failed",
        "face mismatch",
        "not authorized",
        "expired card",
        "card not found",
        "failed",
    )
    if outcome not in {"granted", "denied", "alarm", "status"}:
        outcome = "status"
    if outcome == "status":
        if any(x in desc for x in denied_markers):
            outcome = "denied"
        elif any(x in desc for x in granted_markers):
            outcome = "granted"
        elif "alarm" in desc or "abnormal" in desc:
            outcome = "alarm"

    result = outcome
    normalized_status_detail = {
        "exit button pressed": "BUTTON PRESSED",
        "exit button released": "BUTTON RELEASED",
        "lock released": "LOCK RELEASED",
        "lock closed": "LOCK CLOSED",
    }
    detail = normalized_status_detail.get(raw_detail.lower()) or raw_detail or {
        "granted": "ACCESS GRANTED",
        "denied": "ACCESS DENIED",
        "alarm": "ALARM",
        "status": "STATUS EVENT",
    }[result]
    dedupe = hashlib.sha256(
        f"gateway|{gateway_device_id}|{event.get('id')}|{when.isoformat()}|{event.get('cardNo')}|{door_no}".encode()
    ).hexdigest()
    return {
        "person": person,
        "personId": person_id or None,
        "cardNo": card_no,
        "door": device_name if door_no is None else f"{device_name} · Door {door_no}",
        "doorCode": f"{gateway_device_id or 'device'}:{door_no or 1}",
        "zone": "",
        "method": "FACE" if (
            str(event.get("method") or "").upper() == "FACE"
            or "face" in desc
            or "facial" in desc
            or (person_id and not card_no)
        ) else ("CARD" if card_no else "OTHER"),
        "result": result,
        "detail": detail,
        "time": when,
        "dedupeKey": dedupe,
        "source_device": device_name,
        "source_device_id": gateway_device_id,
        "source_serial": None,
        "source_ip": None,
        "gateway_device_id": gateway_device_id,
        "raw_gateway_event": event,
        "created_at": datetime.now(timezone.utc),
    }


async def send_gateway_command(command: dict, gateway_id: str = "kerma-monterrey"):
    ws = gateway_connections.get(gateway_id)
    if not ws:
        raise HTTPException(status_code=503, detail="Kerma studio gateway is offline")
    request_id = uuid.uuid4().hex
    fut = asyncio.get_running_loop().create_future()
    gateway_pending[request_id] = fut
    try:
        await ws.send_json({"type": "command", "requestId": request_id, "command": command})
        return await asyncio.wait_for(fut, timeout=20)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Kerma studio gateway did not respond")
    finally:
        gateway_pending.pop(request_id, None)


@app.websocket("/gateway")
async def gateway_socket(websocket: WebSocket):
    auth = websocket.headers.get("authorization", "")
    expected = os.environ.get("GATEWAY_TOKEN", "")
    supplied = auth[7:] if auth.startswith("Bearer ") else ""
    if not expected or not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
        logger.warning("Gateway WebSocket authentication rejected")
        await websocket.close(code=1008)
        return

    await websocket.accept()
    logger.info("Gateway WebSocket accepted")
    gateway_id = None
    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type == "register":
                gateway_id = str(msg.get("gatewayId") or "kerma-monterrey")
                gateway_connections[gateway_id] = websocket
                logger.info("Gateway registered: %s with %s devices", gateway_id, len(msg.get("devices") or []))
                for dev in msg.get("devices") or []:
                    await db.devices.update_one(
                        {"gatewayDeviceId": dev.get("id")},
                        {"$set": {
                            "gatewayDeviceId": dev.get("id"),
                            "gatewayId": gateway_id,
                            "gatewayOnline": bool(dev.get("online")),
                            "status": "online" if dev.get("online") else "offline",
                            "doors": dev.get("doors") or [],
                            "gatewayLastSeen": datetime.now(timezone.utc),
                        }},
                    )
                    await db.doors.update_many(
                        {"gatewayDeviceId": dev.get("id")},
                        {"$set": {
                            "gatewayOnline": bool(dev.get("online")),
                            "hardwareStatus": "online" if dev.get("online") else "offline",
                            "gatewayLastSeen": datetime.now(timezone.utc),
                        }},
                    )
                await websocket.send_json({"type": "registered", "gatewayId": gateway_id, "hubTime": int(datetime.now().timestamp() * 1000)})
                continue

            if msg_type == "event":
                event = msg.get("event") or {}
                doc = await gateway_event_doc(event)
                target = db.attendance_events if await _is_attendance_gateway_event(event) else db.events
                try:
                    await target.insert_one(doc)
                except Exception as e:
                    if "duplicate key" not in str(e):
                        logger.warning("Gateway event insert failed: %s", e)
                continue

            if msg_type == "device-status":
                dev_id = msg.get("deviceId")
                online = bool(msg.get("online"))
                await db.devices.update_one(
                    {"gatewayDeviceId": dev_id},
                    {"$set": {
                        "gatewayOnline": online,
                        "status": "online" if online else "offline",
                        "gatewayReason": msg.get("reason"),
                        "gatewayLastSeen": datetime.now(timezone.utc),
                    }},
                )
                await db.doors.update_many(
                    {"gatewayDeviceId": dev_id},
                    {"$set": {
                        "gatewayOnline": online,
                        "hardwareStatus": "online" if online else "offline",
                        "gatewayReason": msg.get("reason"),
                        "gatewayLastSeen": datetime.now(timezone.utc),
                    }},
                )
                continue

            if msg_type == "card-sync":
                # Gateway is authenticated through GATEWAY_TOKEN. Accept
                # read-back reports only for a matching, current request.
                card = str(msg.get("cardNo") or "").strip()
                person_id = str(msg.get("personId") or "").strip()
                device_id = str(msg.get("deviceId") or "").strip()
                request_token = str(msg.get("syncRequestId") or "").strip()
                state = str(msg.get("status") or "").strip()
                numbers = msg.get("doors")
                if (not re.fullmatch(r"[0-9]{10}", card) or
                        person_id != card or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", device_id) or
                        not re.fullmatch(r"[0-9a-f]{32}", request_token) or
                        state not in {"verified", "failed"} or
                        not isinstance(numbers, list) or
                        not numbers or len(numbers) > 256 or
                        any(not isinstance(d, int) or d < 1 or d > 256 for d in numbers)):
                    logger.warning("Rejected malformed native card confirmation from Gateway")
                    continue
                employee = await db.employees.find_one({
                    "cardNo": card, "personId": person_id, "syncRequestId": request_token,
                })
                if not employee:
                    logger.info("Ignored obsolete or unknown native card confirmation for %s", device_id)
                    continue
                authorized = normalize_door_rights(employee.get("doorRights"))
                expected = sorted(set(authorized.get(device_id) or []))
                actual = sorted(set(numbers))
                if not expected or expected != actual:
                    logger.warning("Rejected native card confirmation with mismatched doors on %s", device_id)
                    continue
                # Verification means native NET_DVR_GET_CARD readback matched
                # the expected Normal Card, dates, doors and plan, not just
                # 'the Gateway accepted an async job'.
                report = {
                    "status": state, "cardNo": card, "doors": actual,
                    "at": datetime.now(timezone.utc),
                    "error": str(msg.get("error") or "")[:250] if state == "failed" else None,
                }
                await db.employees.update_one(
                    {"_id": employee["_id"], "syncRequestId": request_token},
                    {"$set": {f"hardwareDeviceStatus.{device_id}": report}},
                )
                statuses = (await db.employees.find_one(
                    {"_id": employee["_id"]}, {"hardwareDeviceStatus": 1}
                ) or {}).get("hardwareDeviceStatus") or {}
                card_devices = []
                for target in authorized:
                    device = await db.devices.find_one({"gatewayDeviceId": target}, {"type": 1})
                    if device and device.get("type") == "card":
                        card_devices.append(target)
                if card_devices and all((statuses.get(target) or {}).get("status") == "verified"
                                        for target in card_devices):
                    await db.employees.update_one(
                        {"_id": employee["_id"], "syncRequestId": request_token},
                        {"$set": {"hardwareCardSync": "verified",
                                  "hardwareCardVerifiedAt": datetime.now(timezone.utc)}},
                    )
                elif state == "failed":
                    await db.employees.update_one(
                        {"_id": employee["_id"], "syncRequestId": request_token},
                        {"$set": {"hardwareCardSync": "partial_error"}},
                    )
                continue

            if msg_type == "result":
                request_id = msg.get("requestId")
                fut = gateway_pending.get(request_id)
                if fut and not fut.done():
                    if msg.get("ok"):
                        fut.set_result(msg.get("data"))
                    else:
                        fut.set_exception(RuntimeError(msg.get("error") or "Gateway command failed"))
                continue

            if msg_type == "pong":
                continue
    except WebSocketDisconnect:
        pass
    finally:
        if gateway_id and gateway_connections.get(gateway_id) is websocket:
            gateway_connections.pop(gateway_id, None)
        if gateway_id:
            await db.devices.update_many(
                {"gatewayId": gateway_id},
                {"$set": {"gatewayOnline": False, "status": "offline", "gatewayLastSeen": datetime.now(timezone.utc)}},
            )
            gateway_device_ids = [d.get("gatewayDeviceId") async for d in db.devices.find({"gatewayId": gateway_id}, {"gatewayDeviceId": 1}) if d.get("gatewayDeviceId")]
            if gateway_device_ids:
                await db.doors.update_many(
                    {"gatewayDeviceId": {"$in": gateway_device_ids}},
                    {"$set": {"gatewayOnline": False, "hardwareStatus": "offline", "gatewayLastSeen": datetime.now(timezone.utc)}},
                )


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


# --- Building floor layouts ---

@api_router.get("/layouts")
async def list_layouts(user=Depends(get_current_user)):
    docs = await db.floor_layouts.find({}).sort("floor", 1).to_list(10)
    by_floor = {d["floor"]: d for d in docs}
    return [
        {
            "floor": floor,
            "path": by_floor.get(floor, {}).get("path"),
            "content_type": by_floor.get(floor, {}).get("content_type"),
            "filename": by_floor.get(floor, {}).get("filename"),
        }
        for floor in (1, 2, 3)
    ]


@api_router.post("/upload/layout/{floor}")
async def upload_layout(floor: int, file: UploadFile = File(...), user=Depends(get_current_user)):
    if floor not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Floor must be 1, 2 or 3")
    allowed = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Layout must be JPG, PNG, WEBP or PDF")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Layout must be under 15MB")
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin")
    path = f"{APP_NAME}/layouts/floor-{floor}/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, file.content_type)
    await db.files.insert_one({
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc),
    })
    await db.floor_layouts.update_one(
        {"floor": floor},
        {"$set": {
            "floor": floor,
            "path": result["path"],
            "content_type": file.content_type,
            "filename": file.filename,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": user["email"],
        }},
        upsert=True,
    )
    return {"floor": floor, "path": result["path"], "content_type": file.content_type, "filename": file.filename}


@api_router.put("/doors/{item_id}/placement")
async def place_door(item_id: str, body: DoorPlacement, user=Depends(get_current_user)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid door id")
    if body.floor is not None and body.floor not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Floor must be 1, 2 or 3")
    if body.floor is None:
        updates = {"floor": None, "x": None, "y": None}
    else:
        if body.x is None or body.y is None:
            raise HTTPException(status_code=400, detail="x and y are required when placing a door")
        updates = {
            "floor": body.floor,
            "x": max(1.0, min(99.0, float(body.x))),
            "y": max(1.0, min(99.0, float(body.y))),
        }
    updates["placement_updated_at"] = datetime.now(timezone.utc)
    result = await db.doors.update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Door not found")
    doc = await db.doors.find_one({"_id": oid})
    return doc_id(doc)


# --- Registry: employees / cameras / devices / doors ---

def normalize_door_rights(raw: Optional[dict]) -> dict:
    rights = {}
    if not isinstance(raw, dict):
        return rights
    for device_id, door_numbers in raw.items():
        if not isinstance(door_numbers, list):
            continue
        clean = []
        for number in door_numbers:
            try:
                n = int(number)
            except (TypeError, ValueError):
                continue
            if 1 <= n <= 99 and n not in clean:
                clean.append(n)
        if clean:
            rights[str(device_id)] = clean
    return rights


async def resolve_employee_door_rights(access_level_id: Optional[str], explicit: Optional[dict]) -> tuple[dict, Optional[dict]]:
    if access_level_id:
        try:
            level = await db.access_levels.find_one({"_id": ObjectId(access_level_id)})
        except Exception:
            level = None
        if not level:
            raise HTTPException(status_code=400, detail="Selected access level no longer exists")
        return normalize_door_rights(level.get("doorRights")), level
    return normalize_door_rights(explicit), None


# KERMA_NATIVE_CARD_AUTOSYNC_V5
# For new Kerma V2 staff, the canonical Hikvision Person ID is the full
# 10-digit primary CARD STRING, including leading zeros.
# HCNetSDK DWORD card records may represent this numerically; 0008512250
# therefore corresponds to SDK numeric 8512250 without changing stored ID.
async def ensure_hikvision_employee_identity(employee: dict) -> dict:
    from datetime import timedelta
    from pymongo import ReturnDocument

    card_number = str(employee.get("cardNo") or "").strip()
    if not re.fullmatch(r"[0-9]{10}", card_number):
        raise HTTPException(status_code=400, detail="Card must contain exactly ten ASCII digits")
    numeric_id = int(card_number)
    if not 1 <= numeric_id <= 4294967295:
        raise HTTPException(status_code=400, detail="Card number is outside HCNetSDK numeric Person ID range")

    current_id = str(employee.get("personId") or "").strip()
    if employee.get("source") == "iVMS-4200":
        # Never change a legacy iVMS identifier just because its card differs.
        if not current_id or not current_id.isascii() or not current_id.isdigit():
            raise HTTPException(status_code=409, detail="Imported iVMS Person ID is missing or invalid")
        if not employee.get("validFrom") or not employee.get("validTo"):
            raise HTTPException(
                status_code=409,
                detail="Existing iVMS user validity must be provided; it cannot be replaced by a new three-year term",
            )
    else:
        if current_id and current_id != card_number:
            raise HTTPException(
                status_code=409,
                detail="V2 Person ID and primary card differ; refusing to reassign an existing hardware identity",
            )

        # Reject reuse of an already imported/assigned Person ID, even if the
        # other record stores a numerically equivalent non-padded ID.
        normalized_pattern = "^0*" + str(numeric_id) + "$"
        collision = await db.employees.find_one({
            "_id": {"$ne": employee["_id"]},
            "$or": [
                {"personId": {"$regex": normalized_pattern}},
                {"employeeNo": {"$regex": normalized_pattern}},
                {"employeeNoString": {"$regex": normalized_pattern}},
                {"cardNo": card_number},
                {"cardNos": card_number},
            ],
        })
        if collision:
            raise HTTPException(status_code=409, detail="Card/Person ID already belongs to another employee")

        # Unique Mongo _id reserves the numeric identity atomically for V2.
        # Repeated retries for the SAME employee reuse this reservation.
        reservation = await db.hikvision_person_id_reservations.find_one_and_update(
            {"_id": str(numeric_id)},
            {"$setOnInsert": {"employeeId": str(employee["_id"]), "cardNo": card_number}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if reservation.get("employeeId") != str(employee["_id"]):
            raise HTTPException(status_code=409, detail="Person ID is already reserved for another employee")

        result = await db.employees.update_one(
            {
                "_id": employee["_id"],
                "$or": [
                    {"personId": {"$exists": False}},
                    {"personId": None},
                    {"personId": ""},
                    {"personId": card_number},
                ],
            },
            {"$set": {"personId": card_number}},
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=409, detail="Person ID changed during enrollment")
        current_id = card_number

    begin = employee.get("validFrom")
    finish = employee.get("validTo")
    if bool(begin) != bool(finish):
        raise HTTPException(status_code=400, detail="Both card validity dates are required")
    if not begin:
        from zoneinfo import ZoneInfo
        zone = ZoneInfo("America/Monterrey")
        created = employee.get("created_at")
        if isinstance(created, datetime):
            # Motor decodes BSON UTC timestamps as naive by default; treat as UTC,
            # not as the Windows/Railway server-local timezone.
            created_utc = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
            started_day = created_utc.astimezone(zone).date()
        else:
            started_day = datetime.now(zone).date()
        try:
            end_day = started_day.replace(year=started_day.year + 3) - timedelta(days=1)
        except ValueError:  # Leap day
            end_day = started_day.replace(year=started_day.year + 3, day=28) - timedelta(days=1)
        begin = f"{started_day.isoformat()}T00:00:00"
        finish = f"{end_day.isoformat()}T23:59:59"
        await db.employees.update_one(
            {"_id": employee["_id"]},
            {"$set": {"validFrom": begin, "validTo": finish}},
        )

    try:
        a, b = datetime.fromisoformat(str(begin)), datetime.fromisoformat(str(finish))
        if a.tzinfo or b.tzinfo or a >= b or not 1970 <= a.year <= 2037 or b.year > 2037:
            raise ValueError("out of range")
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid local card validity dates") from exc
    return {**employee, "personId": current_id, "validFrom": str(begin), "validTo": str(finish)}


async def sync_employee_to_gateway(employee: dict):
    employee = await ensure_hikvision_employee_identity(employee)
    cards = employee.get("cardNos")
    if not isinstance(cards, list):
        cards = [employee.get("cardNo")] if employee.get("cardNo") else []
    cards = [str(c).strip() for c in cards if str(c or "").strip()]
    credentials = [{"type": "card", "value": c} for c in cards]
    # Do not distribute a biometric image when the employee has not been
    # explicitly authorized for any facial terminal in the V2 device registry.
    door_rights = normalize_door_rights(employee.get("doorRights"))
    face_targets = await db.devices.count_documents({
        "type": "face", "gatewayDeviceId": {"$in": list(door_rights)}
    })
    if employee.get("photoPath") and face_targets:
        try:
            photo_bytes, _ = await get_object(employee["photoPath"])
        except Exception as e:
            logger.exception("Face photo could not be loaded for enrollment")
            raise HTTPException(status_code=502, detail="Face photo could not be loaded for device enrollment") from e
        try:
            jpeg_bytes = encode_hikvision_face_jpeg(photo_bytes)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid face photo for Hikvision: {exc}",
            ) from exc
        credentials.append({
            "type": "face",
            "imageBase64": base64.b64encode(jpeg_bytes).decode("ascii"),
            "contentType": "image/jpeg",
        })

    person_id = str(employee["personId"])
    # Fresh request tokens make stale queued Gateway jobs ineligible to
    # report a success for a later, different set of doors.
    sync_request_id = uuid.uuid4().hex
    await db.employees.update_one(
        {"_id": employee["_id"]},
        {"$set": {"syncRequestId": sync_request_id, "hardwareDeviceStatus": {},
                  "hardwareCardSync": "pending"}},
    )
    return await send_gateway_command({
        "kind": "person.upsert",
        "person": {
            "id": person_id,
            "syncRequestId": sync_request_id,
            "name": str(employee.get("name") or "").strip(),
            "userType": "normal",
            "validFrom": str(employee["validFrom"]),
            "validTo": str(employee["validTo"]),
            "doorRights": door_rights,
        },
        "credentials": credentials,
    })


@api_router.get("/access-levels")
async def list_access_levels(user=Depends(get_current_user)):
    docs = await db.access_levels.find().sort("name", 1).to_list(200)
    return [doc_id(d) for d in docs]


@api_router.post("/access-levels")
async def create_access_level(body: AccessLevelIn, user=Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Access level name is required")
    if await db.access_levels.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="An access level with this name already exists")
    rights = normalize_door_rights(body.doorRights)
    if not rights:
        raise HTTPException(status_code=400, detail="Select at least one physical access point")
    doc = {
        "name": name,
        "description": body.description.strip(),
        "doorRights": rights,
        "created_at": datetime.now(timezone.utc),
        "created_by": user["email"],
    }
    r = await db.access_levels.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.put("/access-levels/{item_id}")
async def update_access_level(item_id: str, body: AccessLevelIn, user=Depends(get_current_user)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid access level id")
    name = body.name.strip()
    rights = normalize_door_rights(body.doorRights)
    if not name or not rights:
        raise HTTPException(status_code=400, detail="Name and at least one access point are required")
    await db.access_levels.update_one(
        {"_id": oid},
        {"$set": {
            "name": name,
            "description": body.description.strip(),
            "doorRights": rights,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": user["email"],
        }},
    )
    level = await db.access_levels.find_one({"_id": oid})
    if not level:
        raise HTTPException(status_code=404, detail="Access level not found")

    employees = await db.employees.find({"accessLevelId": item_id}).to_list(500)
    for employee in employees:
        await db.employees.update_one(
            {"_id": employee["_id"]},
            {"$set": {"level": name, "doorRights": rights, "hardwareSync": "pending"}},
        )
        employee["level"] = name
        employee["doorRights"] = rights
        try:
            await sync_employee_to_gateway(employee)
            await db.employees.update_one(
                {"_id": employee["_id"]},
                {"$set": {"hardwareSync": "queued", "hardwareQueuedAt": datetime.now(timezone.utc)}},
            )
        except Exception as e:
            logger.warning("Access-level resync failed for %s: %s", employee.get("name"), e)

    return doc_id(level)


@api_router.delete("/access-levels/{item_id}")
async def delete_access_level(item_id: str, user=Depends(get_current_user)):
    if await db.employees.find_one({"accessLevelId": item_id}):
        raise HTTPException(status_code=409, detail="This access level is assigned to one or more employees")
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid access level id")
    result = await db.access_levels.delete_one({"_id": oid})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Access level not found")
    return {"ok": True}


# Commander-only read-only roster reconciliation.
# Historic iVMS data is merely a comparison reference, NOT a source of truth
# and not a live readback from Hikvision devices. Never creates/updates staff.
@api_router.get("/employees/comparison")
async def compare_historic_ivms_roster(user=Depends(require_commander)):
    reference_file = ROOT_DIR / "legacy_ivms_roster_reference.json"
    if not reference_file.is_file():
        raise HTTPException(status_code=503, detail="Historical iVMS comparison reference is unavailable")
    reference = json.loads(reference_file.read_text(encoding="utf-8"))
    historical = reference.get("employees") or []
    current = await db.employees.find(
        {}, {"name": 1, "personId": 1, "cardNo": 1, "cardNos": 1, "source": 1}
    ).to_list(2000)
    current_by_id = {}
    for person in current:
        key = str(person.get("personId") or "").strip()
        if key:
            current_by_id.setdefault(key, []).append(person)

    matched_object_ids = set()
    rows = []
    for item in historical:
        person_id = str(item.get("personId") or "").strip()
        hits = current_by_id.get(person_id, [])
        old_cards = sorted(str(x).strip() for x in (item.get("cardNos") or []) if str(x).strip())
        if not hits:
            rows.append({
                "personId": person_id, "historicalName": item.get("name"),
                "currentName": None, "historicalCards": old_cards,
                "currentCards": [], "status": "not_in_v2",
                "description": "Not present in the current approved V2 roster; no automatic re-enrollment.",
            })
            continue
        person = hits[0]
        matched_object_ids.add(person["_id"])
        current_cards = person.get("cardNos") or ([person.get("cardNo")] if person.get("cardNo") else [])
        current_cards = sorted(str(x).strip() for x in current_cards if str(x).strip())
        same_name = str(item.get("name") or "").strip().casefold() == str(person.get("name") or "").strip().casefold()
        same_cards = old_cards == current_cards
        status = "duplicate_in_v2" if len(hits) > 1 else "match" if same_name and same_cards else "different"
        for extra in hits[1:]:
            matched_object_ids.add(extra["_id"])
        rows.append({
            "personId": person_id, "historicalName": item.get("name"),
            "currentName": person.get("name"), "historicalCards": old_cards,
            "currentCards": current_cards, "status": status,
            "description": "Duplicate Person ID in V2" if len(hits) > 1 else None,
        })

    for person in current:
        if person["_id"] in matched_object_ids:
            continue
        current_cards = person.get("cardNos") or ([person.get("cardNo")] if person.get("cardNo") else [])
        rows.append({
            "personId": str(person.get("personId") or ""),
            "historicalName": None, "currentName": person.get("name"),
            "historicalCards": [], "currentCards": [str(x) for x in current_cards if x],
            "status": "v2_only",
            "description": "Exists in V2 but not in this historical reference.",
        })

    counts = {
        "match": sum(x["status"] == "match" for x in rows),
        "different": sum(x["status"] == "different" for x in rows),
        "not_in_v2": sum(x["status"] == "not_in_v2" for x in rows),
        "v2_only": sum(x["status"] == "v2_only" for x in rows),
        "duplicate_in_v2": sum(x["status"] == "duplicate_in_v2" for x in rows),
    }
    return {
        "source": "Historical iVMS-4200 import snapshot",
        "sourceIsLive": False, "readOnly": True, "automaticReenrollment": False,
        "comparisonAt": datetime.now(timezone.utc),
        "historicalCount": len(historical), "currentCount": len(current),
        "counts": counts, "rows": rows,
        "disclaimer": "A missing row does not prove who deleted it or whether credentials remain installed on physical devices.",
    }


@api_router.get("/employees")
async def list_employees(user=Depends(require_enrollment)):
    docs = await db.employees.find().sort("created_at", -1).to_list(500)
    return [doc_id(d) for d in docs]


@api_router.post("/employees")
async def create_employee(body: EmployeeIn, user=Depends(require_enrollment)):
    card_no = str(body.cardNo or "").strip()
    if not card_no.isdigit() or len(card_no) != 10:
        raise HTTPException(status_code=400, detail="Card number must be exactly 10 digits, including leading zeros")
    if await db.employees.find_one({"$or": [{"cardNo": card_no}, {"cardNos": card_no}]}):
        raise HTTPException(status_code=409, detail="This card number is already assigned")
    if body.personId and str(body.personId).strip() != card_no:
        raise HTTPException(status_code=400, detail="For new V2 employees, Person ID must equal the full card number")

    door_rights, access_level = await resolve_employee_door_rights(body.accessLevelId, body.doorRights)
    if not door_rights:
        raise HTTPException(status_code=400, detail="Select an access level with at least one access point")

    doc = body.model_dump()
    doc["cardNo"] = card_no
    doc["cardNos"] = [card_no]
    doc["faceSync"] = False  # A photo is not proof of device enrollment.
    doc["faceMatch"] = None
    doc["doorRights"] = door_rights
    if access_level:
        doc["level"] = access_level.get("name") or body.level
        doc["accessLevelId"] = str(access_level["_id"])
    doc["created_at"] = datetime.now(timezone.utc)
    doc["created_by"] = user["email"]
    doc["hardwareSync"] = "pending"
    r = await db.employees.insert_one(doc)
    doc["_id"] = r.inserted_id

    try:
        await sync_employee_to_gateway(doc)
        doc = await db.employees.find_one({"_id": doc["_id"]}) or doc
    except Exception:
        await db.employees.delete_one({"_id": r.inserted_id})
        raise

    synced_at = datetime.now(timezone.utc)
    await db.employees.update_one(
        {"_id": r.inserted_id},
        {"$set": {"hardwareSync": "queued", "hardwareQueuedAt": synced_at}},
    )
    doc["hardwareSync"] = "queued"
    doc["hardwareQueuedAt"] = synced_at
    return doc_id(doc)


@api_router.put("/employees/{item_id}")
async def update_employee(item_id: str, body: EmployeeUpdate, user=Depends(require_enrollment)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee id")
    existing = await db.employees.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    cards = updates.get("cardNos")
    if cards is not None:
        normalized = []
        for card in cards:
            card = str(card).strip()
            if card:
                if not card.isdigit() or len(card) != 10:
                    raise HTTPException(status_code=400, detail="Every card number must be exactly 10 digits")
                normalized.append(card)
        updates["cardNos"] = normalized
        updates["cardNo"] = normalized[0] if normalized else ""
    elif "cardNo" in updates:
        card = str(updates["cardNo"]).strip()
        if card and (not card.isdigit() or len(card) != 10):
            raise HTTPException(status_code=400, detail="Card number must be exactly 10 digits")
        updates["cardNo"] = card
        updates["cardNos"] = [card] if card else []

    if existing.get("source") != "iVMS-4200":
        existing_id = str(existing.get("personId") or "").strip()
        new_card = str(updates.get("cardNo", existing.get("cardNo") or "")).strip()
        proposed_id = str(updates.get("personId") or "").strip() if "personId" in updates else existing_id
        if existing_id and (new_card != existing_id or proposed_id != existing_id):
            raise HTTPException(
                status_code=409,
                detail="Changing a V2 card/Person ID requires a controlled hardware identity migration",
            )
        if not existing_id and proposed_id and proposed_id != new_card:
            raise HTTPException(status_code=409, detail="V2 Person ID must equal primary card number")

    if updates.get("name") is not None:
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(status_code=400, detail="Name is required")

    if "accessLevelId" in updates:
        rights, access_level = await resolve_employee_door_rights(updates.get("accessLevelId"), updates.get("doorRights"))
        if access_level:
            updates["level"] = access_level.get("name") or updates.get("level") or existing.get("level")
            updates["accessLevelId"] = str(access_level["_id"])
        updates["doorRights"] = rights
    elif "doorRights" in updates:
        updates["doorRights"] = normalize_door_rights(updates.get("doorRights"))

    if "photoPath" in updates and updates["photoPath"] != existing.get("photoPath"):
        updates["faceSync"] = False
        updates["faceMatch"] = None

    updates["updated_at"] = datetime.now(timezone.utc)
    updates["updated_by"] = user["email"]
    updates["hardwareSync"] = "pending"
    await db.employees.update_one({"_id": oid}, {"$set": updates})
    doc = await db.employees.find_one({"_id": oid})

    try:
        await sync_employee_to_gateway(doc)
        doc = await db.employees.find_one({"_id": doc["_id"]}) or doc
    except Exception as e:
        await db.employees.update_one(
            {"_id": oid},
            {"$set": {"hardwareSync": "error", "hardwareSyncError": str(e)}},
        )
        raise HTTPException(status_code=502, detail=f"Employee saved, but hardware sync failed: {e}")

    synced_at = datetime.now(timezone.utc)
    await db.employees.update_one(
        {"_id": oid},
        {"$set": {"hardwareSync": "queued", "hardwareQueuedAt": synced_at}, "$unset": {"hardwareSyncError": ""}},
    )
    doc["hardwareSync"] = "queued"
    doc["hardwareQueuedAt"] = synced_at
    return doc_id(doc)


@api_router.post("/employees/{item_id}/retry-sync")
async def retry_employee_sync(item_id: str, user=Depends(require_manual_sync)):
    # A retry uses existing explicit door rights. No second employee is created.
    try:
        oid = ObjectId(item_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid employee ID") from exc
    employee = await db.employees.find_one({"_id": oid})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not normalize_door_rights(employee.get("doorRights")):
        raise HTTPException(status_code=400, detail="Employee has no explicit authorized doors")
    await db.employees.update_one(
        {"_id": oid},
        {"$set": {"hardwareSync": "pending"}, "$unset": {"hardwareSyncError": ""}},
    )
    try:
        result = await sync_employee_to_gateway(employee)
    except Exception as exc:
        await db.employees.update_one(
            {"_id": oid}, {"$set": {"hardwareSync": "error", "hardwareSyncError": str(exc)}}
        )
        raise HTTPException(status_code=502, detail=f"Gateway queue failed: {exc}") from exc

    at = datetime.now(timezone.utc)
    await db.employees.update_one(
        {"_id": oid}, {"$set": {"hardwareSync": "queued", "hardwareQueuedAt": at}},
    )
    fresh = await db.employees.find_one({"_id": oid})
    return {
        "ok": True,
        "queued": True,
        "hardwareVerified": False,
        "personId": fresh.get("personId"),
        "validFrom": fresh.get("validFrom"),
        "validTo": fresh.get("validTo"),
        "doorRights": normalize_door_rights(fresh.get("doorRights")),
        "gateway": result,
    }


@api_router.delete("/employees/{item_id}")
async def delete_employee(item_id: str, user=Depends(require_enrollment)):
    r = await db.employees.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}


@api_router.get("/cameras")
async def list_cameras(user=Depends(require_cctv)):
    docs = await db.cameras.find().sort("created_at", 1).to_list(500)
    return [doc_id(d) for d in docs]


@api_router.post("/cameras")
async def create_camera(body: CameraIn, user=Depends(require_cctv)):
    count = await db.cameras.count_documents({})
    doc = body.model_dump()
    doc["code"] = f"CAM-{count + 1:02d}"
    doc["status"] = "live"
    doc["created_at"] = datetime.now(timezone.utc)
    r = await db.cameras.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.get("/cameras/{camera_id}/snapshot")
async def camera_snapshot(camera_id: str, user=Depends(require_cctv)):
    try:
        oid = ObjectId(camera_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid camera id")

    cam = await db.cameras.find_one({"_id": oid})
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not cam.get("nvrIp") or not cam.get("channelNo"):
        raise HTTPException(status_code=400, detail="Camera is not linked to a synced NVR channel")

    result = await send_gateway_command({
        "kind": "nvr.snapshot",
        "nvr": {
            "id": cam.get("nvr") or "",
            "name": cam.get("nvrName") or "NVR",
            "ip": cam.get("nvrIp"),
        },
        "channelNo": int(cam.get("channelNo")),
    })

    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="Local gateway returned an invalid snapshot response")

    encoded = result.get("imageBase64") or result.get("base64") or result.get("data")
    if not encoded:
        raise HTTPException(status_code=502, detail="Local gateway did not return a camera snapshot")

    try:
        image_bytes = base64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=502, detail="Local gateway returned an invalid snapshot payload")

    return Response(
        content=image_bytes,
        media_type=result.get("contentType") or "image/jpeg",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@api_router.delete("/cameras/{item_id}")
async def delete_camera(item_id: str, user=Depends(require_cctv)):
    r = await db.cameras.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"ok": True}


@api_router.get("/devices")
async def list_devices(user=Depends(get_current_user)):
    query = {} if effective_permissions(user)["cctv"] else {"type": {"$ne": "nvr"}}
    docs = await db.devices.find(query).sort("created_at", 1).to_list(500)
    return [doc_id(d) for d in docs]


@api_router.post("/devices")
async def create_device(body: DeviceIn, user=Depends(get_current_user)):
    if body.type not in {"gateway", "nvr", "face", "card"}:
        raise HTTPException(status_code=400, detail="Device type must be gateway, nvr, face or card")
    if body.type == "nvr":
        ensure_permission(user, "cctv")
    doc = body.model_dump()
    doc["status"] = "online"
    doc["created_at"] = datetime.now(timezone.utc)
    r = await db.devices.insert_one(doc)
    doc["_id"] = r.inserted_id
    return doc_id(doc)


@api_router.delete("/devices/{item_id}")
async def delete_device(item_id: str, user=Depends(get_current_user)):
    try:
        existing = await db.devices.find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid device ID")
    if existing and existing.get("type") == "nvr":
        ensure_permission(user, "cctv")
    r = await db.devices.delete_one({"_id": ObjectId(item_id)})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.cameras.update_many({"nvr": item_id}, {"$set": {"nvr": "", "nvrName": ""}})
    return {"ok": True}


@api_router.post("/devices/{item_id}/sync-nvr-channels")
async def sync_nvr_channels(item_id: str, user=Depends(require_cctv)):
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid NVR id")
    device = await db.devices.find_one({"_id": oid})
    if not device:
        raise HTTPException(status_code=404, detail="NVR not found")
    if device.get("type") != "nvr":
        raise HTTPException(status_code=400, detail="Device is not an NVR")
    if not device.get("ip"):
        raise HTTPException(status_code=400, detail="NVR IP address is missing")

    gateway_result = await send_gateway_command({
        "kind": "nvr.channels",
        "nvr": {
            "id": item_id,
            "name": device.get("name") or "NVR",
            "ip": device.get("ip"),
        },
    })

    channels = gateway_result.get("channels") if isinstance(gateway_result, dict) else None
    if not isinstance(channels, list):
        raise HTTPException(
            status_code=502,
            detail="Local gateway did not return an NVR channel list. Update the Kerma local gateway with NVR channel discovery support.",
        )

    synced = []
    now = datetime.now(timezone.utc)
    for raw in channels:
        try:
            channel_no = int(raw.get("channelNo") or raw.get("channel") or raw.get("id"))
        except Exception:
            continue
        if channel_no < 1:
            continue

        label = str(raw.get("name") or raw.get("label") or f"CHANNEL {channel_no}").strip()
        if not label:
            label = f"CHANNEL {channel_no}"

        enabled = bool(raw.get("enabled", True))
        rtsp_path = str(raw.get("rtspPath") or f"/Streaming/Channels/{channel_no}01")
        code = f"{device.get('name') or 'NVR'}-CH{channel_no:02d}"

        existing = await db.cameras.find_one({"nvr": item_id, "channelNo": channel_no})
        fields = {
            "label": label,
            "location": str(raw.get("location") or ""),
            "nvr": item_id,
            "nvrName": device.get("name") or "",
            "nvrIp": device.get("ip"),
            "channelNo": channel_no,
            "rtspPath": rtsp_path,
            "status": "live" if enabled else "offline",
            "source": "nvr-sync",
            "updated_at": now,
        }
        if existing:
            await db.cameras.update_one({"_id": existing["_id"]}, {"$set": fields})
            cam = await db.cameras.find_one({"_id": existing["_id"]})
        else:
            fields.update({
                "code": code,
                "rtsp": "",
                "img": None,
                "created_at": now,
            })
            r = await db.cameras.insert_one(fields)
            cam = await db.cameras.find_one({"_id": r.inserted_id})
        synced.append(doc_id(cam))

    await db.devices.update_one(
        {"_id": oid},
        {"$set": {
            "channelCount": len(synced),
            "lastChannelSync": now,
            "lastChannelSyncBy": user["email"],
        }},
    )
    return {
        "ok": True,
        "nvr": {"id": item_id, "name": device.get("name"), "ip": device.get("ip")},
        "count": len(synced),
        "channels": synced,
    }


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


@api_router.post("/doors/{item_id}/command")
async def command_door(item_id: str, request: Request, user=Depends(get_current_user)):
    try:
        door = await db.doors.find_one({"_id": ObjectId(item_id)})
    except Exception:
        door = None
    if not door:
        raise HTTPException(status_code=404, detail="Door not found")
    body = await request.json()
    cmd = str(body.get("cmd") or "open")
    if cmd not in {"open", "close", "alwaysOpen", "alwaysClose"}:
        raise HTTPException(status_code=400, detail="Invalid door command")
    gateway_device_id = door.get("gatewayDeviceId")
    door_no = door.get("doorNo")
    if not gateway_device_id or not door_no:
        raise HTTPException(status_code=400, detail="This door is not linked to a physical access controller")
    try:
        data = await send_gateway_command({
            "kind": "door.open",
            "deviceId": gateway_device_id,
            "doorNo": int(door_no),
            "cmd": cmd,
        })
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    new_status = "unlocked" if cmd in {"open", "alwaysOpen"} else "locked"
    await db.doors.update_one({"_id": door["_id"]}, {"$set": {"status": new_status, "lastCommand": cmd, "lastCommandAt": datetime.now(timezone.utc)}})
    return {"ok": True, "status": new_status, "gateway": data}



# --- Emergency egress release / intentionally disabled until onsite commissioning ---
# This is a SUPPLEMENTAL remote command facility, never the primary fire-egress system.
# Local certified fire alarm release and mechanical egress must work without the cloud.
class EmergencyDoorSelection(BaseModel):
    eligible: bool


class EmergencyReleaseConfirmation(BaseModel):
    confirmation: str


def emergency_release_armed() -> bool:
    return os.environ.get("EMERGENCY_RELEASE_ENABLED", "false").lower() in {"1", "true", "yes"}


async def emergency_egress_doors() -> list:
    docs = await db.doors.find({"emergencyEgress": True}).sort("created_at", 1).to_list(200)
    return docs


def emergency_door_info(d: dict) -> dict:
    return {
        "id": str(d["_id"]), "name": d.get("name") or d.get("code") or "Unnamed door",
        "code": d.get("code"), "floor": d.get("floor"), "zone": d.get("zone"),
        "eligible": bool(d.get("emergencyEgress", False)),
        "linked": bool(d.get("gatewayDeviceId") and d.get("doorNo")),
        "gatewayOnline": bool(d.get("gatewayOnline")),
        "doorNo": d.get("doorNo"),
    }


def validate_emergency_targets(doors: list) -> None:
    if not doors:
        raise HTTPException(status_code=409, detail="No emergency egress doors configured")
    if len(doors) > 64:
        raise HTTPException(status_code=409, detail="More than 64 egress doors: review configuration")
    seen = set()
    for door in doors:
        device_id, door_no = door.get("gatewayDeviceId"), door.get("doorNo")
        if not device_id or not isinstance(door_no, int) or door_no < 1:
            raise HTTPException(status_code=409, detail="An emergency egress door has no valid physical controller mapping")
        physical = (str(device_id), door_no)
        if physical in seen:
            raise HTTPException(status_code=409, detail="Duplicate physical emergency door mapping: correct configuration")
        seen.add(physical)


@api_router.get("/emergency/status")
async def emergency_status(user=Depends(require_commander)):
    doors = await db.doors.find({}, {
        "name": 1, "code": 1, "floor": 1, "zone": 1, "emergencyEgress": 1,
        "gatewayDeviceId": 1, "doorNo": 1, "gatewayOnline": 1, "created_at": 1,
    }).sort("created_at", 1).to_list(200)
    recent = await db.emergency_release_incidents.find(
        {}, {"_id": 0, "actorId": 0, "sourceIp": 0, "userAgent": 0}
    ).sort("startedAt", -1).to_list(8)
    return {
        "armed": emergency_release_armed(),
        "singleDoorTestEnabled": single_door_test_enabled() and not emergency_release_armed(),
        "singleDoorTest": single_test_public(await db.emergency_single_test_state.find_one({"_id": "kerma-single-door"})),
        "gatewayOnline": "kerma-monterrey" in gateway_connections,
        "doors": [emergency_door_info(d) for d in doors],
        "recent": recent,
        "warning": "Gateway acknowledgement is not physical door verification. Local independent fire-egress release is required.",
    }


class EmergencyBulkSelection(BaseModel):
    mode: str
    confirmation: str


@api_router.put("/emergency/doors/bulk")
async def bulk_configure_emergency_doors(body: EmergencyBulkSelection, user=Depends(require_commander)):
    # Configuration occurs ahead of an incident, NEVER while the system is armed.
    # This endpoint does not communicate with access controllers.
    if emergency_release_armed():
        raise HTTPException(status_code=423, detail="Disable live release before changing the evacuation group")
    if body.confirmation != "CONFIGURAR" or body.mode not in {"select_all_mapped", "clear_all"}:
        raise HTTPException(status_code=400, detail="Invalid bulk action or missing CONFIGURAR confirmation")

    count = await db.doors.count_documents({})
    if count > 200:
        raise HTTPException(status_code=409, detail="More than 200 doors: review inventory before bulk configuration")
    docs = await db.doors.find({}, {
        "gatewayDeviceId": 1, "doorNo": 1, "emergencyEgress": 1,
    }).to_list(200)
    now = datetime.now(timezone.utc)
    if body.mode == "select_all_mapped":
        # ONLY physically mapped entries. Do not send commands, and do not
        # interpret controller linkage as fire-safety certification.
        selected = [
            d for d in docs
            if isinstance(d.get("gatewayDeviceId"), str)
            and d["gatewayDeviceId"].strip()
            and isinstance(d.get("doorNo"), int)
            and not isinstance(d.get("doorNo"), bool)
            and d["doorNo"] >= 1
        ]
        validate_emergency_targets(selected)
        selected_ids = [d["_id"] for d in selected]
        # Remove obsolete/unmapped selections, then store the reviewed group.
        await db.doors.update_many(
            {"_id": {"$nin": selected_ids}, "emergencyEgress": True},
            {"$set": {"emergencyEgress": False, "emergencyEgressUpdatedAt": now,
                      "emergencyEgressUpdatedBy": user.get("email")}},
        )
        await db.doors.update_many(
            {"_id": {"$in": selected_ids}},
            {"$set": {"emergencyEgress": True, "emergencyEgressUpdatedAt": now,
                      "emergencyEgressUpdatedBy": user.get("email")}},
        )
    else:
        selected = []
        await db.doors.update_many(
            {"emergencyEgress": True},
            {"$set": {"emergencyEgress": False, "emergencyEgressUpdatedAt": now,
                      "emergencyEgressUpdatedBy": user.get("email")}},
        )

    await db.emergency_release_audit.insert_one({
        "type": "bulk_configuration", "mode": body.mode,
        "selectedCount": len(selected), "inventoryCount": count,
        "actor": user.get("email"), "at": now,
        "requiresSiteApproval": True,
    })
    return {
        "ok": True, "mode": body.mode, "selectedCount": len(selected),
        "inventoryCount": count, "hardwareCommandsSent": 0,
        "message": "Preconfigured only. Site approval is required before enabling live release.",
    }


@api_router.put("/emergency/doors/{item_id}")
async def configure_emergency_door(item_id: str, body: EmergencyDoorSelection, user=Depends(require_commander)):
    if emergency_release_armed():
        raise HTTPException(status_code=423, detail="Disable live release before editing the evacuation group")
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid door ID")
    door = await db.doors.find_one({"_id": oid})
    if not door:
        raise HTTPException(status_code=404, detail="Door not found")
    if body.eligible and (not door.get("gatewayDeviceId") or not isinstance(door.get("doorNo"), int) or door.get("doorNo") < 1):
        raise HTTPException(status_code=400, detail="Only physically mapped doors can be marked for emergency egress")
    await db.doors.update_one({"_id": oid}, {"$set": {
        "emergencyEgress": body.eligible, "emergencyEgressUpdatedAt": datetime.now(timezone.utc),
        "emergencyEgressUpdatedBy": user.get("email"),
    }})
    await db.emergency_release_audit.insert_one({
        "type": "configuration", "doorId": item_id, "eligible": body.eligible,
        "actor": user.get("email"), "at": datetime.now(timezone.utc),
    })
    return {"ok": True, "doorId": item_id, "eligible": body.eligible}


@api_router.post("/emergency/simulate")
async def simulate_emergency_release(request: Request, user=Depends(require_commander)):
    doors = await emergency_egress_doors()
    validate_emergency_targets(doors)
    incident_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    results = [{
        **emergency_door_info(d), "result": "SIMULATED_NO_HARDWARE_COMMAND",
    } for d in doors]
    record = {
        "incidentId": incident_id, "mode": "simulation", "state": "completed",
        "startedAt": now, "completedAt": now, "actor": user.get("email"),
        "actorId": str(user.get("_id")), "sourceIp": request.client.host if request.client else None,
        "userAgent": str(request.headers.get("user-agent") or "")[:256],
        "results": results, "count": len(results),
    }
    await db.emergency_release_incidents.insert_one(record)
    return {"ok": True, "incidentId": incident_id, "mode": "simulation", "results": results}


# Administrative closure ONLY: this endpoint deliberately has no gateway calls.
# A simulation never actuates physical access hardware and does not require
# physical re-locking. A real emergency must remain open to onsite procedures.
class EmergencySimulationClosure(BaseModel):
    confirmation: str


@api_router.post("/emergency/simulations/{incident_id}/close")
async def close_emergency_simulation(
    incident_id: str,
    body: EmergencySimulationClosure,
    request: Request,
    user=Depends(require_commander),
):
    if not re.fullmatch(r"[0-9a-f]{32}", incident_id):
        raise HTTPException(status_code=400, detail="Invalid incident ID")
    if body.confirmation != "FINALIZAR":
        raise HTTPException(status_code=400, detail="Confirmation FINALIZAR is required")

    from pymongo import ReturnDocument

    now = datetime.now(timezone.utc)
    closed = await db.emergency_release_incidents.find_one_and_update(
        {"incidentId": incident_id, "mode": "simulation", "state": "completed"},
        {"$set": {
            "state": "closed",
            "closedAt": now,
            "closedBy": user.get("email"),
            "closureType": "administrative_simulation_only",
            "closureNote": "No access-controller commands were sent by this operation.",
        }},
        return_document=ReturnDocument.AFTER,
    )
    if not closed:
        existing = await db.emergency_release_incidents.find_one(
            {"incidentId": incident_id}, {"mode": 1, "state": 1}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Simulation incident not found")
        if existing.get("mode") != "simulation":
            raise HTTPException(status_code=409, detail="Live emergency incidents cannot be closed via simulation controls")
        raise HTTPException(status_code=409, detail="Simulation has already been closed or cannot be closed")

    await db.emergency_release_audit.insert_one({
        "type": "simulation_closed", "incidentId": incident_id,
        "actor": user.get("email"), "at": now,
        "sourceIp": request.client.host if request.client else None,
        "hardwareCommandsSent": 0,
    })
    return {
        "ok": True, "incidentId": incident_id,
        "mode": "simulation", "state": "closed",
        "closedAt": now, "hardwareCommandsSent": 0,
        "physicalDoorsChanged": False,
    }



# --- Isolated physical commissioning of EXACTLY ONE preselected door ---
# Never changes /emergency/activate: broad release remains independently disabled.
def single_door_test_enabled() -> bool:
    return os.environ.get("EMERGENCY_SINGLE_DOOR_TEST_ENABLED", "false").lower() in {"1", "true", "yes"}


class SingleDoorTestStart(BaseModel):
    doorId: str
    confirmation: str
    supervisedOnSite: bool
    egressClear: bool
    localRestorationReady: bool


class SingleDoorTestRestore(BaseModel):
    testId: str
    confirmation: str
    supervisedOnSite: bool
    egressClear: bool
    emergencyEnded: bool


class SingleDoorTestFinish(BaseModel):
    testId: str
    confirmation: str
    physicallyVerified: bool
    safeEgressVerified: bool


def single_test_public(doc: Optional[dict]) -> Optional[dict]:
    if not doc or doc.get("state") in {"idle", "closed"}:
        return None
    return {
        "testId": doc.get("testId"),
        "doorId": doc.get("doorId"),
        "doorName": doc.get("doorName"),
        "state": doc.get("state"),
        "startedAt": doc.get("startedAt"),
        "updatedAt": doc.get("updatedAt"),
        "operator": doc.get("operator"),
        "gatewayAcknowledged": doc.get("state") in {"release_acknowledged", "restore_sending", "restore_acknowledged"},
        "warning": "Gateway acknowledgement does not prove a physical unlock or relock.",
    }


@api_router.post("/emergency/test-door/start")
async def start_single_emergency_test(body: SingleDoorTestStart, request: Request, user=Depends(require_commander)):
    if not single_door_test_enabled() or emergency_release_armed():
        raise HTTPException(status_code=423, detail="Single-door commissioning is not enabled separately from the emergency bulk release")
    if body.confirmation != "PROBAR" or not all([body.supervisedOnSite, body.egressClear, body.localRestorationReady]):
        raise HTTPException(status_code=400, detail="Supervised physical test checklist and PROBAR confirmation are required")
    try:
        oid = ObjectId(body.doorId)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid door")
    door = await db.doors.find_one({"_id": oid, "emergencyEgress": True})
    if not door:
        raise HTTPException(status_code=404, detail="Choose one existing emergency-group door")
    validate_emergency_targets([door])
    physical_device = await db.devices.find_one({"gatewayDeviceId": door["gatewayDeviceId"]}, {"type": 1})
    if physical_device and physical_device.get("type") == "face":
        raise HTTPException(status_code=409,
            detail="Facial terminal returned only a momentary pulse during on-site testing. "
                   "Sustained release is NOT verified; use approved independent egress hardware.")
    if "kerma-monterrey" not in gateway_connections:
        raise HTTPException(status_code=503, detail="Local Gateway offline: no physical test attempted")
    from pymongo.errors import DuplicateKeyError
    from pymongo import ReturnDocument
    now = datetime.now(timezone.utc)
    test_id = uuid.uuid4().hex
    # A single persistent record is a cross-browser/process interlock.
    # When a command times out it remains blocked until physical verification.
    try:
        pending = await db.emergency_single_test_state.find_one_and_update(
            {
                "_id": "kerma-single-door",
                "$or": [{"state": {"$in": ["idle", "closed"]}}, {"state": {"$exists": False}}],
            },
            {"$set": {
                "state": "release_sending", "testId": test_id,
                "doorId": body.doorId, "doorName": door.get("name") or door.get("code"),
                "deviceId": door["gatewayDeviceId"], "doorNo": int(door["doorNo"]),
                "startedAt": now, "updatedAt": now, "operator": user.get("email"),
            }},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Another single-door test is not fully restored and closed")
    if not pending or pending.get("testId") != test_id:
        raise HTTPException(status_code=409, detail="Another single-door test is in progress")

    await db.emergency_release_audit.insert_one({
        "type": "single_door_test_started", "testId": test_id,
        "doorId": body.doorId, "doorName": pending["doorName"],
        "actor": user.get("email"), "at": now,
        "sourceIp": request.client.host if request.client else None,
        "supervisedOnSite": True, "localRestorationReady": True,
    })
    state = "release_unknown"
    error = None
    try:
        # EXACTLY ONE command; cannot dispatch the bulk emergency release.
        await send_gateway_command({
            "kind": "door.open",
            "deviceId": pending["deviceId"],
            "doorNo": pending["doorNo"],
            "cmd": "alwaysOpen",
        })
        state = "release_acknowledged"
    except Exception as exc:
        error = str(exc)[:240]
    await db.emergency_single_test_state.update_one(
        {"_id": "kerma-single-door", "testId": test_id, "state": "release_sending"},
        {"$set": {"state": state, "updatedAt": datetime.now(timezone.utc)}},
    )
    await db.emergency_release_audit.insert_one({
        "type": "single_door_test_release_result", "testId": test_id,
        "actor": user.get("email"), "at": datetime.now(timezone.utc),
        "state": state, "error": error,
        "hardwareCommandsAttempted": 1,
        "physicalVerification": "REQUIRED",
    })
    return {
        "ok": state == "release_acknowledged", "testId": test_id,
        "state": state, "doorName": pending["doorName"],
        "command": "alwaysOpen", "hardwareCommandsAttempted": 1,
        "physicalVerification": "REQUIRED",
        "error": error,
    }


@api_router.post("/emergency/test-door/restore")
async def restore_single_emergency_test(body: SingleDoorTestRestore, request: Request, user=Depends(require_commander)):
    if not single_door_test_enabled() or emergency_release_armed():
        raise HTTPException(status_code=423, detail="Test restoration unavailable while bulk release is armed")
    if body.confirmation != "RESTABLECER" or not all([body.supervisedOnSite, body.egressClear, body.emergencyEnded]):
        raise HTTPException(status_code=400, detail="Safety clearance and RESTABLECER confirmation required")
    from pymongo import ReturnDocument
    active = await db.emergency_single_test_state.find_one_and_update(
        {
            "_id": "kerma-single-door",
            "testId": body.testId,
            "state": {"$in": ["release_acknowledged", "release_unknown", "restore_unknown"]},
        },
        {"$set": {"state": "restore_sending", "updatedAt": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if not active:
        raise HTTPException(status_code=409, detail="No matching active single-door test can be restored")
    state = "restore_unknown"
    error = None
    try:
        await send_gateway_command({
            "kind": "door.open",
            "deviceId": active["deviceId"],
            "doorNo": active["doorNo"],
            "cmd": "close",
        })
        state = "restore_acknowledged"
    except Exception as exc:
        error = str(exc)[:240]
    await db.emergency_single_test_state.update_one(
        {"_id": "kerma-single-door", "testId": body.testId, "state": "restore_sending"},
        {"$set": {"state": state, "updatedAt": datetime.now(timezone.utc)}},
    )
    await db.emergency_release_audit.insert_one({
        "type": "single_door_test_restore_result", "testId": body.testId,
        "actor": user.get("email"), "at": datetime.now(timezone.utc),
        "state": state, "error": error, "hardwareCommandsAttempted": 1,
        "physicalVerification": "REQUIRED",
    })
    return {
        "ok": state == "restore_acknowledged", "testId": body.testId,
        "state": state, "hardwareCommandsAttempted": 1,
        "physicalVerification": "REQUIRED", "error": error,
    }


@api_router.post("/emergency/test-door/finish")
async def finish_single_emergency_test(body: SingleDoorTestFinish, user=Depends(require_commander)):
    if body.confirmation != "VERIFICADO" or not (body.physicallyVerified and body.safeEgressVerified):
        raise HTTPException(status_code=400, detail="Physical inspection and VERIFICADO confirmation are required")
    from pymongo import ReturnDocument
    now = datetime.now(timezone.utc)
    result = await db.emergency_single_test_state.find_one_and_update(
        {
            "_id": "kerma-single-door", "testId": body.testId,
            "state": {"$in": ["restore_acknowledged", "restore_unknown"]},
        },
        {"$set": {
            "state": "closed", "updatedAt": now,
            "verifiedAt": now, "verifiedBy": user.get("email"),
        }},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=409, detail="Restore command must be attempted and physical state verified first")
    await db.emergency_release_audit.insert_one({
        "type": "single_door_test_physically_closed", "testId": body.testId,
        "actor": user.get("email"), "at": now,
        "physicallyVerified": True, "safeEgressVerified": True,
        "hardwareCommandsAttempted": 0,
    })
    return {"ok": True, "testId": body.testId, "state": "closed", "hardwareCommandsAttempted": 0}


@api_router.post("/emergency/activate")
async def activate_emergency_release(body: EmergencyReleaseConfirmation, request: Request, user=Depends(require_commander)):
    # Require both server-side arming and an explicit human confirmation per activation.
    if body.confirmation != "LIBERAR":
        raise HTTPException(status_code=400, detail="Explicit confirmation LIBERAR is required")
    if not emergency_release_armed():
        raise HTTPException(status_code=423, detail="Emergency release not armed; onsite safety commissioning is required")
    doors = await emergency_egress_doors()
    validate_emergency_targets(doors)
    facial_ids = {d.get("gatewayDeviceId") async for d in db.devices.find(
        {"type": "face"}, {"gatewayDeviceId": 1}
    )}
    if any(d.get("gatewayDeviceId") in facial_ids for d in doors):
        raise HTTPException(status_code=409,
            detail="Facial terminals only pulse. Sustained exit release requires on-site certification; "
                   "remove unverified facial outputs from the emergency group before commissioning.")

    # Atomic cross-process mutex: prevent overlapping commands from multiple browsers.
    from pymongo.errors import DuplicateKeyError
    now = datetime.now(timezone.utc)
    try:
        result = await db.emergency_release_mutex.update_one(
            {"_id": "kerma-egress", "lockedUntil": {"$lte": now}},
            {"$set": {"lockedUntil": now + timedelta(minutes=2), "actor": user.get("email")}},
            upsert=True,
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Emergency release command already in progress")
    if not result.acknowledged:
        raise HTTPException(status_code=503, detail="Could not obtain emergency release command lock")

    incident_id = uuid.uuid4().hex
    record = {
        "incidentId": incident_id, "mode": "live", "state": "in_progress",
        "startedAt": now, "actor": user.get("email"),
        "actorId": str(user.get("_id")), "sourceIp": request.client.host if request.client else None,
        "userAgent": str(request.headers.get("user-agent") or "")[:256],
        "count": len(doors), "results": [],
    }
    try:
        await db.emergency_release_incidents.insert_one(record)
        async def release_one(door: dict) -> dict:
            item = emergency_door_info(door)
            try:
                # The Gateway understands this command already; it must be
                # independently checked that each controller supports alwaysOpen.
                ack = await send_gateway_command({
                    "kind": "door.open", "deviceId": door["gatewayDeviceId"],
                    "doorNo": door["doorNo"], "cmd": "alwaysOpen",
                })
                item["result"] = "GATEWAY_ACKNOWLEDGED_NOT_PHYSICALLY_VERIFIED"
                item["gatewayResponse"] = ack
            except Exception as exc:
                item["result"] = "FAILED_OR_UNKNOWN"
                item["error"] = str(exc)[:250]
            return item
        results = await asyncio.gather(*(release_one(d) for d in doors))
        all_ack = all(r["result"] == "GATEWAY_ACKNOWLEDGED_NOT_PHYSICALLY_VERIFIED" for r in results)
        await db.emergency_release_incidents.update_one({"incidentId": incident_id}, {"$set": {
            "results": results, "state": "gateway_acknowledged" if all_ack else "attention_required",
            "completedAt": datetime.now(timezone.utc),
        }})
        # Never update door.status to 'unlocked' here: physical feedback is not available.
        return {
            "ok": all_ack, "incidentId": incident_id, "mode": "live", "results": results,
            "physicalVerification": "REQUIRED",
        }
    except Exception:
        await db.emergency_release_incidents.update_one({"incidentId": incident_id}, {"$set": {
            "state": "attention_required", "completedAt": datetime.now(timezone.utc),
        }})
        raise
    finally:
        await db.emergency_release_mutex.update_one(
            {"_id": "kerma-egress"}, {"$set": {"lockedUntil": datetime.now(timezone.utc)}}
        )


@api_router.get("/gateway/status")
async def gateway_status(user=Depends(get_current_user)):
    return {"online": "kerma-monterrey" in gateway_connections, "gateway_id": "kerma-monterrey"}


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


# Personnel records are managed exclusively through authenticated employee APIs.
# Do not reseed/import historic iVMS staff on service startup: deleted
# employees otherwise reappear, and manually edited records are overwritten.
# The legacy fixed employee roster and seed_kerma_people() were removed.


# --- Kerma Monterrey device inventory seed ---
KERMA_DEVICE_SEED = [
    {"type": "gateway", "name": "Kerma Monterrey Gateway", "gatewayDeviceId": "kerma-monterrey", "doors": [], "ip": "", "fw": "", "detail": "Gateway ID: kerma-monterrey", "signal": 100},
    {"type": "face", "name": "VIP Entrance", "gatewayDeviceId": "vip-entrance", "doors": [1], "ip": "192.168.2.39", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "VIP Exit", "gatewayDeviceId": "vip-exit", "doors": [1], "ip": "192.168.1.56", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 1 Entrance", "gatewayDeviceId": "torniquete-1-entrada", "doors": [1], "ip": "192.168.3.159", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 1 Exit", "gatewayDeviceId": "torniquete-1-salida", "doors": [1], "ip": "192.168.0.206", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 2 Entrance", "gatewayDeviceId": "torniquete-2-entrada", "doors": [1], "ip": "192.168.0.169", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Turnstile 2 Exit", "gatewayDeviceId": "torniquete-2-salida", "doors": [1], "ip": "192.168.3.4", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Main Inventory", "gatewayDeviceId": "main-inventory", "doors": [1], "ip": "192.168.2.226", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Cleaning Storage", "gatewayDeviceId": "cleaning-storage", "doors": [1], "ip": "192.168.1.169", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Roof Stairs", "gatewayDeviceId": "roof-stairs", "doors": [1], "ip": "192.168.1.124", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Technicians Inventory", "gatewayDeviceId": "technicians-inventory", "doors": [1], "ip": "192.168.3.208", "fw": "", "detail": "Hikvision facial terminal", "signal": 95},
    {"type": "face", "name": "Attendance Main", "gatewayDeviceId": "attendance-main", "doors": [1], "ip": "192.168.3.219", "fw": "", "detail": "Dedicated attendance facial terminal", "signal": 95},
    {"type": "card", "name": "1st Floor AC", "gatewayDeviceId": "1st-floor-ac", "doors": [1,2,3,4], "ip": "192.168.3.111", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "2nd Floor AC", "gatewayDeviceId": "2nd-floor-ac", "doors": [1,2,3,4], "ip": "192.168.3.112", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "Break Room", "gatewayDeviceId": "break-room", "doors": [1,2,3,4], "ip": "192.168.3.113", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "3rd Floor AC", "gatewayDeviceId": "3rd-floor-ac", "doors": [1,2,3,4], "ip": "192.168.3.114", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "Restrooms", "gatewayDeviceId": "restrooms", "doors": [1,2,3,4], "ip": "192.168.3.115", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "card", "name": "1st Floor 2nd AC", "gatewayDeviceId": "1st-floor-2nd-ac", "doors": [1,2,3,4], "ip": "192.168.3.116", "fw": "", "detail": "Hikvision 4-door access controller · SDK port 8000", "signal": 95},
    {"type": "nvr", "name": "NVR 1", "ip": "192.168.3.101", "fw": "", "detail": "DS-7732NI-M4/16P · HTTP 80 · RTSP 554", "signal": 95},
    {"type": "nvr", "name": "NVR 2", "ip": "192.168.3.102", "fw": "", "detail": "DS-7732NXI-I4/16P · HTTP 80 · RTSP 554", "signal": 95},
    {"type": "nvr", "name": "NVR 3", "ip": "192.168.3.103", "fw": "", "detail": "Hikvision NVR · HTTP 80 · RTSP 554", "signal": 95},
]


async def seed_kerma_doors():
    devices = await db.devices.find({"type": {"$in": ["face", "card"]}}).to_list(100)
    seq = 1
    for device in devices:
        gateway_device_id = device.get("gatewayDeviceId")
        door_numbers = device.get("doors") or []
        if not gateway_device_id or not door_numbers:
            continue

        for door_no in door_numbers:
            existing = await db.doors.find_one({
                "gatewayDeviceId": gateway_device_id,
                "doorNo": int(door_no),
            })
            if existing:
                await db.doors.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "deviceId": str(device["_id"]),
                        "gatewayDeviceId": gateway_device_id,
                        "doorNo": int(door_no),
                        "hardwareLinked": True,
                    }},
                )
                continue

            # Keep auto-seeded doors compact; exact door names/positions can be edited later.
            name = device.get("name") if len(door_numbers) == 1 else f"{device.get('name')} · Door {door_no}"
            await db.doors.insert_one({
                "name": name,
                "zone": "GENERAL",
                "x": None,
                "y": None,
                "floor": None,
                "camId": None,
                "deviceId": str(device["_id"]),
                "gatewayDeviceId": gateway_device_id,
                "doorNo": int(door_no),
                "hardwareLinked": True,
                "visible": True,
                "code": f"D-{seq:02d}",
                "status": "locked",
                "created_at": datetime.now(timezone.utc),
            })
            seq += 1


async def migrate_door_status_events_once():
    marker = await db.app_meta.find_one({"_id": "door_status_events_v2"})
    if marker:
        return
    status_labels = {
        "lock released": "LOCK RELEASED",
        "lock closed": "LOCK CLOSED",
        "exit button pressed": "BUTTON PRESSED",
        "exit button released": "BUTTON RELEASED",
        "door opened normally": "DOOR OPENED",
        "door closed normally": "DOOR CLOSED",
        "always-open state started": "ALWAYS OPEN STARTED",
        "always-open state ended": "ALWAYS OPEN ENDED",
    }
    for old_label, new_label in status_labels.items():
        await db.events.update_many(
            {"detail": {"$regex": f"^{re.escape(old_label)}$", "$options": "i"}},
            {"$set": {"result": "status", "method": "OTHER", "detail": new_label}},
        )
    await db.app_meta.insert_one({
        "_id": "door_status_events_v2",
        "applied_at": datetime.now(timezone.utc),
    })


async def migrate_hardware_doors_to_unplaced_once():
    marker = await db.app_meta.find_one({"_id": "hardware_doors_unplaced_v1"})
    if marker:
        return
    await db.doors.update_many(
        {"hardwareLinked": True},
        {"$set": {"floor": None, "x": None, "y": None}},
    )
    await db.app_meta.insert_one({
        "_id": "hardware_doors_unplaced_v1",
        "applied_at": datetime.now(timezone.utc),
    })


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
    await seed_kerma_doors()
    await migrate_hardware_doors_to_unplaced_once()
    await migrate_door_status_events_once()
    # No employee import at startup: preserve deletions and edits across deployments.
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
