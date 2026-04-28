"""/api/analytics per PROJECT_DESIGN §6.6 + ADDENDUM §R.6 + §E.1 (export)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.user import RoleName, User
from schemas.analytics import (
    AdminStatsOut,
    PathHeatmapOut,
    StudentDashboardOut,
    TeacherScenarioStatsOut,
)
from services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get(
    "/student/dashboard",
    response_model=StudentDashboardOut,
    dependencies=[Depends(require_role(RoleName.STUDENT))],
)
def student_dashboard(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudentDashboardOut:
    return AnalyticsService.student_dashboard(db, student=current)


@router.get(
    "/teacher/scenarios",
    response_model=list[TeacherScenarioStatsOut],
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def teacher_scenarios(
    scenario_id: int | None = None,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TeacherScenarioStatsOut]:
    return AnalyticsService.teacher_scenario_stats(
        db, teacher=current, scenario_id=scenario_id
    )


@router.get(
    "/teacher/heatmap/{scenario_id}",
    response_model=PathHeatmapOut,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def path_heatmap(
    scenario_id: int,
    db: Session = Depends(get_db),
) -> PathHeatmapOut:
    return AnalyticsService.path_heatmap(db, scenario_id=scenario_id)


@router.get(
    "/admin/stats",
    response_model=AdminStatsOut,
    dependencies=[Depends(require_role(RoleName.ADMIN))],
)
def admin_stats(db: Session = Depends(get_db)) -> AdminStatsOut:
    return AnalyticsService.admin_stats(db)


@router.get(
    "/export",
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def export_analytics(
    format: Literal["xlsx", "pdf"] = Query(default="xlsx"),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if format == "xlsx":
        body = AnalyticsService.export_xlsx(db, teacher=current)
        return Response(
            content=body,
            media_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            headers={
                "Content-Disposition": 'attachment; filename="analytics.xlsx"',
            },
        )
    if format == "pdf":
        body = AnalyticsService.export_pdf(db, teacher=current)
        return Response(
            content=body,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="analytics.pdf"',
            },
        )
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Неподдерживаемый формат: {format}",
    )
