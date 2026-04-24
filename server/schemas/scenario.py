"""Scenario Pydantic v2 schemas per ADDENDUM §R.4 + §T.2 + §B.5."""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

NodeType = Literal["start", "data", "decision", "form", "text_input", "final"]
ScenarioStatus = Literal["draft", "published", "archived"]

# ADDENDUM §T.2 — fields that must never leak to a student.
STUDENT_FORBIDDEN_DECISION_OPTION_KEYS = ("feedback", "score")
STUDENT_FORBIDDEN_FORM_FIELD_KEYS = ("correct_value", "score")
STUDENT_FORBIDDEN_TEXT_INPUT_KEYS = ("keywords", "max_score")
STUDENT_FORBIDDEN_EDGE_DATA_KEYS = ("is_correct", "score_delta", "condition")


# ───────────── Write-side schemas ─────────────

class ScenarioCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    disease_category: str | None = Field(default=None, max_length=100)
    topic_id: int | None = None
    time_limit_min: int | None = Field(default=None, ge=1, le=480)
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    passing_score: int = Field(default=60, ge=0, le=100)


class ScenarioUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    disease_category: str | None = Field(default=None, max_length=100)
    topic_id: int | None = None
    time_limit_min: int | None = Field(default=None, ge=1, le=480)
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    passing_score: int | None = Field(default=None, ge=0, le=100)
    cover_path: str | None = None


# ───────────── Graph element schemas ─────────────

class NodeOut(BaseModel):
    """Full node. For ``student`` role caller must run ``sanitize_scenario_for_student``
    first, to strip ``correct_value`` / ``score`` / ``keywords`` from ``data``. See §T.2."""

    id: str = Field(min_length=1, max_length=50)
    type: NodeType
    position: dict = Field(default_factory=dict)  # {"x": float, "y": float}
    data: dict = Field(default_factory=dict)      # node_data JSONB
    title: str = Field(default="", max_length=300)


class EdgeOut(BaseModel):
    """Edge. For ``student`` role caller must strip ``is_correct`` / ``score_delta`` / ``condition``."""

    id: str = Field(min_length=1, max_length=50)
    source: str = Field(min_length=1, max_length=50)
    target: str = Field(min_length=1, max_length=50)
    label: str | None = Field(default=None, max_length=200)
    data: dict = Field(default_factory=dict)

    @field_validator("data")
    @classmethod
    def check_condition_reserved(cls, v: dict) -> dict:
        """ADDENDUM §B.5 — ``condition`` is reserved for V2 and must stay NULL in MVP."""
        if v.get("condition") not in (None, {}):
            raise ValueError(
                "Conditional edges are reserved for V2 "
                "(condition должен быть null в MVP)"
            )
        return v


class GraphIn(BaseModel):
    """Body of ``PUT /api/scenarios/{id}/graph`` — full replace."""

    nodes: list[NodeOut]
    edges: list[EdgeOut]


# ───────────── Read-side schemas ─────────────

class ScenarioListOut(BaseModel):
    """Brief card. Does **not** include the graph."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None = None
    disease_category: str | None = None
    cover_url: str | None = None
    status: ScenarioStatus
    author_id: int | None = None
    author_name: str | None = None
    time_limit_min: int | None = None
    max_attempts: int | None = None
    passing_score: int
    version: int
    node_count: int = 0
    assigned_groups: list[int] = Field(default_factory=list)
    my_attempts_count: int = 0
    created_at: datetime
    updated_at: datetime


class ScenarioFullOut(ScenarioListOut):
    """Scenario with full graph."""

    nodes: list[NodeOut] = Field(default_factory=list)
    edges: list[EdgeOut] = Field(default_factory=list)
    published_at: datetime | None = None


class ScenarioAssign(BaseModel):
    group_id: int
    deadline: datetime | None = None


class PublishResult(BaseModel):
    status: ScenarioStatus
    errors: list[str] = Field(default_factory=list)


class NodePatch(BaseModel):
    """Body of ``PATCH /api/nodes/{id}``. Selective update of a single node."""

    data: dict | None = None
    title: str | None = Field(default=None, max_length=300)
    content: str | None = None
    color_hex: str | None = Field(default=None, max_length=7)


# ───────────── Student sanitizer (ADDENDUM §T.2) ─────────────

def _strip_keys(d: dict, keys: tuple[str, ...]) -> dict:
    return {k: v for k, v in d.items() if k not in keys}


def sanitize_scenario_for_student(scenario: ScenarioFullOut) -> ScenarioFullOut:
    """Remove fields revealing correct answers from a scenario shown to a student.

    Works on a deep copy — the caller keeps the original for authors / admins.
    """
    clone = scenario.model_copy(deep=True)

    sanitized_nodes: list[NodeOut] = []
    for node in clone.nodes:
        data = copy.deepcopy(node.data or {})
        if node.type == "decision":
            options = data.get("options") or []
            data["options"] = [
                _strip_keys(opt, STUDENT_FORBIDDEN_DECISION_OPTION_KEYS)
                for opt in options
                if isinstance(opt, dict)
            ]
        elif node.type == "form":
            fields = data.get("fields") or []
            data["fields"] = [
                _strip_keys(field, STUDENT_FORBIDDEN_FORM_FIELD_KEYS)
                for field in fields
                if isinstance(field, dict)
            ]
        elif node.type == "text_input":
            for key in STUDENT_FORBIDDEN_TEXT_INPUT_KEYS:
                data.pop(key, None)
        sanitized_nodes.append(
            NodeOut(
                id=node.id,
                type=node.type,
                position=node.position,
                data=data,
                title=node.title,
            )
        )
    clone.nodes = sanitized_nodes

    sanitized_edges: list[EdgeOut] = []
    for edge in clone.edges:
        edge_data = _strip_keys(
            copy.deepcopy(edge.data or {}), STUDENT_FORBIDDEN_EDGE_DATA_KEYS
        )
        sanitized_edges.append(
            EdgeOut(
                id=edge.id,
                source=edge.source,
                target=edge.target,
                label=edge.label,
                data=edge_data,
            )
        )
    clone.edges = sanitized_edges
    return clone
