"""Group CRUD + teacher/student assignment per §6.3."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from models.user import Group, Role, RoleName, TeacherGroup, User
from schemas.group import GroupCreate, GroupOut, GroupUpdate, TeacherShort
from services.audit_service import log_action


class GroupService:
    # ─── Serialization ─────────────────────────────────────────────────────

    @staticmethod
    def to_out(db: Session, group: Group) -> GroupOut:
        teachers = [
            TeacherShort.model_validate(link.teacher)
            for link in group.teacher_links
        ]
        student_count = (
            db.query(func.count(User.id))
            .join(Role, User.role_id == Role.id)
            .filter(User.group_id == group.id, Role.name == RoleName.STUDENT)
            .scalar()
            or 0
        )
        return GroupOut(
            id=group.id,
            name=group.name,
            description=group.description,
            teachers=teachers,
            student_count=int(student_count),
            is_active=group.is_active,
            created_at=group.created_at,
        )

    # ─── CRUD ──────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls, db: Session, payload: GroupCreate, *, actor: User | None = None
    ) -> Group:
        group = Group(name=payload.name, description=payload.description)
        db.add(group)
        db.flush()
        db.refresh(group, ["teacher_links"])
        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="group.create",
            entity_type="group",
            entity_id=group.id,
            meta={"name": group.name},
        )
        return group

    @classmethod
    def update(
        cls,
        db: Session,
        *,
        group: Group,
        patch: GroupUpdate,
        actor: User | None = None,
    ) -> Group:
        changed: dict[str, object] = {}
        if patch.name is not None and patch.name != group.name:
            changed["name"] = patch.name
            group.name = patch.name
        if patch.description is not None and patch.description != group.description:
            changed["description"] = True  # avoid logging full text
            group.description = patch.description
        if patch.is_active is not None and patch.is_active != group.is_active:
            changed["is_active"] = patch.is_active
            group.is_active = patch.is_active
        db.flush()
        if changed:
            log_action(
                db,
                actor_id=actor.id if actor else None,
                action="group.update",
                entity_type="group",
                entity_id=group.id,
                meta={"changed": list(changed.keys())},
            )
        return group

    # ─── Listing ───────────────────────────────────────────────────────────

    @classmethod
    def list_groups(cls, db: Session, *, actor: User) -> list[Group]:
        q = db.query(Group).options(
            joinedload(Group.teacher_links).joinedload(TeacherGroup.teacher)
        )
        if actor.role.name == RoleName.TEACHER:
            # Only groups the teacher is linked to.
            linked = select(TeacherGroup.group_id).where(TeacherGroup.teacher_id == actor.id)
            q = q.filter(Group.id.in_(linked))
        elif actor.role.name != RoleName.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )
        return q.order_by(Group.name.asc()).all()

    # ─── Member management ────────────────────────────────────────────────

    @classmethod
    def add_member(
        cls,
        db: Session,
        *,
        group: Group,
        user_id: int,
        actor: User | None = None,
    ) -> None:
        member = (
            db.query(User)
            .options(joinedload(User.role))
            .filter(User.id == user_id)
            .one_or_none()
        )
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден",
            )
        if member.role.name != RoleName.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Пользователь не является студентом",
            )
        if member.group_id == group.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь уже в группе",
            )
        member.group_id = group.id
        db.flush()
        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="group.add_member",
            entity_type="group",
            entity_id=group.id,
            meta={"user_id": user_id},
        )

    @classmethod
    def remove_member(
        cls,
        db: Session,
        *,
        group: Group,
        user_id: int,
        actor: User | None = None,
    ) -> None:
        member = db.get(User, user_id)
        if member is None or member.group_id != group.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не состоит в этой группе",
            )
        member.group_id = None
        db.flush()
        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="group.remove_member",
            entity_type="group",
            entity_id=group.id,
            meta={"user_id": user_id},
        )

    # ─── Teacher assignment ────────────────────────────────────────────────

    @classmethod
    def assign_teacher(
        cls,
        db: Session,
        *,
        group: Group,
        teacher_id: int,
        actor: User | None = None,
    ) -> None:
        teacher = (
            db.query(User)
            .options(joinedload(User.role))
            .filter(User.id == teacher_id)
            .one_or_none()
        )
        if teacher is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Преподаватель не найден",
            )
        if teacher.role.name != RoleName.TEACHER:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Пользователь не является преподавателем",
            )
        existing = (
            db.query(TeacherGroup)
            .filter(
                TeacherGroup.teacher_id == teacher_id,
                TeacherGroup.group_id == group.id,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Преподаватель уже привязан к этой группе",
            )
        db.add(TeacherGroup(teacher_id=teacher_id, group_id=group.id))
        db.flush()
        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="group.assign_teacher",
            entity_type="group",
            entity_id=group.id,
            meta={"teacher_id": teacher_id},
        )

    @classmethod
    def remove_teacher(
        cls,
        db: Session,
        *,
        group: Group,
        teacher_id: int,
        actor: User | None = None,
    ) -> None:
        link = (
            db.query(TeacherGroup)
            .filter(
                TeacherGroup.teacher_id == teacher_id,
                TeacherGroup.group_id == group.id,
            )
            .one_or_none()
        )
        if link is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Связь преподаватель↔группа не найдена",
            )
        db.delete(link)
        db.flush()
        log_action(
            db,
            actor_id=actor.id if actor else None,
            action="group.remove_teacher",
            entity_type="group",
            entity_id=group.id,
            meta={"teacher_id": teacher_id},
        )
