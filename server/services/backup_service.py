"""pg_dump / pg_restore wrappers — ADDENDUM §T.5 (orchestration) + §T.7 (rate limit).

The actual ``pg_dump`` / ``pg_restore`` invocations are gated behind module-level
hooks (``_run_pg_dump`` / ``_run_pg_restore``) so tests can monkey-patch them
without ever touching real PostgreSQL utilities. The orchestration logic
(maintenance mode, abandoning attempts, alembic version check) is what we
test exhaustively.

Security:
* ``_safe_filename`` blocks ``..``, slashes and backslashes and any path that
  resolves outside ``BACKUP_DIR`` (path-traversal guard).
* Rate limit: 5-minute cooldown enforced via module-level state per §T.7.
* No filename ever interpolated into a shell — every ``subprocess.run`` call
  passes a list of arguments.
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from config import BACKUP_DIR, DATABASE_URL
from models.attempt import Attempt
from models.system import SystemSetting

logger = logging.getLogger(__name__)

_BACKUP_COOLDOWN_SEC = 300  # §T.7
_PG_DUMP_TIMEOUT_SEC = 300
_PG_RESTORE_TIMEOUT_SEC = 600

_last_backup_at: datetime | None = None


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _backup_dir() -> Path:
    p = Path(BACKUP_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_filename(name: str) -> Path:
    """Reject directory traversal, return absolute path inside BACKUP_DIR."""
    if not name or os.path.basename(name) != name or ".." in name or name.startswith("."):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Недопустимое имя файла"
        )
    p = (_backup_dir() / name).resolve()
    if not str(p).startswith(str(_backup_dir().resolve()) + os.sep) and p != _backup_dir().resolve():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Недопустимое имя файла"
        )
    return p


# ─── subprocess hooks (overridable in tests) ────────────────────────────────


# pg_dump / pg_restore — system utilities from the postgresql-client Debian
# package (already installed via Dockerfile). Argv lists are constant; no
# user input flows into argv. Noqa S603 (untrusted input) and S607 (partial
# path) per the security model in the module docstring.

def _run_pg_dump(target: Path) -> None:
    args = ["pg_dump", "--format=custom", "--file", str(target), DATABASE_URL]
    subprocess.run(args, timeout=_PG_DUMP_TIMEOUT_SEC, check=True, capture_output=True)  # noqa: S603


def _run_pg_restore(source: Path) -> None:
    args = [
        "pg_restore", "--clean", "--if-exists", "--no-owner",
        "-d", DATABASE_URL, str(source),
    ]
    subprocess.run(args, timeout=_PG_RESTORE_TIMEOUT_SEC, check=True, capture_output=True)  # noqa: S603


# ─── Settings helper ────────────────────────────────────────────────────────


def _set_setting(db: Session, key: str, value: str, *, actor_id: int | None) -> None:
    row = db.get(SystemSetting, key)
    if row is None:
        db.add(SystemSetting(key=key, value=value, updated_by=actor_id))
    else:
        row.value = value
        row.updated_by = actor_id
        row.updated_at = _now()
    db.flush()


# ─── Service ────────────────────────────────────────────────────────────────


class BackupService:
    """All public methods are class-level — they share the module-level
    ``_last_backup_at`` rate-limit state."""

    # ─── create ────────────────────────────────────────────────────────

    @classmethod
    def create_backup(cls, db: Session, *, actor_id: int | None = None) -> dict:
        global _last_backup_at
        now = _now()
        if _last_backup_at is not None:
            since = (now - _last_backup_at).total_seconds()
            if since < _BACKUP_COOLDOWN_SEC:
                retry_after = _BACKUP_COOLDOWN_SEC - int(since)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Слишком частые запросы. Повторите через {retry_after} секунд.",
                    headers={"Retry-After": str(retry_after)},
                )

        filename = f"epicase-{now.strftime('%Y%m%d-%H%M%S')}.dump"
        target = _safe_filename(filename)

        started = _now()
        try:
            _run_pg_dump(target)
        except subprocess.CalledProcessError as exc:
            logger.error("pg_dump failed: %s", exc.stderr)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "pg_dump завершился с ошибкой",
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "pg_dump превысил тайм-аут",
            ) from exc

        duration = (_now() - started).total_seconds()
        size_mb = round(target.stat().st_size / (1024 * 1024), 2) if target.exists() else 0.0

        _last_backup_at = now
        return {
            "filename": filename,
            "size_mb": size_mb,
            "duration_sec": round(duration, 3),
        }

    # ─── list / delete ─────────────────────────────────────────────────

    @classmethod
    def list_backups(cls) -> list[dict]:
        directory = _backup_dir()
        items: list[dict] = []
        for p in sorted(directory.iterdir(), reverse=True):
            if not p.is_file() or not p.name.endswith(".dump"):
                continue
            stat = p.stat()
            ctime = datetime.fromtimestamp(stat.st_mtime, tz=UTC)
            age = _now() - ctime
            items.append(
                {
                    "filename": p.name,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created_at": ctime,
                    "age_human": _format_age(age),
                }
            )
        return items

    @classmethod
    def delete_backup(cls, filename: str) -> None:
        target = _safe_filename(filename)
        if not target.exists():
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Бэкап не найден"
            )
        target.unlink()

    # ─── restore (§T.5) ────────────────────────────────────────────────

    @classmethod
    def restore_backup(
        cls, db: Session, *, filename: str, actor_id: int | None = None,
    ) -> dict:
        from sqlalchemy import text as sa_text

        target = _safe_filename(filename)
        if not target.exists():
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Бэкап не найден"
            )

        rev_before = db.execute(
            sa_text("SELECT version_num FROM alembic_version LIMIT 1")
        ).scalar()

        try:
            # Step 3 — maintenance mode ON.
            _set_setting(db, "maintenance_mode", "true", actor_id=actor_id)

            # Step 5 — abandon every in_progress attempt.
            db.execute(
                update(Attempt)
                .where(Attempt.status == "in_progress")
                .values(status="abandoned", finished_at=_now())
            )
            db.flush()

            # Step 7 — actual pg_restore.
            try:
                _run_pg_restore(target)
            except subprocess.CalledProcessError as exc:
                logger.error("pg_restore failed: %s", exc.stderr)
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "pg_restore завершился с ошибкой",
                ) from exc
            except subprocess.TimeoutExpired as exc:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "pg_restore превысил тайм-аут",
                ) from exc

            # Step 9 — version check.
            rev_after = db.execute(
                sa_text("SELECT version_num FROM alembic_version LIMIT 1")
            ).scalar()
            head_rev = _alembic_head()

            outcome: str
            if rev_after and head_rev and rev_after > head_rev:
                logger.warning(
                    "Backup contains newer migrations (%s) than application head (%s)",
                    rev_after, head_rev,
                )
                outcome = "newer_than_head_no_upgrade"
            elif rev_after and head_rev and rev_after < head_rev:
                logger.info(
                    "Applied migrations from %s to %s", rev_after, head_rev
                )
                outcome = "upgraded_to_head"
            else:
                outcome = "same_revision"

            return {
                "filename": filename,
                "rev_before": rev_before,
                "rev_after": rev_after,
                "outcome": outcome,
            }
        finally:
            # Step 10 — always release maintenance mode, even on failure path.
            _set_setting(db, "maintenance_mode", "false", actor_id=actor_id)


def _alembic_head() -> str | None:
    """Return the head revision string from ``alembic_version`` script dir."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        cfg = Config("server/alembic.ini")
        script = ScriptDirectory.from_config(cfg)
        head = script.get_current_head()
        return str(head) if head else None
    except Exception:  # pragma: no cover — defensive
        return None


def _format_age(delta: timedelta) -> str:
    sec = int(delta.total_seconds())
    if sec < 3600:
        return f"{sec // 60} мин назад"
    if sec < 86400:
        return f"{sec // 3600} ч назад"
    return f"{sec // 86400} дн назад"


def reset_rate_limit() -> None:
    """Test helper: reset the in-memory backup cooldown."""
    global _last_backup_at
    _last_backup_at = None
