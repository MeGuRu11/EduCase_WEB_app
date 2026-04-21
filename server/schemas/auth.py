"""Auth schemas per ADDENDUM §R.1."""

from __future__ import annotations

from pydantic import BaseModel, Field

from schemas.user import UserOut


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None  # only set by /login, not /refresh
    token_type: str = "bearer"  # noqa: S105 — RFC 6749 token_type literal, not a password
    expires_in: int  # seconds until access_token expires
    user: UserOut | None = None  # present only in /login


class LogoutResponse(BaseModel):
    status: str = "ok"
