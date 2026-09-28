from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List
from bson import ObjectId
import os
import logging
import uuid
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta

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
        "must_change_password": u.get("must_change_password", False),
        "last_login": iso(u.get("last_login")),
        "created_at": iso(u.get("created_at")),
    }


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


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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
    def is_active(s):
        ls = s.get("last_seen")
        return bool(ls and ls.replace(tzinfo=timezone.utc) >= cutoff)
    return [
        {
            "id": str(s["_id"]),
            "ip": s.get("ip"),
            "agent": s.get("agent"),
            "created_at": iso(s.get("created_at")),
            "last_seen": iso(s.get("last_seen")),
            "active": is_active(s),
        }
        for s in sessions
    ]


def doc_id(d):
    d["id"] = str(d.pop("_id"))
    return d


class EmployeeIn(BaseModel):
    name: str
    role: str = ""
    cardNo: str = ""
    faceSync: bool = False
    faceMatch: str | None = None
    level: str = "L1 · GENERAL"


class CameraIn(BaseModel):
    label: str
    location: str = ""
    nvr: str = ""
    img: str | None = None


class DeviceIn(BaseModel):
    type: str
    name: str
    ip: str = ""
    fw: str = ""
    detail: str = ""
    signal: int = 95


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
    await db.cameras.update_many({"nvr": item_id}, {"$set": {"nvr": ""}})
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


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.sessions.create_index("jti", unique=True)
    await db.sessions.create_index("user_id")
    admin_email = os.environ["ADMIN_EMAIL"].strip().lower()
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(
            {
                "email": admin_email,
                "name": "Juan Alvarez",
                "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
                "role": "commander",
                "must_change_password": True,
                "created_at": datetime.now(timezone.utc),
            }
        )
        logger.info("Seeded commander account %s", admin_email)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
