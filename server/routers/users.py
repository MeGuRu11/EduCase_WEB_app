"""/api/users — CRUD + bulk CSV + RESTful status per §6.2, §T.6, E-13."""

from __future__ import annotations

from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi import File as FastAPIFile
from sqlalchemy.orm import Session, joinedload

from database import get_db
from dependencies import get_current_user, require_role
from models.user import User
from schemas.common import PaginatedResponse
from schemas.user import (
    ChangePasswordRequest,
    ResetPasswordRequest,
    UserBulkResult,
    UserCreate,
    UserOut,
    UserStatusUpdate,
    UserUpdate,
)
from services.user_service import UserService

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=PaginatedResponse[UserOut])
def list_users(
    role: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1, le=10_000),
    per_page: int = Query(default=20, ge=1, le=100),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[UserOut]:
    items, total = UserService.list_users(
        db, actor=current, role=role, search=search, page=page, per_page=per_page
    )
    return PaginatedResponse[UserOut](
        items=[UserService.to_out(u) for u in items],
        total=total,
        page=page,
        pages=max(1, ceil(total / per_page)),
        per_page=per_page,
    )


@router.post(
    "/",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    user = UserService.create(db, payload)
    return UserService.to_out(user)


@router.post(
    "/bulk-csv",
    response_model=UserBulkResult,
    dependencies=[Depends(require_role("admin"))],
)
async def bulk_csv(
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
) -> UserBulkResult:
    blob = await file.read()
    result = UserService.bulk_csv(db, blob=blob)
    if result.errors:
        # §T.6 — all-or-nothing; surface errors via 422, not 200.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.model_dump(),
        )
    return result


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    target = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.group))
        .filter(User.id == user_id)
        .one_or_none()
    )
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
        )
    user = UserService.update(db, user=target, patch=payload, actor=current)
    return UserService.to_out(user)


@router.put(
    "/{user_id}/status",
    response_model=UserOut,
    dependencies=[Depends(require_role("admin"))],
)
def set_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    target = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.group))
        .filter(User.id == user_id)
        .one_or_none()
    )
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
        )
    user = UserService.set_status(
        db, user=target, is_active=payload.is_active, actor=current
    )
    return UserService.to_out(user)


@router.post(
    "/{user_id}/reset-password",
    dependencies=[Depends(require_role("admin"))],
)
def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
        )
    UserService.reset_password(db, user=target, new_password=payload.new_password)
    return {"status": "ok"}


@router.post("/me/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    UserService.change_password(
        db,
        user=current,
        old_password=payload.old_password,
        new_password=payload.new_password,
    )
    return {"status": "ok"}
