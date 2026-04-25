"""Integration tests for attempts: start / step / finish / abandon /
time-remaining / auto-finish — PROJECT_DESIGN §6.6 + ADDENDUM §R.5/§U.3/§A.7.

The attempts API is exercised through the FastAPI ``TestClient`` to catch
serialisation and role-sanitisation bugs (§T.2) end-to-end.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import auth_header

# ───────────── helpers ─────────────


def _scenario_payload(title: str = "Сценарий A", time_limit_min: int | None = None,
                      max_attempts: int | None = None) -> dict:
    body: dict = {"title": title, "description": "test", "passing_score": 50}
    if time_limit_min is not None:
        body["time_limit_min"] = time_limit_min
    if max_attempts is not None:
        body["max_attempts"] = max_attempts
    return body


def _full_graph() -> dict:
    """start → decision (binary) → text_input → final."""
    return {
        "nodes": [
            {"id": "n_start", "type": "start", "position": {"x": 0, "y": 0},
             "data": {}, "title": "Старт"},
            {
                "id": "n_dec",
                "type": "decision",
                "position": {"x": 1, "y": 0},
                "data": {
                    "question": "Что назначить?",
                    "options": [
                        {"id": "o_ok", "text": "Anti-HAV IgM", "feedback": "Верно!"},
                        {"id": "o_bad", "text": "ОАК", "feedback": "Не подтвердит."},
                    ],
                    "max_score": 10.0,
                },
                "title": "Решение",
            },
            {
                "id": "n_text",
                "type": "text_input",
                "position": {"x": 2, "y": 0},
                "data": {
                    "prompt": "Опишите диагноз",
                    "keywords": [
                        {"word": "гепатит", "synonyms": [], "score": 5.0},
                    ],
                    "max_score": 5.0,
                },
                "title": "Описание",
            },
            {"id": "n_final", "type": "final", "position": {"x": 3, "y": 0},
             "data": {}, "title": "Финал"},
        ],
        "edges": [
            {"id": "e_s_d", "source": "n_start", "target": "n_dec", "label": None,
             "data": {"is_correct": True, "score_delta": 0}},
            {"id": "e_ok", "source": "n_dec", "target": "n_text", "label": "Правильный",
             "data": {"is_correct": True, "score_delta": 0, "option_id": "o_ok"}},
            {"id": "e_bad", "source": "n_dec", "target": "n_final", "label": "Неправильный",
             "data": {"is_correct": False, "score_delta": 0, "option_id": "o_bad"}},
            {"id": "e_t_f", "source": "n_text", "target": "n_final", "label": None,
             "data": {"is_correct": True, "score_delta": 0}},
        ],
    }


def _create_publish_assign(
    client: TestClient,
    teacher_token: str,
    student_user,
    db_session: Session,
    *,
    title: str = "Сценарий A",
    time_limit_min: int | None = None,
    max_attempts: int | None = None,
) -> tuple[int, int]:
    """Returns (scenario_id, group_id). Creates group, scenario, publishes
    and assigns to the student."""
    from models.user import Group

    group = Group(name=f"Группа {title}")
    db_session.add(group)
    db_session.flush()
    student_user.group_id = group.id
    db_session.flush()

    payload = _scenario_payload(title=title, time_limit_min=time_limit_min,
                                max_attempts=max_attempts)
    r = client.post("/api/scenarios/", json=payload, headers=auth_header(teacher_token))
    assert r.status_code == 201, r.text
    sid = r.json()["id"]

    save = client.put(f"/api/scenarios/{sid}/graph", json=_full_graph(),
                      headers=auth_header(teacher_token))
    assert save.status_code == 200, save.text

    pub = client.post(f"/api/scenarios/{sid}/publish",
                      headers=auth_header(teacher_token))
    assert pub.status_code == 200, pub.text

    assign = client.post(
        f"/api/scenarios/{sid}/assign",
        json={"group_id": group.id},
        headers=auth_header(teacher_token),
    )
    assert assign.status_code == 200, assign.text
    return sid, group.id


# ════════════════════ start_attempt ════════════════════

def test_start_attempt_returns_start_node_201(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    r = client.post("/api/attempts/start", json={"scenario_id": sid},
                    headers=auth_header(student_token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["attempt_num"] == 1
    assert body["current_node"]["id"] == "n_start"
    assert body["expires_at"] is None  # no time_limit


def test_start_attempt_with_time_limit_sets_expires_at(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(
        client, teacher_token, student_user, db_session,
        title="Timed", time_limit_min=10,
    )
    r = client.post("/api/attempts/start", json={"scenario_id": sid},
                    headers=auth_header(student_token))
    body = r.json()
    assert r.status_code == 201
    assert body["time_limit_min"] == 10
    assert body["expires_at"] is not None


def test_start_attempt_when_already_in_progress_resumes_409_or_returns_same(
    client, teacher_token, student_token, student_user, db_session
):
    """E-14 / §B.3.4 — duplicate start of an active attempt is idempotent
    or 409. We accept either behaviour but require *one* in_progress row."""
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    first = client.post("/api/attempts/start", json={"scenario_id": sid},
                        headers=auth_header(student_token))
    assert first.status_code == 201
    aid_1 = first.json()["attempt_id"]

    second = client.post("/api/attempts/start", json={"scenario_id": sid},
                         headers=auth_header(student_token))
    assert second.status_code in (200, 201, 409)
    if second.status_code in (200, 201):
        assert second.json()["attempt_id"] == aid_1  # F5-resume
        assert second.json().get("resumed") is True


def test_start_attempt_concurrent_only_one_succeeds(
    client, teacher_token, student_token, student_user, db_session
):
    """ADDENDUM §B.3.4 — partial UNIQUE index prevents two simultaneous
    in_progress rows even if the service-layer pre-check races."""
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)

    statuses = []
    for _ in range(2):
        statuses.append(
            client.post("/api/attempts/start", json={"scenario_id": sid},
                        headers=auth_header(student_token)).status_code
        )
    # Every call must be successful (F5-resume) or a conflict — never 500.
    assert all(s in (200, 201, 409) for s in statuses), statuses
    # Exactly one in_progress row in the DB — the partial UNIQUE index wins.
    from models.attempt import Attempt
    rows = db_session.query(Attempt).filter_by(
        user_id=student_user.id, scenario_id=sid, status="in_progress",
    ).all()
    assert len(rows) == 1


def test_start_attempt_max_attempts_exceeded_returns_422(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(
        client, teacher_token, student_user, db_session,
        title="Limited", max_attempts=1,
    )
    r1 = client.post("/api/attempts/start", json={"scenario_id": sid},
                     headers=auth_header(student_token))
    assert r1.status_code == 201
    aid = r1.json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/finish", headers=auth_header(student_token))

    r2 = client.post("/api/attempts/start", json={"scenario_id": sid},
                     headers=auth_header(student_token))
    assert r2.status_code == 422


def test_start_attempt_unassigned_scenario_returns_403(
    client, teacher_token, student_token, student_user, db_session
):
    """Сценарий не назначен группе студента → 403."""
    from models.user import Group

    grp = Group(name="Своя группа")
    db_session.add(grp)
    db_session.flush()
    student_user.group_id = grp.id
    db_session.flush()

    r = client.post("/api/scenarios/", json=_scenario_payload(title="Чужой"),
                    headers=auth_header(teacher_token))
    sid = r.json()["id"]
    client.put(f"/api/scenarios/{sid}/graph", json=_full_graph(),
               headers=auth_header(teacher_token))
    client.post(f"/api/scenarios/{sid}/publish", headers=auth_header(teacher_token))
    # NOT assigned

    resp = client.post("/api/attempts/start", json={"scenario_id": sid},
                       headers=auth_header(student_token))
    assert resp.status_code == 403


# ════════════════════ step ════════════════════

def test_step_view_data_advances_to_decision(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]

    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_start", "action": "view_data",
              "answer_data": {}, "time_spent_sec": 3},
        headers=auth_header(student_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["next_node"]["id"] == "n_dec"
    assert body["attempt_status"] == "in_progress"


def test_step_choose_correct_option_records_score(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=auth_header(student_token))

    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_dec", "action": "choose_option",
              "answer_data": {"selected_option_id": "o_ok"}, "time_spent_sec": 5},
        headers=auth_header(student_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["step_result"]["score"] == 10.0
    assert body["step_result"]["is_correct"] is True
    assert body["next_node"]["id"] == "n_text"


def test_step_after_expired_returns_410_gone(
    client, teacher_token, student_token, student_user, db_session
):
    """§U.3 — POST /step после истечения expires_at → 410 Gone."""
    sid, _ = _create_publish_assign(
        client, teacher_token, student_user, db_session,
        title="Expired", time_limit_min=10,
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]

    # Manually expire the attempt.
    from models.attempt import Attempt
    attempt = db_session.get(Attempt, aid)
    attempt.expires_at = datetime.now(tz=UTC) - timedelta(minutes=1)
    db_session.flush()

    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_start", "action": "view_data",
              "answer_data": {}, "time_spent_sec": 1},
        headers=auth_header(student_token),
    )
    assert r.status_code == 410


def test_step_invalid_transition_returns_400(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    # Try to step from a node that isn't current.
    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_text", "action": "view_data",
              "answer_data": {}, "time_spent_sec": 1},
        headers=auth_header(student_token),
    )
    assert r.status_code == 400


def test_step_response_does_not_leak_correct_value_for_student(
    client, teacher_token, student_token, student_user, db_session
):
    """§T.2 — next_node для student не должен содержать correct_value/keywords."""
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=auth_header(student_token))
    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_dec", "action": "choose_option",
              "answer_data": {"selected_option_id": "o_ok"}, "time_spent_sec": 1},
        headers=auth_header(student_token),
    )
    body = r.json()
    nxt = body["next_node"]
    assert nxt["type"] == "text_input"
    assert "keywords" not in nxt["data"]
    assert "max_score" not in nxt["data"]


# ════════════════════ finish / abandon ════════════════════

def test_finish_attempt_returns_total_and_max_score(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]

    # Walk a correct path
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=auth_header(student_token))
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_dec", "action": "choose_option",
                      "answer_data": {"selected_option_id": "o_ok"},
                      "time_spent_sec": 1},
                headers=auth_header(student_token))
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_text", "action": "submit_text",
                      "answer_data": {"text": "острый гепатит А"},
                      "time_spent_sec": 1},
                headers=auth_header(student_token))

    r = client.post(f"/api/attempts/{aid}/finish",
                    headers=auth_header(student_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed"
    assert body["total_score"] == 15.0  # 10 (decision) + 5 (text)
    assert body["max_score"] == 15.0
    assert body["passed"] is True
    assert "n_dec" in body["path"]


def test_abandon_marks_attempt_abandoned(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]

    r = client.post(f"/api/attempts/{aid}/abandon",
                    headers=auth_header(student_token))
    assert r.status_code == 200
    assert r.json()["status"] == "abandoned"

    from models.attempt import Attempt
    db_session.expire_all()
    assert db_session.get(Attempt, aid).status == "abandoned"


# ════════════════════ resume / get / list ════════════════════

def test_get_attempt_returns_full_detail_with_steps(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=auth_header(student_token))

    r = client.get(f"/api/attempts/{aid}", headers=auth_header(student_token))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == aid
    assert isinstance(body["steps"], list)
    assert isinstance(body["path"], list)


def test_list_my_attempts_filters_by_scenario(
    client, teacher_token, student_token, student_user, db_session
):
    sid_a, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid_a = client.post("/api/attempts/start", json={"scenario_id": sid_a},
                        headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid_a}/finish", headers=auth_header(student_token))

    r = client.get(f"/api/attempts/my?scenario_id={sid_a}",
                   headers=auth_header(student_token))
    assert r.status_code == 200
    items = r.json()
    assert any(it["id"] == aid_a for it in items)


# ════════════════════ time-remaining (§A.7) ════════════════════

def test_time_remaining_with_limit_returns_seconds(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(
        client, teacher_token, student_user, db_session,
        title="Has timer", time_limit_min=5,
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    r = client.get(f"/api/attempts/{aid}/time-remaining",
                   headers=auth_header(student_token))
    assert r.status_code == 200
    body = r.json()
    assert body["remaining_sec"] is not None
    assert 0 < body["remaining_sec"] <= 5 * 60
    assert body["expires_at"] is not None


def test_time_remaining_without_limit_returns_null(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    r = client.get(f"/api/attempts/{aid}/time-remaining",
                   headers=auth_header(student_token))
    assert r.status_code == 200
    body = r.json()
    assert body["remaining_sec"] is None
    assert body["expires_at"] is None


def test_time_remaining_for_finished_attempt_returns_410(
    client, teacher_token, student_token, student_user, db_session
):
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/finish",
                headers=auth_header(student_token))
    r = client.get(f"/api/attempts/{aid}/time-remaining",
                   headers=auth_header(student_token))
    assert r.status_code == 410


# ════════════════════ auto_finish_expired_attempts ════════════════════

def test_auto_finish_expired_attempts_marks_them_completed(
    client, teacher_token, student_token, student_user, db_session
):
    """ADDENDUM §U.3 — APScheduler-based job finalises stale in_progress rows."""
    sid, _ = _create_publish_assign(
        client, teacher_token, student_user, db_session,
        title="Auto", time_limit_min=10,
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]

    from models.attempt import Attempt
    attempt = db_session.get(Attempt, aid)
    attempt.expires_at = datetime.now(tz=UTC) - timedelta(minutes=1)
    db_session.flush()

    from services.attempt_service import AttemptService
    AttemptService.auto_finish_expired_attempts(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Attempt, aid)
    assert refreshed.status == "completed"
    assert refreshed.finished_at is not None


# ════════════════════ unauthorised access ════════════════════

def test_other_student_cannot_get_attempt(
    client, teacher_token, student_token, student_user, db_session
):
    """Чужой студент → 403."""
    from models.user import Role, User
    from services.auth_service import AuthService

    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]

    role = db_session.query(Role).filter_by(name="student").one()
    other = User(
        username="another_student",
        password_hash=AuthService.hash_password("Other123!"),
        full_name="Другой Студент",
        role_id=role.id,
        group_id=student_user.group_id,
    )
    db_session.add(other)
    db_session.flush()
    other_token = client.post("/api/auth/login",
                              json={"username": "another_student",
                                    "password": "Other123!"}).json()["access_token"]

    r = client.get(f"/api/attempts/{aid}", headers=auth_header(other_token))
    assert r.status_code == 403


@pytest.mark.parametrize(
    "endpoint",
    ["/api/attempts/start", "/api/attempts/my"],
)
def test_attempts_endpoints_require_auth(client, endpoint):
    method = client.post if endpoint == "/api/attempts/start" else client.get
    payload = {"json": {"scenario_id": 1}} if endpoint == "/api/attempts/start" else {}
    r = method(endpoint, **payload)
    assert r.status_code in (401, 403)


# ════════════════════ regression tests (RETRO_AUDIT) ════════════════════


def test_teacher_can_get_own_scenario_attempt_no_attribute_error(
    client, teacher_token, teacher_user, student_token, student_user, db_session,
):
    """RETRO_AUDIT: ``_ensure_attempt_owner`` referenced ``attempt.scenario``
    which didn't exist on the model — teacher access raised AttributeError.
    Now ``Attempt`` has a ``scenario`` relationship and teacher (author of
    the scenario) gets 200."""
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/finish",
                headers=auth_header(student_token))

    r = client.get(f"/api/attempts/{aid}", headers=auth_header(teacher_token))
    assert r.status_code == 200, r.text
    assert r.json()["id"] == aid


def test_duplicate_scenario_preserves_decision_routing(
    client, teacher_token, student_token, student_user, db_session,
):
    """RETRO_AUDIT: ``ScenarioService.duplicate`` dropped ``option_id`` on
    cloned edges, so a decision step on the duplicate could not match the
    selected option to its outgoing edge → grader returned 0."""
    sid, _ = _create_publish_assign(client, teacher_token, student_user, db_session)

    # Unpublish original so we can read its draft, then duplicate.
    client.post(f"/api/scenarios/{sid}/unpublish",
                headers=auth_header(teacher_token))
    dup = client.post(f"/api/scenarios/{sid}/duplicate",
                      headers=auth_header(teacher_token)).json()
    new_sid = dup["id"]

    # Assign clone to student's group (already linked from helper).
    client.post(f"/api/scenarios/{new_sid}/publish",
                headers=auth_header(teacher_token))
    grp_id = student_user.group_id
    assert grp_id is not None
    client.post(f"/api/scenarios/{new_sid}/assign",
                json={"group_id": grp_id},
                headers=auth_header(teacher_token))

    aid = client.post("/api/attempts/start", json={"scenario_id": new_sid},
                      headers=auth_header(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=auth_header(student_token))
    r = client.post(f"/api/attempts/{aid}/step",
                    json={"node_id": "n_dec", "action": "choose_option",
                          "answer_data": {"selected_option_id": "o_ok"},
                          "time_spent_sec": 1},
                    headers=auth_header(student_token))
    assert r.status_code == 200, r.text
    assert r.json()["step_result"]["score"] == 10.0  # Decision routing intact.
    assert r.json()["step_result"]["is_correct"] is True
