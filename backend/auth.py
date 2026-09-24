from datetime import datetime, timedelta
from typing import Optional, List
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import os
from logging_config import logger

class UserContext(BaseModel):
    email: str
    role: str  # "USER", "HOSPITAL", "ADMIN"
    hospital_id: Optional[int] = None
    user_id: Optional[int] = None

# Production safety guards
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower().strip()
DEMO_MODE = os.getenv("DEMO_MODE", "1" if ENVIRONMENT != "production" else "0").strip()

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    if os.getenv("RENDER") or ENVIRONMENT == "production":
        raise RuntimeError("JWT_SECRET must be explicitly set before starting EMEFast in production")
    # Development fallback
    SECRET_KEY = "emefast-dev-insecure-secret-key-change-in-production"

if ENVIRONMENT == "production":
    if SECRET_KEY == "emefast-dev-insecure-secret-key-change-in-production":
        raise RuntimeError("Default development JWT_SECRET is not permitted in production")
    if DEMO_MODE == "1":
        logger.warning("DEMO_MODE=1 detected in production environment! Forcing DEMO_MODE=0 for security.")
        DEMO_MODE = "0"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 1 day

# OAuth2 scheme: auto_error=False allows optional extraction for routes that permit demo fallback
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> UserContext:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        role: Optional[str] = payload.get("role", "USER")
        hospital_id: Optional[int] = payload.get("hospital_id")
        user_id: Optional[int] = payload.get("user_id")

        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials: email missing in token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return UserContext(email=email, role=role.upper(), hospital_id=hospital_id, user_id=user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> UserContext:
    if not token:
        # Check if running in development/demo mode with explicit fallback
        if DEMO_MODE == "1" and ENVIRONMENT in ("development", "demo"):
            logger.debug("[DEMO MODE] No auth token provided; injecting default demo user context")
            return UserContext(email="demo.user@emefast.example", role="USER", hospital_id=None, user_id=1)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(token)

def require_roles(allowed_roles: List[str]):
    """Enforces server-side role-based access control (RBAC).

    In production: strictly validates token and verifies user role matches allowed_roles.
    In demo mode: if no token is provided, safely injects demo role context for convenience.
    If a token IS provided, it is always strictly verified regardless of environment.
    """
    async def role_checker(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> UserContext:
        if not token:
            if DEMO_MODE == "1" and ENVIRONMENT in ("development", "demo"):
                target_role = allowed_roles[0] if allowed_roles else "USER"
                demo_hosp = 1 if target_role == "HOSPITAL" else None
                logger.debug(f"[DEMO MODE] Unauthenticated call to protected route; injecting demo actor ({target_role})")
                return UserContext(
                    email=f"demo.{target_role.lower()}@emefast.local",
                    role=target_role,
                    hospital_id=demo_hosp,
                    user_id=1
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token required for this operation",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = decode_token(token)
        if user.role not in allowed_roles:
            logger.warning(f"Forbidden access attempt by {user.email} (role: {user.role}) for required roles: {allowed_roles}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {allowed_roles} role permissions",
            )
        return user

    return role_checker

# Role-specific dependency shortcuts
require_admin = require_roles(["ADMIN"])
require_hospital = require_roles(["HOSPITAL", "ADMIN"])
require_authenticated = require_roles(["USER", "HOSPITAL", "ADMIN"])
require_user = require_roles(["USER", "ADMIN"])
