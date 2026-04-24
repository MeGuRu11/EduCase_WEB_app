"""Edge cases from PROJECT_DESIGN §16.

Covered here:
    EC-AUTH-01  Пароль ≤ 7 символов → 422 "Минимум 8 символов"
    EC-AUTH-02  5 неверных попыток → lock на 30 мин
    EC-AUTH-03  Refresh token истёк → 401 → клиент делает logout
    EC-AUTH-04  Два браузера одного студента → stateless JWT, оба работают

    EC-SCENARIO-01  Публикация без START-узла → 422 "Нет стартового узла"
    EC-SCENARIO-02  Публикация с недостижимым узлом → 422 "Узел X недостижим"
    EC-SCENARIO-03  Редактирование опубликованного → unpublish → edit → publish
    EC-SCENARIO-04  Удаление опубликованного → 409 "Архивируйте"
    EC-SCENARIO-05  Дублирование → новый сценарий, status=draft, новый author

    EC-ATTEMPT-01  Старт при существующей active → 201/409 (F5-resume или conflict)
    EC-ATTEMPT-02  Превышен max_attempts → 422
    EC-ATTEMPT-03  Переход к несуществующему узлу → 400
    EC-ATTEMPT-04  Время вышло → 410 Gone на next step, auto_finish метит completed
    EC-ATTEMPT-05  F5-resume возвращает ту же попытку (resumed=True)
    EC-ATTEMPT-06  Concurrent finish от одного юзера — идемпотентен, не падает
    EC-ATTEMPT-07  text_input пустой ответ → score=0, не 500
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.orm import Session

from config import JWT_ALGORITHM, JWT_SECRET
from models.user import User

# ─── EC-AUTH-01 ───────────────────────────────────────────────────────────────

def test_ec_auth_01_password_too_short_rejected(
    client: TestClient, admin_token: str, roles: dict[str, int]
) -> None:
    r = client.post(
        "/api/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": "short.pw",
            "password": "Ab1!xyz",  # 7 chars → below min_length=8
            "full_name": "Короткий Пароль",
            "role_id": roles["student"],
        },
    )
    assert r.status_code == 422
    assert any(
        "password" in ".".join(str(p) for p in err["loc"])
        for err in r.json()["detail"]
    )


# ─── EC-AUTH-02 ───────────────────────────────────────────────────────────────

def test_ec_auth_02_five_wrong_attempts_locks_30_minutes(
    client: TestClient, db_session: Session, student_user: User
) -> None:
    for _ in range(4):
        bad = client.post(
            "/api/auth/login",
            json={"username": "student_fixture", "password": "wrong.pw1!"},
        )
        assert bad.status_code == 401

    lock = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "wrong.pw1!"},
    )
    assert lock.status_code == 403

    db_session.refresh(student_user)
    assert student_user.locked_until is not None

    delta = student_user.locked_until - datetime.now(tz=UTC)
    assert timedelta(minutes=29) < delta < timedelta(minutes=31)

    # Even correct password is refused while locked.
    retry = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    )
    assert retry.status_code == 403


# ─── EC-AUTH-03 ───────────────────────────────────────────────────────────────

def test_ec_auth_03_expired_refresh_token_returns_401(
    client: TestClient, student_user: User
) -> None:
    past = datetime.now(tz=UTC) - timedelta(minutes=1)
    expired = jwt.encode(
        {
            "sub": str(student_user.id),
            "type": "refresh",
            "iat": int((past - timedelta(days=1)).timestamp()),
            "exp": int(past.timestamp()),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )

    r = client.post("/api/auth/refresh", json={"refresh_token": expired})
    assert r.status_code == 401


# ─── EC-AUTH-04 ───────────────────────────────────────────────────────────────

def test_ec_auth_04_two_browsers_same_student_both_work(
    client: TestClient, student_user: User
) -> None:
    """Stateless JWT → two independent logins must both succeed and both
    tokens must authorise /api/auth/me independently."""
    login_a = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    ).json()
    login_b = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    ).json()

    assert login_a["access_token"] and login_b["access_token"]

    me_a = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {login_a['access_token']}"},
    )
    me_b = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {login_b['access_token']}"},
    )
    assert me_a.status_code == 200
    assert me_b.status_code == 200
    assert me_a.json()["username"] == me_b.json()["username"] == "student_fixture"


# ─── EC-SCENARIO helpers ─────────────────────────────────────────────────────

def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_scenario(client: TestClient, token: str, title: str = "Тестовый кейс") -> int:
    r = client.post(
        "/api/scenarios/",
        headers=_auth(token),
        json={"title": title, "description": "edge-case scenario", "passing_score": 60},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _graph_no_start() -> dict:
    return {
        "nodes": [
            {"id": "a", "type": "data", "position": {"x": 0, "y": 0}, "data": {}, "title": "A"},
            {"id": "f", "type": "final", "position": {"x": 1, "y": 0}, "data": {}, "title": "F"},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "f", "label": None, "data": {"is_correct": True, "score_delta": 0}},
        ],
    }


def _valid_graph() -> dict:
    return {
        "nodes": [
            {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "data": {}, "title": "Старт"},
            {"id": "d", "type": "data", "position": {"x": 1, "y": 0}, "data": {}, "title": "Инфо"},
            {"id": "f", "type": "final", "position": {"x": 2, "y": 0}, "data": {}, "title": "Финал"},
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "d", "label": None, "data": {"is_correct": True, "score_delta": 0}},
            {"id": "e2", "source": "d", "target": "f", "label": None, "data": {"is_correct": True, "score_delta": 0}},
        ],
    }


def _graph_with_unreachable() -> dict:
    graph = _valid_graph()
    graph["nodes"].append(
        {"id": "orphan", "type": "data", "position": {"x": 9, "y": 9}, "data": {}, "title": "Orphan"}
    )
    graph["edges"].append(
        {"id": "e_orph", "source": "orphan", "target": "f", "label": None, "data": {"is_correct": True, "score_delta": 0}}
    )
    return graph


# ─── EC-SCENARIO-01 ──────────────────────────────────────────────────────────

def test_ec_scenario_01_publish_without_start_node_returns_422(
    client: TestClient, teacher_token: str
) -> None:
    sid = _make_scenario(client, teacher_token)
    assert client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_graph_no_start(),
    ).status_code == 200

    r = client.post(f"/api/scenarios/{sid}/publish", headers=_auth(teacher_token))
    assert r.status_code == 422
    body_text = r.text.lower()
    assert "старт" in body_text or "start" in body_text


# ─── EC-SCENARIO-02 ──────────────────────────────────────────────────────────

def test_ec_scenario_02_publish_unreachable_node_returns_422(
    client: TestClient, teacher_token: str
) -> None:
    sid = _make_scenario(client, teacher_token)
    assert client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_graph_with_unreachable(),
    ).status_code == 200

    r = client.post(f"/api/scenarios/{sid}/publish", headers=_auth(teacher_token))
    assert r.status_code == 422
    assert "orphan" in r.text.lower() or "недостижим" in r.text.lower()


# ─── EC-SCENARIO-03 ──────────────────────────────────────────────────────────

def test_ec_scenario_03_edit_published_requires_unpublish(
    client: TestClient, teacher_token: str
) -> None:
    sid = _make_scenario(client, teacher_token)
    client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_valid_graph(),
    )
    assert client.post(
        f"/api/scenarios/{sid}/publish", headers=_auth(teacher_token)
    ).status_code == 200

    # Editing the published graph is forbidden.
    blocked = client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_valid_graph(),
    )
    assert blocked.status_code == 409

    # After unpublishing, editing again works…
    assert client.post(
        f"/api/scenarios/{sid}/unpublish", headers=_auth(teacher_token)
    ).status_code == 200
    edited = client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_valid_graph(),
    )
    assert edited.status_code == 200

    # …and re-publishing succeeds.
    assert client.post(
        f"/api/scenarios/{sid}/publish", headers=_auth(teacher_token)
    ).status_code == 200


# ─── EC-SCENARIO-04 ──────────────────────────────────────────────────────────

def test_ec_scenario_04_cannot_delete_published_scenario(
    client: TestClient, teacher_token: str
) -> None:
    sid = _make_scenario(client, teacher_token)
    client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_valid_graph(),
    )
    client.post(f"/api/scenarios/{sid}/publish", headers=_auth(teacher_token))

    r = client.delete(f"/api/scenarios/{sid}", headers=_auth(teacher_token))
    assert r.status_code == 409
    assert "архив" in r.text.lower()


# ─── EC-SCENARIO-05 ──────────────────────────────────────────────────────────

def test_ec_scenario_05_duplicate_creates_draft_with_new_author(
    client: TestClient,
    teacher_token: str,
    admin_token: str,
    teacher_user,
    admin_user,
) -> None:
    """§6.4 — duplicate lands as draft and the acting user becomes author."""
    sid = _make_scenario(client, teacher_token, title="Оригинал")
    client.put(
        f"/api/scenarios/{sid}/graph",
        headers=_auth(teacher_token),
        json=_valid_graph(),
    )
    client.post(f"/api/scenarios/{sid}/publish", headers=_auth(teacher_token))

    # Admin duplicates the teacher's published scenario.
    r = client.post(f"/api/scenarios/{sid}/duplicate", headers=_auth(admin_token))
    assert r.status_code == 201
    clone = r.json()
    assert clone["status"] == "draft"
    assert clone["id"] != sid
    assert clone["author_id"] == admin_user.id  # new author, not the original teacher
    assert clone["author_id"] != teacher_user.id
    assert clone["title"].startswith("Оригинал")


# ─── EC-ATTEMPT helpers ──────────────────────────────────────────────────────


def _ec_attempt_graph() -> dict:
    return {
        "nodes": [
            {"id": "n_start", "type": "start", "position": {"x": 0, "y": 0},
             "data": {}, "title": "Старт"},
            {"id": "n_dec", "type": "decision", "position": {"x": 1, "y": 0},
             "data": {
                 "question": "?",
                 "options": [
                     {"id": "o_ok", "text": "OK"},
                     {"id": "o_bad", "text": "Bad"},
                 ],
                 "max_score": 10.0,
             }, "title": "Решение"},
            {"id": "n_text", "type": "text_input", "position": {"x": 2, "y": 0},
             "data": {"prompt": "?",
                      "keywords": [{"word": "гепатит", "synonyms": [],
                                    "score": 5.0}],
                      "max_score": 5.0},
             "title": "Ввод"},
            {"id": "n_final", "type": "final", "position": {"x": 3, "y": 0},
             "data": {}, "title": "Финал"},
        ],
        "edges": [
            {"id": "e_s_d", "source": "n_start", "target": "n_dec",
             "label": None, "data": {"is_correct": True, "score_delta": 0}},
            {"id": "e_ok", "source": "n_dec", "target": "n_text",
             "label": "OK", "data": {"is_correct": True, "score_delta": 0,
                                     "option_id": "o_ok"}},
            {"id": "e_bad", "source": "n_dec", "target": "n_final",
             "label": "Bad", "data": {"is_correct": False, "score_delta": 0,
                                      "option_id": "o_bad"}},
            {"id": "e_t_f", "source": "n_text", "target": "n_final",
             "label": None, "data": {"is_correct": True, "score_delta": 0}},
        ],
    }


def _ec_setup_attempt_world(
    client, teacher_token, student_user, db_session,
    *, title="EC Scenario", time_limit_min=None, max_attempts=None,
):
    from models.user import Group

    group = Group(name=f"EC {title}")
    db_session.add(group)
    db_session.flush()
    student_user.group_id = group.id
    db_session.flush()

    body = {"title": title, "description": "edge-case", "passing_score": 50}
    if time_limit_min is not None:
        body["time_limit_min"] = time_limit_min
    if max_attempts is not None:
        body["max_attempts"] = max_attempts

    sid = client.post("/api/scenarios/", json=body,
                      headers=_auth(teacher_token)).json()["id"]
    client.put(f"/api/scenarios/{sid}/graph", json=_ec_attempt_graph(),
               headers=_auth(teacher_token))
    client.post(f"/api/scenarios/{sid}/publish",
                headers=_auth(teacher_token))
    client.post(f"/api/scenarios/{sid}/assign",
                json={"group_id": group.id},
                headers=_auth(teacher_token))
    return sid, group.id


# ─── EC-ATTEMPT-01 ───────────────────────────────────────────────────────────


def test_ec_attempt_01_second_start_is_idempotent_resume_or_409(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session, title="EC-01",
    )
    first = client.post("/api/attempts/start", json={"scenario_id": sid},
                        headers=_auth(student_token))
    assert first.status_code == 201
    second = client.post("/api/attempts/start", json={"scenario_id": sid},
                         headers=_auth(student_token))
    assert second.status_code in (200, 201, 409)
    if second.status_code in (200, 201):
        assert second.json()["attempt_id"] == first.json()["attempt_id"]


# ─── EC-ATTEMPT-02 ───────────────────────────────────────────────────────────


def test_ec_attempt_02_max_attempts_exceeded_returns_422(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session,
        title="EC-02", max_attempts=1,
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=_auth(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/finish",
                headers=_auth(student_token))
    again = client.post("/api/attempts/start", json={"scenario_id": sid},
                        headers=_auth(student_token))
    assert again.status_code == 422
    assert "лимит" in again.text.lower() or "max_attempts" in again.text.lower()


# ─── EC-ATTEMPT-03 ───────────────────────────────────────────────────────────


def test_ec_attempt_03_transition_to_unknown_node_returns_400(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session, title="EC-03",
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=_auth(student_token)).json()["attempt_id"]
    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_text",  # not the current node
              "action": "submit_text", "answer_data": {"text": "x"},
              "time_spent_sec": 1},
        headers=_auth(student_token),
    )
    assert r.status_code == 400
    assert "переход" in r.text.lower() or "недопустим" in r.text.lower()


# ─── EC-ATTEMPT-04 ───────────────────────────────────────────────────────────


def test_ec_attempt_04_time_expired_step_returns_410_and_completes(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    from datetime import timedelta as _td

    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session,
        title="EC-04", time_limit_min=10,
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=_auth(student_token)).json()["attempt_id"]

    from models.attempt import Attempt
    attempt = db_session.get(Attempt, aid)
    attempt.expires_at = datetime.now(tz=UTC) - _td(minutes=1)
    db_session.flush()

    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_start", "action": "view_data",
              "answer_data": {}, "time_spent_sec": 1},
        headers=_auth(student_token),
    )
    assert r.status_code == 410
    db_session.expire_all()
    finished = db_session.get(Attempt, aid)
    assert finished.status == "completed"


# ─── EC-ATTEMPT-05 ───────────────────────────────────────────────────────────


def test_ec_attempt_05_f5_resume_returns_same_attempt(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session, title="EC-05",
    )
    first = client.post("/api/attempts/start", json={"scenario_id": sid},
                        headers=_auth(student_token)).json()
    # Walk one step to set current_node != start.
    client.post(f"/api/attempts/{first['attempt_id']}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=_auth(student_token))
    resumed = client.post("/api/attempts/start", json={"scenario_id": sid},
                          headers=_auth(student_token))
    assert resumed.status_code in (200, 201)
    body = resumed.json()
    assert body["attempt_id"] == first["attempt_id"]
    assert body["resumed"] is True
    assert body["current_node"]["id"] == "n_dec"


# ─── EC-ATTEMPT-06 ───────────────────────────────────────────────────────────


def test_ec_attempt_06_double_finish_is_idempotent(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session, title="EC-06",
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=_auth(student_token)).json()["attempt_id"]
    r1 = client.post(f"/api/attempts/{aid}/finish",
                     headers=_auth(student_token))
    r2 = client.post(f"/api/attempts/{aid}/finish",
                     headers=_auth(student_token))
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["status"] == "completed"
    assert r2.json()["status"] == "completed"


# ─── EC-ATTEMPT-07 ───────────────────────────────────────────────────────────


def test_ec_attempt_07_text_input_empty_answer_scores_zero_not_crash(
    client, teacher_token, student_token, student_user, db_session,
) -> None:
    sid, _ = _ec_setup_attempt_world(
        client, teacher_token, student_user, db_session, title="EC-07",
    )
    aid = client.post("/api/attempts/start", json={"scenario_id": sid},
                      headers=_auth(student_token)).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_start", "action": "view_data",
                      "answer_data": {}, "time_spent_sec": 1},
                headers=_auth(student_token))
    client.post(f"/api/attempts/{aid}/step",
                json={"node_id": "n_dec", "action": "choose_option",
                      "answer_data": {"selected_option_id": "o_ok"},
                      "time_spent_sec": 1},
                headers=_auth(student_token))
    r = client.post(
        f"/api/attempts/{aid}/step",
        json={"node_id": "n_text", "action": "submit_text",
              "answer_data": {"text": ""}, "time_spent_sec": 1},
        headers=_auth(student_token),
    )
    assert r.status_code == 200
    assert r.json()["step_result"]["score"] == 0.0
    assert r.json()["step_result"]["is_correct"] is False
