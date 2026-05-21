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


def test_admin_can_delete_empty_group(client: TestClient, admin_token: str) -> None:
    group = _create_group(client, admin_token, "Группа на удаление")
    headers = {"Authorization": f"Bearer {admin_token}"}

    r = client.delete(f"/api/groups/{group['id']}", headers=headers)
    assert r.status_code == 204
    assert r.content == b""

    listing = client.get("/api/groups/", headers=headers)
    assert listing.status_code == 200
    assert all(g["id"] != group["id"] for g in listing.json())


def test_delete_group_with_students_returns_409(
    client: TestClient,
    admin_token: str,
    student_user: User,
) -> None:
    group = _create_group(client, admin_token, "Группа со студентом")
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post(
        f"/api/groups/{group['id']}/members",
        headers=headers,
        json={"user_id": student_user.id},
    )

    r = client.delete(f"/api/groups/{group['id']}", headers=headers)
    assert r.status_code == 409
    assert "студент" in r.json()["detail"].lower()


def test_teacher_cannot_delete_group(
    client: TestClient, admin_token: str, teacher_token: str
) -> None:
    group = _create_group(client, admin_token, "Запрет преподавателю")
    r = client.delete(
        f"/api/groups/{group['id']}",
        headers={"Authorization": f"Bearer {teacher_token}"},
    )
    assert r.status_code == 403


def test_delete_missing_group_returns_404(
    client: TestClient, admin_token: str
) -> None:
    r = client.delete(
        "/api/groups/99999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


def test_teacher_in_multiple_groups(
    client: TestClient, admin_token: str, teacher_user: User
) -> None:
    """Один преподаватель может быть привязан к нескольким группам одновременно
    (TeacherGroup — composite PK; 409 фиксируется только на дубль внутри ОДНОЙ группы)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    g1 = _create_group(client, admin_token, "Группа A")
    g2 = _create_group(client, admin_token, "Группа B")

    r1 = client.post(
        f"/api/groups/{g1['id']}/assign-teacher",
        headers=headers,
        json={"teacher_id": teacher_user.id},
    )
    assert r1.status_code == 200, r1.text

    r2 = client.post(
        f"/api/groups/{g2['id']}/assign-teacher",
        headers=headers,
        json={"teacher_id": teacher_user.id},
    )
    assert r2.status_code == 200, r2.text

    # Обе группы видят преподавателя
    listing = client.get("/api/groups/", headers=headers).json()
    in_a = next(g for g in listing if g["id"] == g1["id"])
    in_b = next(g for g in listing if g["id"] == g2["id"])
    assert any(t["id"] == teacher_user.id for t in in_a["teachers"])
    assert any(t["id"] == teacher_user.id for t in in_b["teachers"])

    # Снять с группы A — остаётся в B
    r_remove = client.delete(
        f"/api/groups/{g1['id']}/teachers/{teacher_user.id}",
        headers=headers,
    )
    assert r_remove.status_code == 200

    listing_after = client.get("/api/groups/", headers=headers).json()
    in_a_after = next(g for g in listing_after if g["id"] == g1["id"])
    in_b_after = next(g for g in listing_after if g["id"] == g2["id"])
    assert all(t["id"] != teacher_user.id for t in in_a_after["teachers"])
    assert any(t["id"] == teacher_user.id for t in in_b_after["teachers"])
