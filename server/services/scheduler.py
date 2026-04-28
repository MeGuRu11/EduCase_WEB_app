"""APScheduler wrapper — background maintenance jobs (ADDENDUM §U.3 + §T.5).

Jobs registered on startup:
  * ``auto_finish_expired_attempts`` — every 60 s (§U.3)
  * ``cleanup_expired_blacklist`` — every hour
  * ``daily_backup`` — 02:00 UTC (Stage 4: BackupService.create_backup, §T.5)
  * ``cleanup_old_logs`` — 04:00 UTC (Stage 4: AdminService.cleanup_old_logs, §T.4)

The scheduler is a thin registration layer; the underlying behaviour is
exercised end-to-end via the corresponding service-level pytest cases.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from database import SessionLocal
from services.attempt_service import AttemptService

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _with_session(fn: Callable[..., Any]) -> Callable[[], Any]:
    """Wrap a job so it receives a short-lived SQLAlchemy session."""

    def wrapped() -> Any:
        session = SessionLocal()
        try:
            result = fn(session)
            session.commit()
            return result
        except Exception:  # pragma: no cover — defensive
            session.rollback()
            logger.exception("Scheduled job '%s' failed", fn.__name__)
            raise
        finally:
            session.close()

    wrapped.__name__ = fn.__name__
    return wrapped


# ────── job bodies ──────


def _auto_finish_expired(session: Any) -> int:
    count = AttemptService.auto_finish_expired_attempts(session)
    if count:
        logger.info("auto_finish_expired_attempts: finished %s attempts", count)
    return count


def _cleanup_expired_blacklist(session: Any) -> int:
    """Drop ``token_blacklist`` rows whose ``expires_at`` is older than 1 day —
    keeping the recent past for ops auditing without unbounded growth."""
    from datetime import timedelta

    from models.token_blacklist import TokenBlacklist

    cutoff = datetime.now(tz=UTC) - timedelta(days=1)
    deleted = (
        session.query(TokenBlacklist)
        .filter(TokenBlacklist.expires_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        logger.info("cleanup_expired_blacklist: deleted %s rows", deleted)
    return int(deleted)


def _daily_backup(session: Any) -> dict | None:
    """Stage 4 §T.5 — automated nightly pg_dump.

    Rate-limit (5 min) inside ``BackupService.create_backup`` is harmless here
    because the cron only fires once per day; we just log and continue."""
    from fastapi import HTTPException

    from services.backup_service import BackupService

    try:
        result = BackupService.create_backup(session, actor_id=None)
        logger.info(
            "daily_backup: created %s (%.2f MB in %.2fs)",
            result["filename"], result["size_mb"], result["duration_sec"],
        )
        return result
    except HTTPException as exc:  # pragma: no cover — real subprocess only
        logger.error("daily_backup failed: %s", exc.detail)
        return None


def _cleanup_old_logs(session: Any) -> int:
    """Stage 4 §T.4 — drop ``system_logs`` past their retention window."""
    from services.admin_service import cleanup_old_logs

    deleted = cleanup_old_logs(session)
    if deleted:
        logger.info("cleanup_old_logs: deleted %s rows", deleted)
    return int(deleted)


# ────── public API ──────


def get_scheduler() -> BackgroundScheduler | None:
    return _scheduler


def start_scheduler() -> BackgroundScheduler:
    """Start APScheduler with our three jobs. Idempotent."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _with_session(_auto_finish_expired),
        IntervalTrigger(seconds=60),
        id="auto_finish_expired_attempts",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _with_session(_cleanup_expired_blacklist),
        IntervalTrigger(hours=1),
        id="cleanup_expired_blacklist",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _with_session(_daily_backup),
        CronTrigger(hour=2, minute=0),
        id="daily_backup",
        replace_existing=True,
    )
    scheduler.add_job(
        _with_session(_cleanup_old_logs),
        CronTrigger(hour=4, minute=0),
        id="cleanup_old_logs",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "scheduler started: %s",
        ", ".join(j.id for j in scheduler.get_jobs()),
    )
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
