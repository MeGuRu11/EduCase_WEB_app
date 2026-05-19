from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from sqlalchemy.orm import Session

# When executed as `python scripts/create_admin.py`, Python puts scripts/ on
# sys.path. Add server root so plain project imports keep working in Docker.
SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from database import SessionLocal  # noqa: E402
from models.user import Role, RoleName, User  # noqa: E402
from services.auth_service import AuthService  # noqa: E402

DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "Admin1234!"  # noqa: S105 - required bootstrap default.
DEFAULT_FULL_NAME = "Администратор"


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the first EpiCase admin user.")
    parser.add_argument("--username", default=DEFAULT_USERNAME)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    parser.add_argument("--full-name", default=DEFAULT_FULL_NAME)
    return parser.parse_args(argv)


def get_or_create_admin_role(db: Session) -> Role:
    role = db.query(Role).filter_by(name=RoleName.ADMIN).one_or_none()
    if role is not None:
        return role

    role = Role(name=RoleName.ADMIN, display_name=DEFAULT_FULL_NAME)
    db.add(role)
    db.flush()
    return role


def create_admin(db: Session, *, username: str, password: str, full_name: str) -> bool:
    existing = db.query(User).filter_by(username=username).one_or_none()
    if existing is not None:
        return False

    role = get_or_create_admin_role(db)
    db.add(
        User(
            username=username,
            password_hash=AuthService.hash_password(password),
            full_name=full_name,
            role_id=role.id,
            is_active=True,
        )
    )
    db.flush()
    return True


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    with SessionLocal() as db:
        created = create_admin(
            db,
            username=args.username,
            password=args.password,
            full_name=args.full_name,
        )
        if created:
            db.commit()
            print(f"Admin created: {args.username} / {args.password}")
        else:
            print(f"Admin already exists: {args.username}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
