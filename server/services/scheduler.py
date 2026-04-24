"""APScheduler wrapper — background maintenance jobs (ADDENDUM §U.3 + §T.5).

Jobs registered on startup:
  * ``auto_finish_expired_attempts`` — every 60 s (§U.3)
  * ``daily_backup`` — 03:00 UTC (§T.5, stubbed until Stage 4 owns backup_service)
  * ``cleanup_old_logs`` — 04:00 UTC (stubbed)

Timing tests live in ``test_attempts.py::test_auto_finish_expired_attempts_*``
and exercise the underlying service directly — the scheduler itself is only
a thin registration layer, so we do not run APScheduler inside pytest.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
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


def _daily_backup(session: Any) -> None:
    logger.info("daily_backup: stub (owned by backup_service in Stage 4)")


def _cleanup_old_logs(session: Any) -> None:
    logger.info("cleanup_old_logs: stub (owned by admin_service in Stage 4)")


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
        _with_session(_daily_backup),
        CronTrigger(hour=3, minute=0),
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
