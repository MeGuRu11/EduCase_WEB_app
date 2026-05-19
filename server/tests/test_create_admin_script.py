from __future__ import annotations

from sqlalchemy.orm import Session

from models.user import Role, RoleName, User
from scripts.create_admin import create_admin
from services.auth_service import AuthService


def test_create_admin_creates_active_admin(db_session: Session, roles: dict[str, int]) -> None:
    created = create_admin(
        db_session,
        username="admin_cli",
        password="Admin1234!",
        full_name="Администратор",
    )

    user = db_session.query(User).filter_by(username="admin_cli").one()
    admin_role = db_session.query(Role).filter_by(name=RoleName.ADMIN).one()

    assert created is True
    assert user.full_name == "Администратор"
    assert user.role_id == admin_role.id == roles["admin"]
    assert user.is_active is True
    assert AuthService.verify_password("Admin1234!", user.password_hash)


def test_create_admin_is_idempotent(db_session: Session, roles: dict[str, int]) -> None:
    existing = User(
        username="existing_admin",
        password_hash=AuthService.hash_password("Admin1234!"),
        full_name="Existing Admin",
        role_id=roles["admin"],
    )
    db_session.add(existing)
    db_session.flush()

    created = create_admin(
        db_session,
        username="existing_admin",
        password="Another123!",
        full_name="Администратор",
    )

    users = db_session.query(User).filter_by(username="existing_admin").all()

    assert created is False
    assert len(users) == 1
    assert AuthService.verify_password("Admin1234!", users[0].password_hash)
