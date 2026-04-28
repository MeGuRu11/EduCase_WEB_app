"""Analytics integration tests — Stage 4 §6.6 + §R.6.

Covers ``services.analytics_service`` end-to-end via the public API.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_header

# ─── helpers ─────────────────────────────────────────────────────────────


def _trivial_graph() -> dict:
    return {
        "nodes": [
            {"id": "s", "type": "start", "position": {"x": 0, "y": 0},
             "data": {}, "title": "S"},
            {"id": "d", "type": "decision", "position": {"x": 1, "y": 0},
             "data": {
                 "question": "?",
                 "options": [
                     {"id": "o1", "text": "A"},
                     {"id": "o2", "text": "B"},
                 ],
                 "max_score": 10.0,
             }, "title": "D"},
            {"id": "f", "type": "final", "position": {"x": 2, "y": 0},
             "data": {}, "title": "F"},
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "d", "label": None,
             "data": {"is_correct": True, "score_delta": 0}},
            {"id": "e2", "source": "d", "target": "f", "label": None,
             "data": {"is_correct": True, "score_delta": 0, "option_id": "o1"}},
            {"id": "e3", "source": "d", "target": "f", "label": None,
             "data": {"is_correct": False, "score_delta": 0, "option_id": "o2"}},
        ],
    }


def _publish_and_assign(client, teacher_token, student_user, db_session):
    from models.user import Group

    grp = Group(name=f"AGroup {student_user.id}")
    db_session.add(grp)
    db_session.flush()
    student_user.group_id = grp.id
    db_session.flush()

    sid = client.post(
        "/api/scenarios/",
        json={"title": "Analytics-S", "description": "x", "passing_score": 50},
        headers=auth_header(teacher_token),
    ).json()["id"]
    client.put(
        f"/api/scenarios/{sid}/graph", json=_trivial_graph(),
        headers=auth_header(teacher_token),
    )
    client.post(f"/api/scenarios/{sid}/publish",
                headers=auth_header(teacher_token))
    client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": grp.id},
        headers=auth_header(teacher_token),
    )
    return sid, grp.id


def _walk_attempt(client, student_token, sid: int, *, choose: str = "o1") -> int:
    aid = client.post(
        "/api/attempts/start", json={"scenario_id": sid},
        headers=auth_header(student_token),
    ).json()["attempt_id"]
    client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "s", "action": "view_data",
              "answer_data": {}, "time_spent_sec": 1},
        headers=auth_header(student_token),
    )
    client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "d", "action": "choose_option",
              "answer_data": {"selected_option_id": choose},
              "time_spent_sec": 2},
        headers=auth_header(student_token),
    )
    client.post(f"/api/attempts/{aid}/finish",
                headers=auth_header(student_token))
    return aid


# ─── Student dashboard ─────────────────────────────────────────────────


def test_student_dashboard_returns_attempt_stats(
    client: TestClient, teacher_token, student_token, student_user, db_session: Session,
):
    sid, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid, choose="o1")
    _walk_attempt(client, student_token, sid, choose="o2")

    r = client.get("/api/analytics/student/dashboard",
                   headers=auth_header(student_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_scenarios"] == 2
    assert body["completed_scenarios"] == 2
    assert body["best_score"] >= body["avg_score"]
    assert isinstance(body["recent_attempts"], list)
    assert len(body["recent_attempts"]) == 2


def test_student_dashboard_empty_for_new_student(
    client: TestClient, student_token, student_user,
):
    r = client.get("/api/analytics/student/dashboard",
                   headers=auth_header(student_token))
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "total_scenarios": 0,
        "completed_scenarios": 0,
        "in_progress_scenarios": 0,
        "avg_score": 0.0,
        "best_score": 0.0,
        "total_time_hours": 0.0,
        "recent_attempts": [],
    }


def test_student_dashboard_only_own_data(
    client: TestClient, teacher_token, student_token, student_user, db_session: Session,
):
    """Student A has attempts. Student B should still see an empty dashboard."""
    sid, grp_id = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid)

    from models.user import Role, User
    from services.auth_service import AuthService

    student_role = db_session.query(Role).filter_by(name="student").one()
    other = User(
        username="ana_other",
        password_hash=AuthService.hash_password("Other123!"),
        full_name="Other Student",
        role_id=student_role.id,
        group_id=grp_id,
    )
    db_session.add(other)
    db_session.flush()

    other_token = client.post(
        "/api/auth/login",
        json={"username": "ana_other", "password": "Other123!"},
    ).json()["access_token"]

    r = client.get("/api/analytics/student/dashboard",
                   headers=auth_header(other_token))
    assert r.status_code == 200
    assert r.json()["total_scenarios"] == 0


# ─── Teacher scenario stats ────────────────────────────────────────────


def test_teacher_scenario_stats_aggregates_by_scenario(
    client: TestClient, teacher_token, student_token, student_user, db_session: Session,
):
    sid, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid, choose="o1")

    r = client.get("/api/analytics/teacher/scenarios",
                   headers=auth_header(teacher_token))
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    target = next(it for it in items if it["scenario_id"] == sid)
    assert target["completed"] >= 1
    assert target["total_students"] >= 1
    assert target["avg_score"] > 0
    # Score distribution must have 5 buckets (six bins → 5 ranges).
    assert len(target["score_distribution"]["counts"]) == 5


def test_teacher_scenario_stats_scoped_to_own_scenarios(
    client: TestClient, teacher_token, student_token, student_user, db_session: Session,
):
    """Another teacher's scenarios must not appear in the teacher's stats."""
    from models.user import Role, User
    from services.auth_service import AuthService

    teacher_role = db_session.query(Role).filter_by(name="teacher").one()
    other_teacher = User(
        username="ana_other_teacher",
        password_hash=AuthService.hash_password("OtherT12!"),
        full_name="Other Teacher",
        role_id=teacher_role.id,
    )
    db_session.add(other_teacher)
    db_session.flush()
    other_token = client.post(
        "/api/auth/login",
        json={"username": "ana_other_teacher", "password": "OtherT12!"},
    ).json()["access_token"]

    sid_self, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid_self)

    r = client.get("/api/analytics/teacher/scenarios",
                   headers=auth_header(other_token))
    assert r.status_code == 200
    assert r.json() == []  # no scenarios authored


def test_teacher_scenario_stats_student_breakdown(
    client: TestClient, teacher_token, student_token, student_user, db_session: Session,
):
    sid, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid)

    r = client.get(f"/api/analytics/teacher/scenarios?scenario_id={sid}",
                   headers=auth_header(teacher_token))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    ranking = body[0]["student_ranking"]
    assert any(entry["user_id"] == student_user.id for entry in ranking)


# ─── Path heatmap ──────────────────────────────────────────────────────


def test_path_heatmap_counts_edge_traversals(
    client: TestClient, teacher_token, student_token, student_user, db_session: Session,
):
    sid, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid, choose="o1")

    r = client.get(f"/api/analytics/teacher/heatmap/{sid}",
                   headers=auth_header(teacher_token))
    assert r.status_code == 200
    body = r.json()
    assert body["scenario_id"] == sid
    assert body["total_attempts"] == 1
    # Sum across all edges connecting the same (source, target) pair —
    # the decision node has two parallel edges (correct + incorrect option),
    # only one of which is traversed per attempt.
    d_to_f_total = sum(
        e["traverse_count"]
        for e in body["edges"]
        if e["source"] == "d" and e["target"] == "f"
    )
    assert d_to_f_total >= 1
    # Visit count on the decision node also reflects the traversal.
    by_node = {n["id"]: n for n in body["nodes"]}
    assert by_node["d"]["visit_count"] >= 1


def test_path_heatmap_empty_for_no_attempts(
    client: TestClient, teacher_token, student_user, db_session: Session,
):
    sid, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    r = client.get(f"/api/analytics/teacher/heatmap/{sid}",
                   headers=auth_header(teacher_token))
    assert r.status_code == 200
    body = r.json()
    assert body["total_attempts"] == 0
    assert all(e["traverse_count"] == 0 for e in body["edges"])


# ─── Admin stats ───────────────────────────────────────────────────────


def test_admin_stats_returns_counts(
    client: TestClient, admin_token, teacher_token, student_token, student_user,
    db_session: Session,
):
    sid, _ = _publish_and_assign(client, teacher_token, student_user, db_session)
    _walk_attempt(client, student_token, sid)

    r = client.get("/api/analytics/admin/stats", headers=auth_header(admin_token))
    assert r.status_code == 200, r.text
    body = r.json()
    for key in (
        "users_total", "students", "teachers", "admins",
        "scenarios_total", "published_scenarios",
        "attempts_today", "attempts_total",
    ):
        assert isinstance(body[key], int) and body[key] >= 0
    assert body["scenarios_total"] >= 1
    assert body["attempts_total"] >= 1


def test_admin_stats_includes_db_size(
    client: TestClient, admin_token,
):
    r = client.get("/api/analytics/admin/stats", headers=auth_header(admin_token))
    assert r.status_code == 200
    assert r.json()["db_size_mb"] >= 0.0


# ─── Export ────────────────────────────────────────────────────────────


def test_export_analytics_xlsx_content_type(
    client: TestClient, teacher_token,
):
    r = client.get("/api/analytics/export?format=xlsx",
                   headers=auth_header(teacher_token))
    assert r.status_code == 200, r.text
    assert (
        r.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(r.content) > 0


def test_export_analytics_pdf_content_type(
    client: TestClient, teacher_token,
):
    r = client.get("/api/analytics/export?format=pdf",
                   headers=auth_header(teacher_token))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")


def test_export_requires_auth(client: TestClient):
    r = client.get("/api/analytics/export?format=xlsx")
    assert r.status_code in (401, 403)
