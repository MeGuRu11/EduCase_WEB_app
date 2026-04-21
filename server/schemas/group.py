"""Group schemas per ADDENDUM §R.3."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TeacherShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str


class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    teachers: list[TeacherShort] = []
    student_count: int = 0
    is_active: bool
    created_at: datetime


class GroupMemberAdd(BaseModel):
    user_id: int


class GroupTeacherAssign(BaseModel):
    teacher_id: int
