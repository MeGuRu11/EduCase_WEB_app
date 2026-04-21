"""Edge cases from PROJECT_DESIGN §16.

Covered here:
    EC-AUTH-01  Пароль ≤ 7 символов → 422 "Минимум 8 символов"
    EC-AUTH-02  5 неверных попыток → lock на 30 мин
    EC-AUTH-03  Refresh token истёк → 401 → клиент делает logout
    EC-AUTH-04  Два браузера одного студента → stateless JWT, оба работают
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
