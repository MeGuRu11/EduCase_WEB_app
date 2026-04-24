"""Common schemas per ADDENDUM §R.8."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, le=10_000)
    per_page: int = Field(default=20, ge=1, le=100)
    search: str | None = Field(default=None, max_length=200)
    sort: str | None = None


class PaginatedResponse(BaseModel, Generic[T]):  # noqa: UP046 — Pydantic v2 requires explicit Generic subclass.
    items: list[T]
    total: int
    page: int
    pages: int
    per_page: int


class ErrorResponse(BaseModel):
    detail: str
