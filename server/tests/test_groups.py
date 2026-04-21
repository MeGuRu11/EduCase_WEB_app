"""Group CRUD + teacher/student assignment tests per §6.3."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.user import Group, User


def _create_group(client: TestClient, admin_token: str, name: str = "Группа №1") -> dict:
    resp = client.post(
        "/api/groups/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": name, "description": "тест"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_admin_can_create_group(client: TestClient, admin_token: str) -> None:
    body = _create_group(client, admin_token)
    assert body["name"] == "Группа №1"
    assert body["student_count"] == 0
    assert body["is_active"] is True


def test_teacher_cannot_create_group(
    client: TestClient, teacher_token: str
) -> None:
    r = client.post(
        "/api/groups/",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={"name": "Легит"},
    )
    assert r.status_code == 403


def test_admin_assigns_teacher_to_group(
    client: TestClient, admin_token: str, teacher_user: User
) -> None:
    group = _create_group(client, admin_token, "Группа для препода")
    r = client.post(
        f"/api/groups/{group['id']}/assign-teacher",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"teacher_id": teacher_user.id},
    )
    assert r.status_code == 200


def test_duplicate_teacher_assignment_returns_409(
    client: TestClient, admin_token: str, teacher_user: User
) -> None:
    group = _create_group(client, admin_token, "Группа дубль")
    url = f"/api/groups/{group['id']}/assign-teacher"
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post(url, headers=headers, json={"teacher_id": teacher_user.id})
    r = client.post(url, headers=headers, json={"teacher_id": teacher_user.id})
    assert r.status_code == 409


def test_assign_non_teacher_returns_422(
    client: TestClient, admin_token: str, student_user: User
) -> None:
    group = _create_group(client, admin_token, "Группа NonTeach")
    r = client.post(
        f"/api/groups/{group['id']}/assign-teacher",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"teacher_id": student_user.id},
    )
    assert r.status_code == 422


def test_add_student_member(
    client: TestClient, admin_token: str, student_user: User
) -> None:
    group = _create_group(client, admin_token, "Группа с учеником")
    r = client.post(
        f"/api/groups/{group['id']}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"user_id": student_user.id},
    )
    assert r.status_code == 200


def test_cannot_add_teacher_as_member(
    client: TestClient, admin_token: str, teacher_user: User
) -> None:
    group = _create_group(client, admin_token, "Группа (преп нельзя)")
    r = client.post(
        f"/api/groups/{group['id']}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"user_id": teacher_user.id},
    )
    assert r.status_code == 422


def test_teacher_only_sees_linked_groups(
    client: TestClient,
    admin_token: str,
    teacher_token: str,
    teacher_user: User,
    db_session: Session,
) -> None:
    linked = Group(name="Моя группа")
    other = Group(name="Чужая группа")
    db_session.add_all([linked, other])
    db_session.flush()

    client.post(
        f"/api/groups/{linked.id}/assign-teacher",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"teacher_id": teacher_user.id},
    )

    r = client.get(
        "/api/groups/",
        headers={"Authorization": f"Bearer {teacher_token}"},
    )
    assert r.status_code == 200
    names = {g["name"] for g in r.json()}
    assert "Моя группа" in names
    assert "Чужая группа" not in names


def test_remove_teacher_from_group(
    client: TestClient, admin_token: str, teacher_user: User
) -> None:
    group = _create_group(client, admin_token, "Группа удаления")
    url = f"/api/groups/{group['id']}/assign-teacher"
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post(url, headers=headers, json={"teacher_id": teacher_user.id})

    r = client.delete(
        f"/api/groups/{group['id']}/teachers/{teacher_user.id}",
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json() == {"status": "removed"}
