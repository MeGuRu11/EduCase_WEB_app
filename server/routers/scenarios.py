"""/api/scenarios per PROJECT_DESIGN §6.4 + ADDENDUM §R.4.

Endpoints:
  GET    /api/scenarios/                — list (role-scoped)
  POST   /api/scenarios/                — create (teacher/admin)
  GET    /api/scenarios/{id}            — full (sanitised for student)
  PATCH  /api/scenarios/{id}            — metadata update
  DELETE /api/scenarios/{id}            — delete draft
  PUT    /api/scenarios/{id}/graph      — full graph replace (§B.3)
  POST   /api/scenarios/{id}/publish    — validate + publish (E-14)
  POST   /api/scenarios/{id}/unpublish  — back to draft (E-14)
  POST   /api/scenarios/{id}/archive    — archive scenario
  POST   /api/scenarios/{id}/assign     — link to group
  POST   /api/scenarios/{id}/duplicate  — clone as new draft
  POST   /api/scenarios/{id}/preview    — start preview session (§UI.1)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.user import RoleName, User
from schemas.scenario import (
    GraphIn,
    PublishResult,
    ScenarioAssign,
    ScenarioCreate,
    ScenarioFullOut,
    ScenarioListOut,
    ScenarioUpdate,
)
from services.scenario_service import ScenarioService

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("/", response_model=list[ScenarioListOut])
def list_scenarios(
    status_filter: str | None = None,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ScenarioListOut]:
    return ScenarioService.list_for(db, actor=current, status_filter=status_filter)


@router.post(
    "/",
    response_model=ScenarioFullOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def create_scenario(
    payload: ScenarioCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioFullOut:
    return ScenarioService.create(db, payload, author=current)


@router.get("/{scenario_id}", response_model=ScenarioFullOut)
def get_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioFullOut:
    return ScenarioService.get_for(db, scenario_id=scenario_id, actor=current)


@router.patch(
    "/{scenario_id}",
    response_model=ScenarioFullOut,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def update_scenario(
    scenario_id: int,
    payload: ScenarioUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioFullOut:
    return ScenarioService.update(
        db, scenario_id=scenario_id, patch=payload, actor=current
    )


@router.delete(
    "/{scenario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def delete_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    ScenarioService.delete_draft(db, scenario_id=scenario_id, actor=current)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{scenario_id}/graph",
    response_model=ScenarioFullOut,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def save_graph(
    scenario_id: int,
    graph: GraphIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioFullOut:
    return ScenarioService.save_graph(
        db, scenario_id=scenario_id, graph_in=graph, actor=current
    )


@router.post(
    "/{scenario_id}/publish",
    response_model=PublishResult,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def publish_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PublishResult:
    return ScenarioService.publish(db, scenario_id=scenario_id, actor=current)


@router.post(
    "/{scenario_id}/unpublish",
    response_model=PublishResult,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def unpublish_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PublishResult:
    return ScenarioService.unpublish(db, scenario_id=scenario_id, actor=current)


@router.post(
    "/{scenario_id}/archive",
    response_model=ScenarioListOut,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def archive_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioListOut:
    return ScenarioService.archive(db, scenario_id=scenario_id, actor=current)


@router.post(
    "/{scenario_id}/assign",
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def assign_scenario(
    scenario_id: int,
    payload: ScenarioAssign,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    return ScenarioService.assign(
        db, scenario_id=scenario_id, payload=payload, actor=current
    )


@router.post(
    "/{scenario_id}/duplicate",
    response_model=ScenarioFullOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def duplicate_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioFullOut:
    return ScenarioService.duplicate(db, scenario_id=scenario_id, actor=current)


@router.post(
    "/{scenario_id}/preview",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(RoleName.TEACHER, RoleName.ADMIN))],
)
def preview_scenario(
    scenario_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return ScenarioService.start_preview(
        db, scenario_id=scenario_id, actor=current
    )
