"""Admin / backup / restore / health integration tests — Stage 4.

The actual ``pg_dump`` / ``pg_restore`` invocations are stubbed out by
monkey-patching ``backup_service._run_pg_dump`` / ``_run_pg_restore``.
Tests focus on the orchestration logic specified in §T.5 + §T.7.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_header

# ─── helpers ─────────────────────────────────────────────────────────────


@pytest.fixture()
def fake_backup_dir(tmp_path: Path, monkeypatch):
    """Replace BACKUP_DIR with a temp directory + stub pg_dump/pg_restore."""
    monkeypatch.setattr("services.backup_service.BACKUP_DIR", tmp_path)
    monkeypatch.setattr("services.admin_service.BACKUP_DIR", tmp_path)

    def _fake_dump(target: Path) -> None:
        target.write_bytes(b"FAKE-PGDUMP-PAYLOAD")

    def _fake_restore(source: Path) -> None:
        # noop — the orchestration around it is what matters.
        assert source.exists()

    monkeypatch.setattr("services.backup_service._run_pg_dump", _fake_dump)
    monkeypatch.setattr("services.backup_service._run_pg_restore", _fake_restore)

    # Reset the in-memory rate-limit between tests.
    from services import backup_service

    backup_service.reset_rate_limit()
    return tmp_path


# ─── Backup create / list / delete ───────────────────────────────────────


def test_backup_create_returns_filename_and_size(
    client: TestClient, admin_token, fake_backup_dir,
):
    r = client.post("/api/admin/backup", headers=auth_header(admin_token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["filename"].endswith(".dump")
    assert body["size_mb"] >= 0
    assert (fake_backup_dir / body["filename"]).exists()


def test_backup_create_rate_limit_429_on_second_call(
    client: TestClient, admin_token, fake_backup_dir,
):
    r1 = client.post("/api/admin/backup", headers=auth_header(admin_token))
    assert r1.status_code == 201
    r2 = client.post("/api/admin/backup", headers=auth_header(admin_token))
    assert r2.status_code == 429
    assert "Retry-After" in r2.headers


def test_backup_list_returns_sorted_by_age(
    client: TestClient, admin_token, fake_backup_dir,
):
    # Two fake backups with monotonically increasing mtimes.
    now = time.time()
    for i in range(2):
        p = fake_backup_dir / f"epicase-2026010{i + 1}-000000.dump"
        p.write_bytes(b"x")
        # Newer file has higher mtime.
        import os as _os

        _os.utime(p, (now + i, now + i))

    r = client.get("/api/admin/backup", headers=auth_header(admin_token))
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    # Sorted descending by mtime → first is newer.
    assert items[0]["filename"].endswith("000002-000000.dump") or \
           items[0]["filename"] >= items[1]["filename"]


def test_backup_delete_success(
    client: TestClient, admin_token, fake_backup_dir,
):
    target = fake_backup_dir / "to-delete.dump"
    target.write_bytes(b"x")
    r = client.delete(
        f"/api/admin/backup/{target.name}",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 204
    assert not target.exists()


def test_backup_delete_path_traversal_blocked(
    client: TestClient, admin_token, fake_backup_dir,
):
    r = client.delete(
        "/api/admin/backup/..%2F..%2Fetc%2Fpasswd",
        headers=auth_header(admin_token),
    )
    assert r.status_code in (400, 404)
    # Even with a literal "../" the response must not 200/204.
    r2 = client.delete(
        "/api/admin/backup/../../etc/passwd",
        headers=auth_header(admin_token),
    )
    assert r2.status_code in (400, 404)


def test_backup_delete_nonexistent_404(
    client: TestClient, admin_token, fake_backup_dir,
):
    r = client.delete(
        "/api/admin/backup/does-not-exist.dump",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 404


# ─── Restore (§T.5 orchestration) ────────────────────────────────────────


def _seed_backup(fake_backup_dir: Path, name: str = "restore-me.dump") -> str:
    p = fake_backup_dir / name
    p.write_bytes(b"FAKE-DUMP")
    return name


def test_restore_happy_path(
    client: TestClient, admin_token, fake_backup_dir, db_session: Session,
):
    name = _seed_backup(fake_backup_dir)
    r = client.post(
        f"/api/admin/restore/{name}",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "started"


def test_restore_abandons_active_attempts(
    client: TestClient, admin_token, teacher_token, student_token, student_user,
    fake_backup_dir, db_session: Session,
):
    """§T.5 step 5 — every in_progress attempt is abandoned before pg_restore."""
    from models.attempt import Attempt
    from models.user import Group

    grp = Group(name="Restore world")
    db_session.add(grp)
    db_session.flush()
    student_user.group_id = grp.id
    db_session.flush()

    sid = client.post(
        "/api/scenarios/",
        json={"title": "Restore S", "description": "x", "passing_score": 50},
        headers=auth_header(teacher_token),
    ).json()["id"]
    client.put(
        f"/api/scenarios/{sid}/graph",
        json={
            "nodes": [
                {"id": "s", "type": "start", "position": {"x": 0, "y": 0},
                 "data": {}, "title": "S"},
                {"id": "f", "type": "final", "position": {"x": 1, "y": 0},
                 "data": {}, "title": "F"},
            ],
            "edges": [
                {"id": "e1", "source": "s", "target": "f", "label": None,
                 "data": {"is_correct": True, "score_delta": 0}},
            ],
        },
        headers=auth_header(teacher_token),
    )
    client.post(f"/api/scenarios/{sid}/publish",
                headers=auth_header(teacher_token))
    client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": grp.id},
        headers=auth_header(teacher_token),
    )
    aid = client.post(
        "/api/attempts/start", json={"scenario_id": sid},
        headers=auth_header(student_token),
    ).json()["attempt_id"]

    name = _seed_backup(fake_backup_dir)
    r = client.post(
        f"/api/admin/restore/{name}",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 202

    db_session.expire_all()
    refreshed = db_session.get(Attempt, aid)
    assert refreshed.status == "abandoned"


def test_restore_maintenance_mode_off_on_success(
    client: TestClient, admin_token, fake_backup_dir, db_session: Session,
):
    from models.system import SystemSetting

    name = _seed_backup(fake_backup_dir)
    r = client.post(
        f"/api/admin/restore/{name}",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 202

    db_session.expire_all()
    setting = db_session.get(SystemSetting, "maintenance_mode")
    assert setting is not None
    # On success the final state is "false".
    assert setting.value == "false"


def test_restore_maintenance_mode_off_on_failure(
    client: TestClient, admin_token, fake_backup_dir, db_session: Session,
    monkeypatch,
):
    """Even if pg_restore raises, maintenance_mode must be cleared (finally block)."""
    import subprocess

    from models.system import SystemSetting

    def _boom(_target):
        raise subprocess.CalledProcessError(1, "pg_restore", stderr=b"bang")

    monkeypatch.setattr("services.backup_service._run_pg_restore", _boom)

    name = _seed_backup(fake_backup_dir)
    r = client.post(
        f"/api/admin/restore/{name}",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 500

    db_session.expire_all()
    setting = db_session.get(SystemSetting, "maintenance_mode")
    assert setting is not None
    assert setting.value == "false"


def test_restore_path_traversal_blocked(
    client: TestClient, admin_token, fake_backup_dir,
):
    r = client.post(
        "/api/admin/restore/../etc/passwd",
        headers=auth_header(admin_token),
    )
    assert r.status_code in (400, 404)


# ─── Sysinfo / settings / logs / health ──────────────────────────────────


def test_sysinfo_returns_version_and_uptime(
    client: TestClient, admin_token,
):
    r = client.get("/api/admin/sysinfo", headers=auth_header(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version"]
    assert isinstance(body["uptime_hours"], (int, float))
    assert isinstance(body["maintenance_mode"], bool)


def test_logs_pagination_and_filter_by_level(
    client: TestClient, admin_token, db_session: Session,
):
    from models.system import SystemLog

    for i in range(3):
        db_session.add(SystemLog(level="ERROR", logger="t", message=f"err {i}"))
    for i in range(2):
        db_session.add(SystemLog(level="INFO", logger="t", message=f"info {i}"))
    db_session.flush()

    r = client.get(
        "/api/admin/logs?level=ERROR&page=1&per_page=10",
        headers=auth_header(admin_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert all(it["level"] == "ERROR" for it in body["items"])


def test_settings_put_is_idempotent(
    client: TestClient, admin_token,
):
    body = {"institution_name": "ВМедА", "idle_timeout_min": 45}
    r1 = client.put(
        "/api/admin/settings", json=body, headers=auth_header(admin_token)
    )
    assert r1.status_code == 200, r1.text
    r2 = client.put(
        "/api/admin/settings", json=body, headers=auth_header(admin_token)
    )
    assert r2.status_code == 200
    assert r2.json()["institution_name"] == "ВМедА"
    assert r2.json()["idle_timeout_min"] == 45


def test_admin_endpoints_require_admin_role(
    client: TestClient, teacher_token, student_token,
):
    for token in (teacher_token, student_token):
        for path in (
            "/api/admin/sysinfo",
            "/api/admin/settings",
            "/api/admin/logs",
            "/api/admin/backup",
        ):
            r = client.get(path, headers=auth_header(token))
            assert r.status_code in (401, 403), (token, path, r.status_code)


def test_health_check_all_5_components(
    client: TestClient, db_session: Session,
):
    r = client.get("/api/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] in ("ok", "warning", "error")
    assert set(body["checks"].keys()) >= {
        "db", "disk", "backup", "scheduler", "errors_24h",
    }
    assert body["version"]


# ─── Logs retention (§T.4) ───────────────────────────────────────────────


def test_cleanup_old_logs_respects_retention(db_session: Session):
    from models.system import SystemLog
    from services.admin_service import cleanup_old_logs

    now = datetime.now(tz=UTC)
    # DEBUG older than 7 days → delete; INFO 10 days → keep; WARNING 400 days → delete.
    for level, age_days, expected_delete in (
        ("DEBUG", 8, True),
        ("DEBUG", 1, False),
        ("INFO", 10, False),
        ("INFO", 40, True),
        ("WARNING", 366, True),
        ("WARNING", 100, False),
    ):
        row = SystemLog(level=level, logger="t", message=f"{level}-{age_days}")
        db_session.add(row)
        db_session.flush()
        # Force created_at backdate.
        row.created_at = now - timedelta(days=age_days)
        row.__expected_delete__ = expected_delete  # type: ignore[attr-defined]
    db_session.flush()

    cleanup_old_logs(db_session)
    db_session.flush()

    survivors = db_session.query(SystemLog).all()
    survived_msgs = {s.message for s in survivors}
    assert "DEBUG-1" in survived_msgs
    assert "INFO-10" in survived_msgs
    assert "WARNING-100" in survived_msgs
    assert "DEBUG-8" not in survived_msgs
    assert "INFO-40" not in survived_msgs
    assert "WARNING-366" not in survived_msgs
