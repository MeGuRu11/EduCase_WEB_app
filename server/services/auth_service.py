"""Auth business logic per §7 + §T.1 + §T.7.

* bcrypt cost=12 for password hashing (AGENTS.md backend rule)
* HS256 JWT — access 8h, refresh 7d (config.py)
* login rate limiting via ``users.login_attempts`` — 5 tries → 30-min lockout
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import HTTPException, status
from jose import jwt
from sqlalchemy.orm import Session, joinedload

from config import (
    ACCESS_TOKEN_EXPIRE_HOURS,
    JWT_ALGORITHM,
    JWT_SECRET,
    LOCKOUT_MINUTES,
    MAX_LOGIN_ATTEMPTS,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from models.user import User

BCRYPT_ROUNDS = 12


class AuthService:
    """Stateless helpers; every method takes the ``Session`` explicitly."""

    # ─── Passwords ──────────────────────────────────────────────────────────

    @staticmethod
    def hash_password(plain: str) -> str:
        salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            # Malformed stored hash — treat as a non-match, never raise.
            return False

    # ─── Tokens ─────────────────────────────────────────────────────────────

    @staticmethod
    def _encode(sub: int, kind: str, ttl: timedelta) -> str:
        now = datetime.now(tz=UTC)
        payload = {
            "sub": str(sub),
            "type": kind,
            "iat": int(now.timestamp()),
            "exp": int((now + ttl).timestamp()),
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    @classmethod
    def create_access_token(cls, user_id: int) -> tuple[str, int]:
        ttl = timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        return cls._encode(user_id, "access", ttl), int(ttl.total_seconds())

    @classmethod
    def create_refresh_token(cls, user_id: int) -> str:
        return cls._encode(
            user_id, "refresh", timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )

    @staticmethod
    def decode_token(token: str, *, expected_type: str | None = None) -> dict:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if expected_type is not None and payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный тип токена",
            )
        return payload

    # ─── Login flow ─────────────────────────────────────────────────────────

    @classmethod
    def authenticate(cls, db: Session, username: str, password: str) -> User:
        user = (
            db.query(User)
            .options(joinedload(User.role), joinedload(User.group))
            .filter(User.username == username)
            .one_or_none()
        )

        if user is None:
            # Do NOT leak whether the username exists — constant generic error.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный логин или пароль",
            )

        now = datetime.now(tz=UTC)
        if user.locked_until is not None and user.locked_until > now:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Аккаунт временно заблокирован, обратитесь к администратору",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Аккаунт заблокирован администратором",
            )

        if not cls.verify_password(password, user.password_hash):
            user.login_attempts = (user.login_attempts or 0) + 1
            if user.login_attempts >= MAX_LOGIN_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
                user.login_attempts = 0
                db.flush()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Аккаунт временно заблокирован, обратитесь к администратору",
                )
            db.flush()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный логин или пароль",
            )

        # Success — clear counters, bump last_login_at.
        user.login_attempts = 0
        user.locked_until = None
        user.last_login_at = now
        db.flush()
        return user
