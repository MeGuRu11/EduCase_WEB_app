"""User schemas per ADDENDUM §R.2 (Pydantic v2)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

PASSWORD_REGEX = re.compile(
    r"^(?=.*[A-Za-zА-ЯЁа-яё])(?=.*\d)(?=.*[!@#$%^&*\-_=+]).{8,128}$"
)


def check_password_complexity(v: str) -> str:
    if not PASSWORD_REGEX.match(v):
        raise ValueError(
            "Пароль должен содержать минимум 8 символов, хотя бы одну букву, "
            "одну цифру и один символ из: ! @ # $ % ^ & * - _ = +"
        )
    return v


Password = Annotated[
    str,
    AfterValidator(check_password_complexity),
    Field(min_length=8, max_length=128),
]


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    password: Password
    full_name: str = Field(min_length=2, max_length=200)
    role_id: int
    group_id: int | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    group_id: int | None = None
    avatar_path: str | None = None


class UserStatusUpdate(BaseModel):
    """E-13 — replaces legacy POST /toggle-active with PUT /status."""

    is_active: bool


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: Password


class ResetPasswordRequest(BaseModel):
    new_password: Password


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: str
    role_id: int
    group_id: int | None = None
    group_name: str | None = None
    avatar_url: str | None = None
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None = None
    created_at: datetime


class UserBulkCSVRow(BaseModel):
    """One row of the bulk-upload CSV. See §T.6."""

    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    password: Password
    full_name: str = Field(min_length=2, max_length=200)
    role: str = Field(pattern=r"^(student|teacher|admin)$")
    group_name: str | None = None
    email: str | None = None  # reserved for V2 — currently ignored


class UserBulkError(BaseModel):
    row: int
    detail: str


class UserBulkResult(BaseModel):
    created: int
    errors: list[UserBulkError] = []
