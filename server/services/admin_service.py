"""Admin operational helpers — sysinfo, settings, log retention, health checks.

Owns:
* ``last_backup_at`` (file-system metadata)
* `system_settings` read/write (idempotent PUT — E-15)
* ``cleanup_old_logs`` retention job (§T.4)
* ``/api/health`` checks (db / disk / backup / scheduler / errors_24h)
"""

from __future__ import annotations

import contextlib
import logging
import platform
import shutil
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from config import APP_VERSION, BACKUP_DIR
from models.system import SystemLog, SystemSetting

logger = logging.getLogger(__name__)

_PROCESS_STARTED_AT = datetime.now(tz=UTC)

# Defaults for known settings (§R.7).
DEFAULT_SETTINGS: dict[str, Any] = {
    "institution_name": None,
    "idle_timeout_min": 30,
    "max_file_upload_mb": 5,
    "backup_retention_days": 90,
    "maintenance_mode": False,
}


# ─── retention (§T.4) ────────────────────────────────────────────────────────


_RETENTION_DAYS_BY_LEVEL = {
    "DEBUG": 7,
    "INFO": 30,
    "WARNING": 365,
    "ERROR": 365,
    "CRITICAL": 365,
}


def cleanup_old_logs(db: Session) -> int:
    """Drop ``system_logs`` rows whose retention window has elapsed (§T.4)."""
    deleted = 0
    now = datetime.now(tz=UTC)
    for level, days in _RETENTION_DAYS_BY_LEVEL.items():
        cutoff = now - timedelta(days=days)
        n = (
            db.query(SystemLog)
            .filter(SystemLog.level == level, SystemLog.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        deleted += int(n)
    return deleted


# ─── service ────────────────────────────────────────────────────────────────


class AdminService:
    # ─── filesystem helpers ────────────────────────────────────────────

    @staticmethod
    def last_backup_at() -> datetime | None:
        directory = Path(BACKUP_DIR)
        if not directory.exists():
            return None
        latest: datetime | None = None
        for p in directory.iterdir():
            if not p.is_file() or not p.name.endswith(".dump"):
                continue
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=UTC)
            if latest is None or mtime > latest:
                latest = mtime
        return latest

    # ─── sysinfo ───────────────────────────────────────────────────────

    @classmethod
    def sysinfo(cls, db: Session) -> dict[str, Any]:
        db_size_bytes = db.execute(
            sa_text("SELECT pg_database_size(current_database())")
        ).scalar()
        last = cls.last_backup_at()
        age = (
            _format_age(datetime.now(tz=UTC) - last)
            if last is not None else None
        )
        uptime = (datetime.now(tz=UTC) - _PROCESS_STARTED_AT).total_seconds() / 3600.0
        maintenance = cls.get_setting(db, "maintenance_mode", default="false") == "true"
        return {
            "db_size_mb": round(float(db_size_bytes or 0) / (1024 * 1024), 2),
            "last_backup_at": last,
            "last_backup_age_human": age,
            "version": APP_VERSION,
            "python_version": platform.python_version(),
            "uptime_hours": round(uptime, 2),
            "maintenance_mode": maintenance,
        }

    # ─── settings ──────────────────────────────────────────────────────

    @classmethod
    def get_setting(cls, db: Session, key: str, *, default: Any = None) -> Any:
        row = db.get(SystemSetting, key)
        return row.value if row is not None else default

    @classmethod
    def list_settings(cls, db: Session) -> dict[str, Any]:
        rows = db.execute(select(SystemSetting)).scalars().all()
        merged = dict(DEFAULT_SETTINGS)
        for row in rows:
            merged[row.key] = row.value
        # Cast known typed settings.
        for k in ("idle_timeout_min", "max_file_upload_mb", "backup_retention_days"):
            v = merged.get(k)
            if isinstance(v, str):
                with contextlib.suppress(ValueError):
                    merged[k] = int(v)
        if isinstance(merged.get("maintenance_mode"), str):
            merged["maintenance_mode"] = merged["maintenance_mode"] == "true"
        return merged

    @classmethod
    def update_settings(
        cls,
        db: Session,
        *,
        payload: dict[str, Any],
        actor_id: int | None,
    ) -> dict[str, Any]:
        # E-15 — PUT is idempotent: write every supplied key, even if value unchanged.
        for key, raw in payload.items():
            if raw is None:
                continue
            value = str(raw).lower() if isinstance(raw, bool) else str(raw)
            row = db.get(SystemSetting, key)
            if row is None:
                db.add(
                    SystemSetting(
                        key=key,
                        value=value,
                        updated_by=actor_id,
                    )
                )
            else:
                row.value = value
                row.updated_by = actor_id
                row.updated_at = datetime.now(tz=UTC)
        db.flush()
        return cls.list_settings(db)

    # ─── logs ──────────────────────────────────────────────────────────

    @classmethod
    def list_logs(
        cls,
        db: Session,
        *,
        level: str | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[SystemLog], int]:
        q = db.query(SystemLog)
        if level:
            q = q.filter(SystemLog.level == level)
        total = (
            q.with_entities(func.count(SystemLog.id)).order_by(None).scalar() or 0
        )
        items = (
            q.order_by(SystemLog.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return items, int(total)

    # ─── health (SCALE.2) ──────────────────────────────────────────────

    @classmethod
    def health(cls, db: Session) -> dict[str, Any]:
        checks: dict[str, dict[str, Any]] = {}

        # 1. db ping
        t0 = time.perf_counter()
        try:
            db.execute(sa_text("SELECT 1"))
            checks["db"] = {
                "status": "ok",
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
            }
        except Exception as exc:  # pragma: no cover — defensive
            checks["db"] = {"status": "error", "message": str(exc)}

        # 2. disk usage
        try:
            usage = shutil.disk_usage(str(Path(BACKUP_DIR).parent))
            free_gb = usage.free / (1024 ** 3)
            checks["disk"] = {
                "status": "ok" if free_gb > 1.0 else "warning",
                "free_gb": round(free_gb, 2),
            }
        except Exception as exc:  # pragma: no cover
            checks["disk"] = {"status": "error", "message": str(exc)}

        # 3. backup age
        last = cls.last_backup_at()
        if last is None:
            checks["backup"] = {
                "status": "warning",
                "last_backup_age_hours": None,
                "message": "No backup found",
            }
        else:
            hours = (datetime.now(tz=UTC) - last).total_seconds() / 3600.0
            checks["backup"] = {
                "status": "ok" if hours < 25 else "warning",
                "last_backup_age_hours": round(hours, 2),
            }

        # 4. scheduler
        try:
            from services.scheduler import get_scheduler

            sch = get_scheduler()
            checks["scheduler"] = {
                "status": "ok" if (sch is not None and sch.running) else "warning",
                "running": bool(sch is not None and sch.running),
            }
        except Exception as exc:  # pragma: no cover
            checks["scheduler"] = {"status": "error", "message": str(exc)}

        # 5. errors_24h
        try:
            since = datetime.now(tz=UTC) - timedelta(hours=24)
            n = (
                db.query(func.count(SystemLog.id))
                .filter(
                    SystemLog.level.in_(("ERROR", "CRITICAL")),
                    SystemLog.created_at >= since,
                )
                .scalar()
                or 0
            )
            checks["errors_24h"] = {
                "status": "ok" if n < 10 else "warning",
                "count": int(n),
            }
        except Exception as exc:  # pragma: no cover
            checks["errors_24h"] = {"status": "error", "message": str(exc)}

        # Roll up overall status.
        statuses = [c["status"] for c in checks.values()]
        if any(s == "error" for s in statuses):
            overall = "error"
        elif any(s == "warning" for s in statuses):
            overall = "warning"
        else:
            overall = "ok"

        return {
            "status": overall,
            "checks": checks,
            "version": APP_VERSION,
            "checked_at": datetime.now(tz=UTC),
        }


def _format_age(delta: timedelta) -> str:
    sec = int(delta.total_seconds())
    if sec < 3600:
        return f"{sec // 60} мин назад"
    if sec < 86400:
        return f"{sec // 3600} ч назад"
    return f"{sec // 86400} дн назад"


# Suppress unused-import warnings — re-exports kept for downstream callers.
_ = sys
