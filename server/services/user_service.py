"""User CRUD + bulk CSV upload logic per §6.2 + §T.6."""

from __future__ import annotations

import csv
import io

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from models.user import Group, Role, RoleName, TeacherGroup, User
from schemas.user import (
    UserBulkCSVRow,
    UserBulkError,
    UserBulkResult,
    UserCreate,
    UserOut,
    UserUpdate,
)
from services.audit_service import log_action
from services.auth_service import AuthService

CSV_MAX_BYTES = 2 * 1024 * 1024  # §T.6 — 2 MB cap
REQUIRED_CSV_HEADERS = {"username", "password", "full_name", "role", "group_name", "email"}


class UserService:
    # ─── Serialization ─────────────────────────────────────────────────────

    @staticmethod
    def to_out(user: User) -> UserOut:
        role_name = user.role.name if user.role is not None else ""
        group_name = user.group.name if user.group is not None else None
        avatar_url = (
            f"/media/avatars/{user.avatar_path}"
            if user.avatar_path
            else None
        )
        return UserOut(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=role_name,
            role_id=user.role_id,
            group_id=user.group_id,
            group_name=group_name,
            avatar_url=avatar_url,
            is_active=user.is_active,
            must_change_password=user.must_change_password,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
        )

    # ─── CRUD ──────────────────────────────────────────────────────────────

    @classmethod
    def create(cls, db: Session, payload: UserCreate, *, actor: User | None = None) -> User:
        if db.query(User).filter(User.username == payload.username).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь с таким логином уже существует",
            )
        if db.get(Role, payload.role_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Роль с id={payload.role_id} не найдена",
            )
        if payload.group_id is not None and db.get(Group, payload.group_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Группа с id={payload.group_id} не найдена",
            )

        user = User(
            username=payload.username,
            password_hash=AuthService.hash_password(payload.password),
            full_name=payload.full_name,
            role_id=payload.role_id,
            group_id=payload.group_id,
        )
        db.add(user)
        db.flush()
        db.refresh(user, ["role", "group"])
        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="user.create",
            entity_type="user",
            entity_id=user.id,
            meta={"username": user.username, "role_id": user.role_id},
        )
        return user

    @classmethod
    def update(
        cls,
        db: Session,
        *,
        user: User,
        patch: UserUpdate,
        actor: User,
    ) -> User:
        # Non-admin may only edit their own ``full_name`` and ``avatar_path``.
        actor_is_admin = actor.role.name == RoleName.ADMIN
        if not actor_is_admin:
            if actor.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Недостаточно прав для изменения этого пользователя",
                )
            if patch.group_id is not None and patch.group_id != user.group_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Только администратор может изменять группу",
                )

        if patch.group_id is not None and db.get(Group, patch.group_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Группа с id={patch.group_id} не найдена",
            )

        changed: dict[str, object] = {}
        if patch.full_name is not None and patch.full_name != user.full_name:
            changed["full_name"] = patch.full_name
            user.full_name = patch.full_name
        if patch.group_id is not None and patch.group_id != user.group_id:
            changed["group_id"] = patch.group_id
            user.group_id = patch.group_id
        if patch.avatar_path is not None and patch.avatar_path != user.avatar_path:
            changed["avatar_path"] = patch.avatar_path
            user.avatar_path = patch.avatar_path

        db.flush()
        db.refresh(user, ["role", "group"])
        if changed:
            log_action(
                db,
                actor_id=actor.id,
                action="user.update",
                entity_type="user",
                entity_id=user.id,
                meta={"changed": list(changed.keys())},
            )
        return user

    @classmethod
    def set_status(
        cls, db: Session, *, user: User, is_active: bool, actor: User
    ) -> User:
        """E-13 — idempotent PUT /users/{id}/status."""
        if actor.id == user.id and not is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Нельзя заблокировать самого себя",
            )
        was_active = user.is_active
        user.is_active = is_active
        if is_active:
            user.login_attempts = 0
            user.locked_until = None
        db.flush()
        if was_active != is_active:
            log_action(
                db,
                actor_id=actor.id,
                action="user.unblock" if is_active else "user.block",
                entity_type="user",
                entity_id=user.id,
            )
        return user

    @classmethod
    def reset_password(cls, db: Session, *, user: User, new_password: str) -> None:
        user.password_hash = AuthService.hash_password(new_password)
        user.must_change_password = True
        user.login_attempts = 0
        user.locked_until = None
        db.flush()

    @classmethod
    def change_password(
        cls, db: Session, *, user: User, old_password: str, new_password: str
    ) -> None:
        if not AuthService.verify_password(old_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный текущий пароль",
            )
        user.password_hash = AuthService.hash_password(new_password)
        user.must_change_password = False
        db.flush()

    # ─── Listing ───────────────────────────────────────────────────────────

    @classmethod
    def list_users(
        cls,
        db: Session,
        *,
        actor: User,
        role: str | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[User], int]:
        q = db.query(User).options(joinedload(User.role), joinedload(User.group))

        # Teacher sees only students of groups she's linked to via teacher_groups.
        if actor.role.name == RoleName.TEACHER:
            linked_groups = select(TeacherGroup.group_id).where(
                TeacherGroup.teacher_id == actor.id
            )
            q = q.join(Role, User.role_id == Role.id).filter(
                Role.name == RoleName.STUDENT,
                User.group_id.in_(linked_groups),
            )
        elif actor.role.name != RoleName.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )

        if role is not None:
            q = q.join(Role, User.role_id == Role.id).filter(Role.name == role)

        if search:
            pattern = f"%{search}%"
            q = q.filter(
                (User.username.ilike(pattern)) | (User.full_name.ilike(pattern))
            )

        total = q.with_entities(func.count(User.id)).order_by(None).scalar() or 0
        items = (
            q.order_by(User.full_name.asc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        return items, int(total)

    # ─── Bulk CSV upload (§T.6) ────────────────────────────────────────────

    @classmethod
    def bulk_csv(
        cls, db: Session, *, blob: bytes, actor: User | None = None
    ) -> UserBulkResult:
        if len(blob) > CSV_MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Файл слишком большой (максимум 2 MB)",
            )

        text = blob.decode("utf-8-sig")  # strips BOM
        reader = csv.DictReader(io.StringIO(text), delimiter=";")

        headers = {(h or "").strip().lower() for h in (reader.fieldnames or [])}
        missing = REQUIRED_CSV_HEADERS - headers
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Заголовки CSV должны содержать: "
                    "username;password;full_name;role;group_name;email. "
                    f"Отсутствуют: {sorted(missing)}"
                ),
            )

        errors: list[UserBulkError] = []
        valid_rows: list[UserBulkCSVRow] = []

        for idx, raw in enumerate(reader, start=2):  # +1 for header, +1 for 1-based
            cleaned = {k.lower(): (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
            try:
                valid_rows.append(
                    UserBulkCSVRow(
                        username=cleaned.get("username") or "",
                        password=cleaned.get("password") or "",
                        full_name=cleaned.get("full_name") or "",
                        role=cleaned.get("role") or "",
                        group_name=cleaned.get("group_name") or None,
                        email=cleaned.get("email") or None,
                    )
                )
            except ValidationError as exc:
                errors.append(UserBulkError(row=idx, detail=cls._format_validation(exc)))

        usernames_in_file: list[str] = [row.username for row in valid_rows]
        if len(set(usernames_in_file)) != len(usernames_in_file):
            duplicates = sorted({u for u in usernames_in_file if usernames_in_file.count(u) > 1})
            for i, row in enumerate(valid_rows, start=2):
                if row.username in duplicates:
                    errors.append(
                        UserBulkError(row=i, detail=f"Дубликат логина в файле: {row.username}")
                    )

        roles_by_name = {r.name: r for r in db.query(Role).all()}
        groups_by_name = {g.name: g for g in db.query(Group).all()}

        # Need actual row numbers from the CSV → rewalk, but we already lost
        # mapping when filtering; rebuild using enumerate+flag:
        to_create: list[tuple[int, UserBulkCSVRow]] = list(enumerate(valid_rows, start=2))
        for row_idx, row in to_create:
            if row.role not in roles_by_name:
                errors.append(UserBulkError(row=row_idx, detail=f"Неизвестная роль: {row.role}"))
                continue
            if row.group_name and row.group_name not in groups_by_name:
                errors.append(
                    UserBulkError(
                        row=row_idx,
                        detail=f"Группа '{row.group_name}' не существует",
                    )
                )

        existing_usernames = {
            u for (u,) in db.query(User.username).filter(User.username.in_(usernames_in_file))
        }
        for row_idx, row in to_create:
            if row.username in existing_usernames:
                errors.append(
                    UserBulkError(
                        row=row_idx,
                        detail=f"Пользователь с логином '{row.username}' уже существует",
                    )
                )

        if errors:
            # All-or-nothing — §T.6: return 422 with zero created.
            return UserBulkResult(created=0, errors=errors)

        created = 0
        for _row_idx, row in to_create:
            user = User(
                username=row.username,
                password_hash=AuthService.hash_password(row.password),
                full_name=row.full_name,
                role_id=roles_by_name[row.role].id,
                group_id=(
                    groups_by_name[row.group_name].id
                    if row.group_name
                    else None
                ),
            )
            db.add(user)
            created += 1
        db.flush()

        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="user.bulk_csv",
            entity_type="user",
            entity_id=None,
            meta={"count": created},
        )
        return UserBulkResult(created=created, errors=[])

    @staticmethod
    def _format_validation(exc: ValidationError) -> str:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"])
        return f"{loc}: {first['msg']}"
