"""/api/attempts per PROJECT_DESIGN §6.6 + ADDENDUM §A.7.

Endpoints:
  POST  /api/attempts/start                — start (or resume on F5) an attempt
  POST  /api/attempts/{id}/step            — submit one node and advance
  POST  /api/attempts/{id}/finish          — finish + return AttemptResultOut
  POST  /api/attempts/{id}/abandon         — mark abandoned
  GET   /api/attempts/my                   — student's own attempt list
  GET   /api/attempts/{id}                 — full result detail
  GET   /api/attempts/{id}/time-remaining  — server-authoritative timer (§U.3)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.user import User
from schemas.attempt import (
    AttemptResultOut,
    AttemptStart,
    AttemptStartOut,
    AttemptSummaryOut,
    StepOut,
    StepSubmit,
    TimeRemaining,
)
from services.attempt_service import AttemptService

router = APIRouter(prefix="/api/attempts", tags=["attempts"])


@router.post(
    "/start",
    response_model=AttemptStartOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("student", "teacher", "admin"))],
)
def start_attempt(
    payload: AttemptStart,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptStartOut:
    return AttemptService.start(db, scenario_id=payload.scenario_id, actor=current)


@router.post("/{attempt_id}/step", response_model=StepOut)
def submit_step(
    attempt_id: int,
    payload: StepSubmit,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StepOut:
    return AttemptService.step(
        db, attempt_id=attempt_id, payload=payload, actor=current
    )


@router.post("/{attempt_id}/finish", response_model=AttemptResultOut)
def finish_attempt(
    attempt_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptResultOut:
    return AttemptService.finish(db, attempt_id=attempt_id, actor=current)


@router.post("/{attempt_id}/abandon")
def abandon_attempt(
    attempt_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return AttemptService.abandon(db, attempt_id=attempt_id, actor=current)


@router.get("/my", response_model=list[AttemptSummaryOut])
def list_my_attempts(
    scenario_id: int | None = None,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AttemptSummaryOut]:
    return AttemptService.list_for_student(
        db, actor=current, scenario_id=scenario_id
    )


@router.get("/{attempt_id}", response_model=AttemptResultOut)
def get_attempt(
    attempt_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttemptResultOut:
    return AttemptService.get_detail(db, attempt_id=attempt_id, actor=current)


@router.get("/{attempt_id}/time-remaining", response_model=TimeRemaining)
def get_time_remaining(
    attempt_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeRemaining:
    return AttemptService.time_remaining(
        db, attempt_id=attempt_id, actor=current
    )
