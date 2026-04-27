"""/api/auth — login / refresh / logout / me per §6.1 + §7."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.auth import LoginRequest, LogoutResponse, RefreshRequest, TokenResponse
from schemas.user import UserOut
from services.audit_service import log_action
from services.auth_service import AuthService
from services.user_service import UserService

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = AuthService.authenticate(db, payload.username, payload.password)
    access_token, expires_in = AuthService.create_access_token(user.id)
    refresh_token = AuthService.create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=UserService.to_out(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        claims = AuthService.decode_token(payload.refresh_token, expected_type="refresh")
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token недействителен или истёк",
        ) from exc

    user = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.group))
        .filter(User.id == int(claims["sub"]))
        .one_or_none()
    )
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден или заблокирован",
        )

    access_token, expires_in = AuthService.create_access_token(user.id)
    return TokenResponse(access_token=access_token, expires_in=expires_in)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    """Revoke the access token's ``jti`` so the same token can no longer
    authenticate any endpoint. Idempotent: a second call with the same (now
    revoked) token would have already been rejected by ``get_current_user``.
    """
    payload = getattr(current, "_jwt_payload", {}) or {}
    AuthService.revoke_token(db, payload=payload)
    log_action(
        db,
        actor_id=current.id,
        action="user.logout",
        entity_type="user",
        entity_id=current.id,
        meta={"jti": payload.get("jti")},
    )
    return LogoutResponse(status="ok")


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)) -> UserOut:
    return UserService.to_out(current)
