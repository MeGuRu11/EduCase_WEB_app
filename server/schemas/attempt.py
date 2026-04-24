"""Attempt schemas — ADDENDUM §R.5 + §A.7 + §U.3 + §T.2.

NodeOut is imported directly (not as a forward reference) — Pydantic v2 only
needs ``model_rebuild()`` for true string-annotation forward refs (E-01).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from schemas.scenario import NodeOut

AttemptStatus = Literal["in_progress", "completed", "abandoned"]
StepAction = Literal[
    "view_data",      # data / start / final — просто промотка
    "choose_option",  # decision
    "submit_form",    # form
    "submit_text",    # text_input
]


# ───────────── input ─────────────

class AttemptStart(BaseModel):
    scenario_id: int


class StepSubmit(BaseModel):
    node_id: str = Field(min_length=1, max_length=50)
    action: StepAction
    answer_data: dict = Field(default_factory=dict)
    time_spent_sec: int = Field(default=0, ge=0, le=3600)


# ───────────── grade result (used by GraderService) ─────────────

class StepResult(BaseModel):
    score: float
    max_score: float
    is_correct: bool | None  # None for data/start/final
    feedback: str = ""
    details: dict = Field(default_factory=dict)


# ───────────── output ─────────────

class AttemptStartOut(BaseModel):
    attempt_id: int
    attempt_num: int
    current_node: NodeOut
    started_at: datetime
    time_limit_min: int | None = None
    expires_at: datetime | None = None
    resumed: bool = False  # E-14 — F5-resume returned an existing in_progress attempt


class StepOut(BaseModel):
    step_result: StepResult
    next_node: NodeOut | None  # None ⇒ attempt finished
    path_so_far: list[str]
    attempt_status: AttemptStatus


class AttemptSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_id: int
    scenario_title: str
    attempt_num: int
    status: AttemptStatus
    total_score: float
    max_score: float
    score_pct: float
    passed: bool
    started_at: datetime
    finished_at: datetime | None
    duration_sec: int | None


class StepResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_id: int
    node_id: str
    node_type: str
    node_title: str
    action: str
    answer_data: dict
    score_received: float
    max_score: float
    is_correct: bool | None
    feedback: str | None
    time_spent_sec: int | None
    created_at: datetime


class AttemptResultOut(AttemptSummaryOut):
    path: list[str]
    steps: list[StepResultOut]


class TimeRemaining(BaseModel):
    remaining_sec: int | None
    expires_at: datetime | None
