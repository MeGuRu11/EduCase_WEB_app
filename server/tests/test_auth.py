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


# ─── Task 2 — JTI blacklist / logout revocation ─────────────────────────────


def _login(client, username: str, password: str) -> str:
    r = client.post("/api/auth/login",
                    json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_logout_revokes_token(client, student_user) -> None:
    token = _login(client, "student_fixture", "Student1!")
    r_me = client.get("/api/auth/me",
                      headers={"Authorization": f"Bearer {token}"})
    assert r_me.status_code == 200

    r_logout = client.post("/api/auth/logout",
                           headers={"Authorization": f"Bearer {token}"})
    assert r_logout.status_code == 200

    # Same token must now be rejected.
    r_after = client.get("/api/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r_after.status_code == 401
    assert "revoke" in r_after.json()["detail"].lower() or \
           "revoked" in r_after.json()["detail"].lower()


def test_revoked_token_rejected_with_clear_error(client, student_user) -> None:
    token = _login(client, "student_fixture", "Student1!")
    client.post("/api/auth/logout",
                headers={"Authorization": f"Bearer {token}"})
    r = client.get("/api/auth/me",
                   headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    # Detail string should explicitly mention revocation, not generic "invalid".
    assert "revok" in r.json()["detail"].lower()


def test_logout_idempotent(client, student_user) -> None:
    """Two consecutive logouts on the same token: first revokes, second is
    rejected by ``get_current_user`` (401) — never 500."""
    token = _login(client, "student_fixture", "Student1!")
    r1 = client.post("/api/auth/logout",
                     headers={"Authorization": f"Bearer {token}"})
    r2 = client.post("/api/auth/logout",
                     headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 200
    assert r2.status_code == 401  # already revoked → 401, not 500


def test_cleanup_removes_expired_blacklist_entries(
    client, db_session, student_user,
) -> None:
    from datetime import datetime, timedelta

    from models.token_blacklist import TokenBlacklist
    from services.scheduler import _cleanup_expired_blacklist

    token = _login(client, "student_fixture", "Student1!")
    client.post("/api/auth/logout",
                headers={"Authorization": f"Bearer {token}"})

    # Force the blacklist row into the past (>1 day past expiry).
    row = db_session.query(TokenBlacklist).one()
    row.expires_at = datetime.now(tz=UTC) - timedelta(days=2)
    db_session.flush()

    deleted = _cleanup_expired_blacklist(db_session)
    assert deleted == 1
    assert db_session.query(TokenBlacklist).count() == 0
