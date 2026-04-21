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
