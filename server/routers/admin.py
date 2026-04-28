"""/api/admin + /api/health per PROJECT_DESIGN §6.7/§6.8 + ADDENDUM §SCALE.2 + ADR-010."""

from __future__ import annotations

from math import ceil

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.user import RoleName, User
from schemas.common import PaginatedResponse
from schemas.system import (
    BackupCreateResult,
    BackupInfo,
    HealthCheckOut,
    SysInfoOut,
    SystemLogOut,
    SystemSettingsOut,
    SystemSettingUpdate,
)
from services.admin_service import AdminService
from services.audit_service import log_action
from services.backup_service import BackupService

router = APIRouter(prefix="/api/admin", tags=["admin"])
public_router = APIRouter(tags=["health"])


# ─── backups ────────────────────────────────────────────────────────────────


@router.post(
    "/backup",
    response_model=BackupCreateResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def create_backup(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BackupCreateResult:
    result = BackupService.create_backup(db, actor_id=current.id)
    log_action(
        db,
        actor_id=current.id,
        action="backup.create",
        entity_type="backup",
        meta={"filename": result["filename"], "size_mb": result["size_mb"]},
    )
    return BackupCreateResult(**result)


@router.get(
    "/backup",
    response_model=list[BackupInfo],
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def list_backups() -> list[BackupInfo]:
    return [BackupInfo(**item) for item in BackupService.list_backups()]


@router.delete(
    "/backup/{filename}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def delete_backup(
    filename: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    BackupService.delete_backup(filename)
    log_action(
        db,
        actor_id=current.id,
        action="backup.delete",
        entity_type="backup",
        meta={"filename": filename},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/restore/{filename}",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def restore_backup(
    filename: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    result = BackupService.restore_backup(db, filename=filename, actor_id=current.id)
    log_action(
        db,
        actor_id=current.id,
        action="backup.restore",
        entity_type="backup",
        meta=result,
    )
    return {"status": "started", **result}


# ─── sysinfo / settings / logs ──────────────────────────────────────────────


@router.get(
    "/sysinfo",
    response_model=SysInfoOut,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def sysinfo(db: Session = Depends(get_db)) -> SysInfoOut:
    return SysInfoOut(**AdminService.sysinfo(db))


@router.get(
    "/settings",
    response_model=SystemSettingsOut,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def get_settings(db: Session = Depends(get_db)) -> SystemSettingsOut:
    return SystemSettingsOut(**AdminService.list_settings(db))


@router.put(
    "/settings",
    response_model=SystemSettingsOut,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def put_settings(
    payload: SystemSettingUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SystemSettingsOut:
    settings = AdminService.update_settings(
        db,
        payload=payload.model_dump(exclude_unset=True),
        actor_id=current.id,
    )
    return SystemSettingsOut(**settings)


@router.get(
    "/logs",
    response_model=PaginatedResponse[SystemLogOut],
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def list_logs(
    level: str | None = Query(default=None),
    page: int = Query(default=1, ge=1, le=10_000),
    per_page: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PaginatedResponse[SystemLogOut]:
    items, total = AdminService.list_logs(db, level=level, page=page, per_page=per_page)
    return PaginatedResponse[SystemLogOut](
        items=[SystemLogOut.model_validate(it) for it in items],
        total=total,
        page=page,
        pages=max(1, ceil(total / per_page)),
        per_page=per_page,
    )


# ─── public health (ADR-010) ────────────────────────────────────────────────


@public_router.get("/api/health", response_model=HealthCheckOut)
def health(db: Session = Depends(get_db)) -> HealthCheckOut:
    payload = AdminService.health(db)
    return HealthCheckOut(**payload)
