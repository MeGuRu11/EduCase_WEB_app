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
