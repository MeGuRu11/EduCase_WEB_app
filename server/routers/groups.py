"""/api/groups per §6.3."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import get_current_user, require_role
from models.user import Group, TeacherGroup, User
from schemas.group import (
    GroupCreate,
    GroupMemberAdd,
    GroupOut,
    GroupTeacherAssign,
    GroupUpdate,
)
from services.group_service import GroupService

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _get_group_or_404(db: Session, group_id: int) -> Group:
    group = (
        db.query(Group)
        .options(joinedload(Group.teacher_links).joinedload(TeacherGroup.teacher))
        .filter(Group.id == group_id)
        .one_or_none()
    )
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена"
        )
    return group


@router.get("/", response_model=list[GroupOut])
def list_groups(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GroupOut]:
    groups = GroupService.list_groups(db, actor=current)
    return [GroupService.to_out(db, g) for g in groups]


@router.post(
    "/",
    response_model=GroupOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
def create_group(payload: GroupCreate, db: Session = Depends(get_db)) -> GroupOut:
    group = GroupService.create(db, payload)
    return GroupService.to_out(db, group)


@router.patch(
    "/{group_id}",
    response_model=GroupOut,
    dependencies=[Depends(require_role("admin"))],
)
def update_group(
    group_id: int, payload: GroupUpdate, db: Session = Depends(get_db)
) -> GroupOut:
    group = _get_group_or_404(db, group_id)
    group = GroupService.update(db, group=group, patch=payload)
    return GroupService.to_out(db, group)


@router.post(
    "/{group_id}/members",
    dependencies=[Depends(require_role("admin"))],
)
def add_member(
    group_id: int, payload: GroupMemberAdd, db: Session = Depends(get_db)
) -> dict[str, str]:
    group = _get_group_or_404(db, group_id)
    GroupService.add_member(db, group=group, user_id=payload.user_id)
    return {"status": "ok"}


@router.delete(
    "/{group_id}/members/{user_id}",
    dependencies=[Depends(require_role("admin"))],
)
def remove_member(
    group_id: int, user_id: int, db: Session = Depends(get_db)
) -> dict[str, str]:
    group = _get_group_or_404(db, group_id)
    GroupService.remove_member(db, group=group, user_id=user_id)
    return {"status": "removed"}


@router.post(
    "/{group_id}/assign-teacher",
    dependencies=[Depends(require_role("admin"))],
)
def assign_teacher(
    group_id: int, payload: GroupTeacherAssign, db: Session = Depends(get_db)
) -> dict[str, str]:
    group = _get_group_or_404(db, group_id)
    GroupService.assign_teacher(db, group=group, teacher_id=payload.teacher_id)
    return {"status": "ok"}


@router.delete(
    "/{group_id}/teachers/{teacher_id}",
    dependencies=[Depends(require_role("admin"))],
)
def remove_teacher(
    group_id: int, teacher_id: int, db: Session = Depends(get_db)
) -> dict[str, str]:
    group = _get_group_or_404(db, group_id)
    GroupService.remove_teacher(db, group=group, teacher_id=teacher_id)
    return {"status": "removed"}
