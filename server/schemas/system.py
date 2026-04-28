"""System / admin schemas — ADDENDUM §R.7 + §SCALE.2."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
HealthStatus = Literal["ok", "warning", "error"]


class SystemLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    level: LogLevel
    message: str
    user_id: int | None = None
    username: str | None = None
    meta: dict | None = None
    created_at: datetime


class BackupInfo(BaseModel):
    filename: str
    size_mb: float
    created_at: datetime
    age_human: str


class BackupCreateResult(BaseModel):
    filename: str
    size_mb: float
    duration_sec: float


class SysInfoOut(BaseModel):
    db_size_mb: float
    last_backup_at: datetime | None = None
    last_backup_age_human: str | None = None
    version: str
    python_version: str
    uptime_hours: float
    maintenance_mode: bool = False


class SystemSettingUpdate(BaseModel):
    institution_name: str | None = None
    idle_timeout_min: int | None = Field(default=None, ge=5, le=120)
    max_file_upload_mb: int | None = Field(default=None, ge=1, le=50)
    backup_retention_days: int | None = Field(default=None, ge=7, le=365)


class SystemSettingsOut(BaseModel):
    institution_name: str | None = None
    idle_timeout_min: int | None = None
    max_file_upload_mb: int | None = None
    backup_retention_days: int | None = None
    maintenance_mode: bool = False


# ─── Health (SCALE.2) ────────────────────────────────────────────────────────


class HealthCheck(BaseModel):
    status: HealthStatus
    message: str | None = None
    # Per-check metric fields land in extras through ``model_dump`` in the route.

    model_config = ConfigDict(extra="allow")


class HealthCheckOut(BaseModel):
    status: HealthStatus
    checks: dict[str, dict]
    version: str
    checked_at: datetime
