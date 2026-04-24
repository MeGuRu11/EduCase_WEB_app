"""/api/nodes per PROJECT_DESIGN §6.5.

Selective update of a single node inside a scenario. ``scenario_id`` is
part of the request body so the URL stays ``/api/nodes/{node_id}`` — IDs
are unique per scenario only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.user import User
from schemas.scenario import NodeOut, NodePatch
from services.scenario_service import ScenarioService

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class NodePatchBody(NodePatch):
    """``NodePatch`` plus the scenario the node belongs to."""

    scenario_id: int = Field(gt=0)


@router.patch(
    "/{node_id}",
    response_model=NodeOut,
    dependencies=[Depends(require_role("teacher", "admin"))],
)
def patch_node(
    node_id: str,
    payload: NodePatchBody,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NodeOut:
    patch = NodePatch(
        data=payload.data,
        title=payload.title,
        content=payload.content,
        color_hex=payload.color_hex,
    )
    return ScenarioService.patch_node(
        db,
        scenario_id=payload.scenario_id,
        node_id=node_id,
        patch=patch,
        actor=current,
    )
