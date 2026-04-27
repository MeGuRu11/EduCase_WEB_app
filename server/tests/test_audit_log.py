"""Tests for ``services.audit_service`` + integration in mutation paths.

Coverage targets per pre-Stage-4 hardening Task 1:
* user mutations write audit (``user.create``, ``user.bulk_csv``)
* scenario mutations write audit with actor + meta
* attempt finalise routes the right ``actor_id`` (system vs student)
* migration 005 indexes are present
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import inspect

from models.audit_log import AuditLog


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ─── Migration shape ────────────────────────────────────────────────────


def test_audit_log_indexes_present(db_engine) -> None:
    inspector = inspect(db_engine)
    expected = {
        "idx_audit_logs_actor_created",
        "idx_audit_logs_entity",
        "idx_audit_logs_action_created",
    }
    actual = {idx["name"] for idx in inspector.get_indexes("audit_logs")}
    assert expected.issubset(actual), f"Missing audit indexes: {expected - actual}"


# ─── User mutations ─────────────────────────────────────────────────────


def test_create_user_writes_audit_entry(
    client, admin_token, roles, db_session,
) -> None:
    r = client.post(
        "/api/users/",
        headers=_auth_header(admin_token),
        json={
            "username": "audit_target",
            "password": "Audit1234!",
            "full_name": "Аудитный Пользователь",
            "role_id": roles["student"],
        },
    )
    assert r.status_code == 201, r.text
    new_user_id = r.json()["id"]

    db_session.expire_all()
    rows = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "user.create", AuditLog.entity_id == new_user_id)
        .all()
    )
    assert len(rows) == 1
    entry = rows[0]
    assert entry.entity_type == "user"
    assert entry.actor_id is not None  # admin token's user
    assert entry.meta.get("username") == "audit_target"


def test_bulk_csv_writes_single_audit_with_count(
    client, admin_token, roles, db_session,
) -> None:
    csv_body = (
        "username;password;full_name;role;group_name;email\n"
        "bulk_a;Bulk1234!;Bulk Один;student;;\n"
        "bulk_b;Bulk2234!;Bulk Два;student;;\n"
    ).encode("utf-8-sig")

    r = client.post(
        "/api/users/bulk-csv",
        headers=_auth_header(admin_token),
        files={"file": ("users.csv", csv_body, "text/csv")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2

    db_session.expire_all()
    rows = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "user.bulk_csv")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].meta == {"count": 2}
    assert rows[0].entity_type == "user"
    assert rows[0].entity_id is None


# ─── Scenario mutations ─────────────────────────────────────────────────


def test_publish_scenario_writes_audit_with_actor_and_meta(
    client, teacher_token, db_session,
) -> None:
    create = client.post(
        "/api/scenarios/",
        headers=_auth_header(teacher_token),
        json={"title": "Сценарий аудита", "description": "x", "passing_score": 50},
    )
    sid = create.json()["id"]

    graph = {
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
    }
    client.put(
        f"/api/scenarios/{sid}/graph", json=graph,
        headers=_auth_header(teacher_token),
    )
    pub = client.post(
        f"/api/scenarios/{sid}/publish", headers=_auth_header(teacher_token),
    )
    assert pub.status_code == 200

    db_session.expire_all()
    publish_rows = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "scenario.publish", AuditLog.entity_id == sid)
        .all()
    )
    assert len(publish_rows) == 1
    entry = publish_rows[0]
    assert entry.actor_id is not None
    assert entry.entity_type == "scenario"
    assert "version" in entry.meta


# ─── Attempt finalise routing ───────────────────────────────────────────


def test_auto_finish_writes_audit_with_actor_id_null(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    """``time_expired`` reason is the only system path → actor_id must be NULL."""
    from models.attempt import Attempt
    from models.user import Group

    # Set up scenario + assignment.
    grp = Group(name="Audit timer group")
    db_session.add(grp)
    db_session.flush()
    student_user.group_id = grp.id
    db_session.flush()

    create = client.post(
        "/api/scenarios/",
        json={"title": "Timer audit", "description": "x", "passing_score": 50,
              "time_limit_min": 5},
        headers=_auth_header(teacher_token),
    )
    sid = create.json()["id"]
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
        headers=_auth_header(teacher_token),
    )
    client.post(
        f"/api/scenarios/{sid}/publish", headers=_auth_header(teacher_token),
    )
    client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": grp.id},
        headers=_auth_header(teacher_token),
    )

    aid = client.post(
        "/api/attempts/start", json={"scenario_id": sid},
        headers=_auth_header(student_token),
    ).json()["attempt_id"]

    # Manually expire to trigger the system path.
    attempt = db_session.get(Attempt, aid)
    attempt.expires_at = datetime.now(tz=UTC) - timedelta(minutes=1)
    db_session.flush()

    from services.attempt_service import AttemptService
    finished = AttemptService.auto_finish_expired_attempts(db_session)
    assert finished == 1

    rows = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == "attempt.auto_finish",
            AuditLog.entity_id == aid,
        )
        .all()
    )
    assert len(rows) == 1
    assert rows[0].actor_id is None
    assert rows[0].meta.get("reason") == "time_expired"


def test_manual_finish_writes_audit_with_student_actor(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    from models.user import Group

    grp = Group(name="Audit manual group")
    db_session.add(grp)
    db_session.flush()
    student_user.group_id = grp.id
    db_session.flush()

    create = client.post(
        "/api/scenarios/",
        json={"title": "Manual audit", "description": "x", "passing_score": 50},
        headers=_auth_header(teacher_token),
    )
    sid = create.json()["id"]
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
        headers=_auth_header(teacher_token),
    )
    client.post(f"/api/scenarios/{sid}/publish",
                headers=_auth_header(teacher_token))
    client.post(f"/api/scenarios/{sid}/assign",
                json={"group_id": grp.id},
                headers=_auth_header(teacher_token))
    aid = client.post(
        "/api/attempts/start", json={"scenario_id": sid},
        headers=_auth_header(student_token),
    ).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/finish",
                headers=_auth_header(student_token))

    db_session.expire_all()
    rows = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "attempt.finish", AuditLog.entity_id == aid)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].actor_id == student_user.id
    assert rows[0].meta.get("reason") == "manual"


# ─── Pre-Stage-4 Task 5 — RoleName constants ─────────────────────────────


def test_role_constants_match_db(db_session, roles) -> None:
    """RoleName.all() must match the seeded role rows."""
    from sqlalchemy import select

    from models.user import Role, RoleName

    db_roles = {r.name for r in db_session.scalars(select(Role)).all()}
    assert RoleName.all() == db_roles
