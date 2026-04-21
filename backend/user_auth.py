"""
App-level user authentication — JWT tokens + bcrypt passwords.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

import db as db_module
import email_client

# ── Config ─────────────────────────────────────────────────────────────────────
# Set JWT_SECRET in .env to keep sessions alive across restarts.
# If unset, a random secret is generated each startup (sessions reset on restart).
JWT_SECRET  = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
JWT_ALG     = "HS256"
TOKEN_HOURS = int(os.environ.get("TOKEN_HOURS", "8"))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer  = HTTPBearer(auto_error=False)
router  = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def create_token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": username, "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("sub")
    except JWTError:
        return None


# ── Dependencies ───────────────────────────────────────────────────────────────

async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    username = decode_token(creds.credentials)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db_module.get_user(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Request schemas ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"

class AdminResetPasswordRequest(BaseModel):
    new_password: str

class ChangeOwnPasswordRequest(BaseModel):
    current_password: str
    new_password: str

class SendInviteRequest(BaseModel):
    email: str
    role: str = "viewer"
    dashboard_url: str = ""

class CompleteSetupRequest(BaseModel):
    token: str
    username: str
    password: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    user = db_module.get_user(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {
        "token":    create_token(body.username),
        "username": body.username,
        "role":     user["role"],
    }

@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"username": user["username"], "role": user["role"]}

@router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    return db_module.list_users()

@router.post("/users")
async def create_user(body: CreateUserRequest, _: dict = Depends(require_admin)):
    if db_module.get_user(body.username):
        raise HTTPException(status_code=409, detail="Username already exists")
    if body.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    return db_module.create_user(body.username, hash_password(body.password), body.role)

@router.delete("/users/{username}")
async def delete_user(username: str, current: dict = Depends(require_admin)):
    if username == current["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if not db_module.get_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    db_module.delete_user(username)
    return {"ok": True}

@router.put("/users/{username}/password")
async def admin_reset_password(
    username: str,
    body: AdminResetPasswordRequest,
    _: dict = Depends(require_admin),
):
    if not db_module.get_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    db_module.update_password(username, hash_password(body.new_password))
    return {"ok": True}

@router.put("/me/password")
async def change_own_password(
    body: ChangeOwnPasswordRequest,
    user: dict = Depends(get_current_user),
):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    db_module.update_password(user["username"], hash_password(body.new_password))
    return {"ok": True}


# ── Self-service invite flow ────────────────────────────────────────────────────

@router.post("/invite")
async def send_invite(body: SendInviteRequest, _: dict = Depends(require_admin)):
    """Admin-only: create a signup link and email it to the recipient."""
    from datetime import timedelta
    if body.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")
    inv_token   = secrets.token_urlsafe(32)
    expires_at  = (
        datetime.now(timezone.utc) + timedelta(hours=72)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    db_module.create_invitation(inv_token, body.email, body.role, expires_at)
    base_url    = body.dashboard_url.rstrip("/") or "https://security.mes.suntado.com"
    setup_url   = f"{base_url}?invite={inv_token}"
    try:
        email_client.send_invite_link(body.email, setup_url, body.role)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.get("/setup")
async def validate_invite_token(token: str):
    """Public: validate an invite token and return the email/role it was issued for."""
    inv = db_module.get_invitation(token)
    if not inv:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")
    return {"email": inv["email"], "role": inv["role"]}


@router.post("/setup")
async def complete_setup(body: CompleteSetupRequest):
    """Public: exchange a valid invite token for a new user account + JWT."""
    inv = db_module.get_invitation(body.token)
    if not inv:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")
    if db_module.get_user(body.username):
        raise HTTPException(status_code=409, detail="Username already taken — please choose another")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    db_module.create_user(body.username, hash_password(body.password), inv["role"])
    db_module.use_invitation(body.token)
    return {
        "token":    create_token(body.username),
        "username": body.username,
        "role":     inv["role"],
    }
