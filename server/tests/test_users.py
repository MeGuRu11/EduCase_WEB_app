"""User CRUD + bulk CSV tests per §6.2, §T.6, E-13."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.user import Group, User


def _csv(rows: list[str], with_bom: bool = True) -> bytes:
    header = "username;password;full_name;role;group_name;email"
    body = "\r\n".join([header, *rows]) + "\r\n"
    encoded = body.encode("utf-8")
    return b"\xef\xbb\xbf" + encoded if with_bom else encoded


def test_admin_can_create_user(
    client: TestClient, admin_token: str, roles: dict[str, int]
) -> None:
    resp = client.post(
        "/api/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": "ivanov.i",
            "password": "Secure123!",
            "full_name": "Иванов И.И.",
            "role_id": roles["student"],
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["username"] == "ivanov.i"
    assert resp.json()["must_change_password"] is False


def test_non_admin_cannot_create_user(
    client: TestClient, teacher_token: str, roles: dict[str, int]
) -> None:
    resp = client.post(
        "/api/users/",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={
            "username": "teacher.sneak",
            "password": "Secure123!",
            "full_name": "Незаконный пользователь",
            "role_id": roles["student"],
        },
    )
    assert resp.status_code == 403


def test_duplicate_username_returns_409(
    client: TestClient, admin_token: str, roles: dict[str, int]
) -> None:
    payload = {
        "username": "dup.user",
        "password": "Secure123!",
        "full_name": "Дубликат",
        "role_id": roles["student"],
    }
    first = client.post(
        "/api/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
    )
    assert first.status_code == 201

    second = client.post(
        "/api/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
    )
    assert second.status_code == 409


def test_put_status_is_idempotent(
    client: TestClient, admin_token: str, student_user: User
) -> None:
    url = f"/api/users/{student_user.id}/status"
    headers = {"Authorization": f"Bearer {admin_token}"}

    r1 = client.put(url, headers=headers, json={"is_active": False})
    r2 = client.put(url, headers=headers, json={"is_active": False})

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["is_active"] is False
    assert r2.json()["is_active"] is False


def test_admin_cannot_block_themselves(
    client: TestClient, admin_token: str, admin_user: User
) -> None:
    r = client.put(
        f"/api/users/{admin_user.id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"is_active": False},
    )
    assert r.status_code == 403
    assert "самого себя" in r.json()["detail"]


def test_admin_reset_password_forces_change(
    client: TestClient,
    admin_token: str,
    student_user: User,
    db_session: Session,
) -> None:
    r = client.post(
        f"/api/users/{student_user.id}/reset-password",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"new_password": "Fresh123!"},
    )
    assert r.status_code == 200
    db_session.refresh(student_user)
    assert student_user.must_change_password is True


def test_self_change_password_clears_must_change_flag(
    client: TestClient, db_session: Session, student_user: User
) -> None:
    student_user.must_change_password = True
    db_session.flush()

    login = client.post(
        "/api/auth/login",
        json={"username": "student_fixture", "password": "Student1!"},
    ).json()
    token = login["access_token"]

    r = client.post(
        "/api/users/me/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"old_password": "Student1!", "new_password": "Newpass9!"},
    )
    assert r.status_code == 200
    db_session.refresh(student_user)
    assert student_user.must_change_password is False


def test_change_password_wrong_old_returns_400(
    client: TestClient, student_token: str
) -> None:
    r = client.post(
        "/api/users/me/change-password",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"old_password": "Wrong!", "new_password": "Newpass9!"},
    )
    assert r.status_code == 400


def test_admin_lists_all_users_paginated(
    client: TestClient,
    admin_token: str,
    student_user: User,
    teacher_user: User,
    admin_user: User,
) -> None:
    r = client.get(
        "/api/users/?page=1&per_page=10",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 3
    assert body["page"] == 1
    assert body["per_page"] == 10
    assert isinstance(body["items"], list)


def test_teacher_list_only_sees_linked_group_students(
    client: TestClient,
    teacher_token: str,
    admin_token: str,
    db_session: Session,
    teacher_user: User,
    roles: dict[str, int],
) -> None:
    # Create two groups, link teacher to group A only.
    group_a = Group(name="Группа A")
    group_b = Group(name="Группа B")
    db_session.add_all([group_a, group_b])
    db_session.flush()

    client.post(
        f"/api/groups/{group_a.id}/assign-teacher",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"teacher_id": teacher_user.id},
    )

    from services.auth_service import AuthService

    student_a = User(
        username="stud.a",
        password_hash=AuthService.hash_password("Stud123!"),
        full_name="Студент A",
        role_id=roles["student"],
        group_id=group_a.id,
    )
    student_b = User(
        username="stud.b",
        password_hash=AuthService.hash_password("Stud123!"),
        full_name="Студент B",
        role_id=roles["student"],
        group_id=group_b.id,
    )
    db_session.add_all([student_a, student_b])
    db_session.flush()

    r = client.get(
        "/api/users/",
        headers={"Authorization": f"Bearer {teacher_token}"},
    )
    assert r.status_code == 200
    usernames = {u["username"] for u in r.json()["items"]}
    assert "stud.a" in usernames
    assert "stud.b" not in usernames


def test_bulk_csv_all_or_nothing_rolls_back_on_error(
    client: TestClient,
    admin_token: str,
    db_session: Session,
    roles: dict[str, int],
) -> None:
    # Row 3 has an invalid role → entire batch must be rejected.
    csv_blob = _csv(
        [
            "good.a;GoodPass1!;Хороший А;student;;",
            "good.b;GoodPass1!;Хороший Б;student;;",
            "bad.c;GoodPass1!;Плохой С;wizard;;",
        ]
    )

    files = {"file": ("users.csv", io.BytesIO(csv_blob), "text/csv")}
    r = client.post(
        "/api/users/bulk-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files,
    )
    assert r.status_code == 422

    created = {
        u.username
        for u in db_session.query(User).filter(User.username.in_(["good.a", "good.b", "bad.c"]))
    }
    assert created == set(), "No rows must be committed when any row fails (§T.6)"


def test_bulk_csv_happy_path_creates_all_users(
    client: TestClient,
    admin_token: str,
    db_session: Session,
    roles: dict[str, int],
) -> None:
    group = Group(name="Группа №4 (воен.)")
    db_session.add(group)
    db_session.flush()

    csv_blob = _csv(
        [
            "ivanov.i;Secure123!;Иванов И.И.;student;Группа №4 (воен.);",
            "petrov.p;Qwerty12@;Петров П.П.;student;Группа №4 (воен.);",
            "smirnov.s;Teacher9#;Смирнов С.С.;teacher;;",
        ]
    )
    files = {"file": ("users.csv", io.BytesIO(csv_blob), "text/csv")}
    r = client.post(
        "/api/users/bulk-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files,
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 3
    assert r.json()["errors"] == []


def test_bulk_csv_rejects_unknown_group(
    client: TestClient, admin_token: str, roles: dict[str, int]
) -> None:
    csv_blob = _csv(
        [
            "ivanov.i;Secure123!;Иванов И.И.;student;Несуществующая;",
        ]
    )
    files = {"file": ("users.csv", io.BytesIO(csv_blob), "text/csv")}
    r = client.post(
        "/api/users/bulk-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files,
    )
    assert r.status_code == 422
    body = r.json()["detail"]
    assert any("Несуществующая" in e["detail"] for e in body["errors"])
