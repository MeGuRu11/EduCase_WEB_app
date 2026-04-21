"""Auth endpoint tests per §6.1, §7, §T.1, §T.7."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.user import User
from services.auth_service import AuthService


def test_login_success_returns_tokens_and_user(
    client: TestClient, student_user: User
) -> None:
    resp = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["user"]["username"] == "student_fixture"
    assert body["user"]["role"] == "student"


def test_login_wrong_password_returns_401(
    client: TestClient, student_user: User
) -> None:
    resp = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "BadPass1!"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Неверный логин или пароль"


def test_login_unknown_user_returns_401(client: TestClient, roles) -> None:
    resp = client.post(
        "/api/auth/login",
        json={"username": "ghost.user", "password": "WhatEver1!"},
    )
    assert resp.status_code == 401


def test_login_five_wrong_attempts_locks_account_30_minutes(
    client: TestClient, db_session: Session, student_user: User
) -> None:
    for _ in range(4):
        r = client.post(
            "/api/auth/login",
            json={"username": "student_fixture", "password": "wrong.pw1!"},
        )
        assert r.status_code == 401

    # 5th attempt should trigger lockout → 403 with locked-until message.
    r = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "wrong.pw1!"},
    )
    assert r.status_code == 403
    assert "заблокирован" in r.json()["detail"]

    db_session.refresh(student_user)
    assert student_user.locked_until is not None
    # Lock window ≈ 30 minutes.
    delta = student_user.locked_until - datetime.now(tz=UTC)
    assert timedelta(minutes=29) < delta < timedelta(minutes=31)

    # Even with correct password the user stays locked.
    r = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    )
    assert r.status_code == 403


def test_inactive_account_cannot_login(
    client: TestClient, db_session: Session, student_user: User
) -> None:
    student_user.is_active = False
    db_session.flush()

    r = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    )
    assert r.status_code == 403


def test_me_requires_auth(client: TestClient) -> None:
    r = client.get("/api/auth/me")
    assert r.status_code == 403  # HTTPBearer → 403 when Authorization missing


def test_me_returns_current_user(
    client: TestClient, student_token: str
) -> None:
    r = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {student_token}"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "student_fixture"


def test_refresh_access_token_with_refresh_token(
    client: TestClient, student_user: User
) -> None:
    login = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    ).json()

    r = client.post("/api/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"] is None  # refresh only issues access


def test_refresh_rejects_access_token(
    client: TestClient, student_token: str
) -> None:
    # Supplying an access token where refresh is expected must fail.
    r = client.post("/api/auth/refresh", json={"refresh_token": student_token})
    assert r.status_code == 401


def test_logout_returns_ok(client: TestClient, student_token: str) -> None:
    r = client.post(
        "/api/auth/logout", headers={"Authorization": f"Bearer {student_token}"}
    )
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_password_hash_uses_bcrypt_cost_12() -> None:
    hashed = AuthService.hash_password("Student1!")
    # bcrypt modular format: $2b$12$...
    assert hashed.startswith("$2b$12$")
    assert AuthService.verify_password("Student1!", hashed) is True
    assert AuthService.verify_password("WrongPw!", hashed) is False


@pytest.mark.parametrize(
    "bad",
    [
        "short1!",            # too short
        "nodigits!!",         # no digit
        "NoSymbol123",        # no special symbol
        "12345678",           # no letter
    ],
)
def test_password_validator_rejects_weak_passwords(
    client: TestClient, admin_token: str, roles: dict[str, int], bad: str
) -> None:
    r = client.post(
        "/api/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": "new.user",
            "password": bad,
            "full_name": "Плохой Пароль",
            "role_id": roles["student"],
        },
    )
    assert r.status_code == 422
