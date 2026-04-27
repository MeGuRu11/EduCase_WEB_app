"""FastAPI dependencies: auth (get_current_user) + RBAC (require_role). See ADR-015."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from services.auth_service import AuthService

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = AuthService.decode_token(token, expected_type="access")
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except JWTError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Token expired or invalid"
        ) from exc
    jti = payload.get("jti")
    if jti and AuthService.is_revoked(db, jti):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token revoked")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or blocked")
    # Stash the token payload on the request user so handlers can revoke it.
    user._jwt_payload = payload  # type: ignore[attr-defined]
    return user


def require_role(*roles: str):
    def check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.name not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return current_user

    return check
