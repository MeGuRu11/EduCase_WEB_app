"""Attempt lifecycle — start / step / finish / abandon / time-remaining /
auto_finish_expired (§6.6, §A.7, §U.3).

Concurrency model (§B.3.4):
* The DB enforces a partial UNIQUE index ``idx_attempts_active`` on
  (user_id, scenario_id) WHERE status='in_progress'. The service catches
  the resulting ``IntegrityError`` and re-reads the existing row — that's how
  concurrent ``start`` requests collapse to a single attempt.
* All write paths use ``db.begin_nested()`` so a failed flush rolls back the
  whole step (§B.3.1) without polluting the outer transaction owned by the
  test fixture.

Sanitisation (§T.2):
* ``next_node`` returned by ``step`` is *always* sanitised when serving a
  student. Authors / admins running a preview see the unredacted node.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from models.attempt import Attempt, AttemptStep
from models.scenario import Scenario, ScenarioGroup, ScenarioNode
from models.user import RoleName, User
from schemas.attempt import (
    AttemptResultOut,
    AttemptStartOut,
    AttemptSummaryOut,
    StepOut,
    StepResult,
    StepResultOut,
    StepSubmit,
    TimeRemaining,
)
from schemas.scenario import (
    EdgeOut,
    GraphIn,
    NodeOut,
    sanitize_scenario_for_student,
)
from services.audit_service import log_action
from services.grader_service import GraderService
from services.graph_engine import GraphEngine
from services.scenario_service import _to_full_out  # internal helper, OK for service-to-service.


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _build_graph(scenario: Scenario) -> GraphIn:
    return GraphIn(
        nodes=[
            NodeOut(
                id=n.id,
                type=n.node_type,  # type: ignore[arg-type]
                position={"x": n.position_x, "y": n.position_y},
                data=n.node_data or {},
                title=n.title,
            )
            for n in scenario.nodes
        ],
        edges=[
            EdgeOut(
                id=e.id,
                source=e.source_id,
                target=e.target_id,
                label=e.label,
                data={
                    "is_correct": e.is_correct,
                    "score_delta": e.score_delta,
                    **({"option_id": e.option_id} if e.option_id is not None else {}),
                },
            )
            for e in scenario.edges
        ],
    )


def _node_for_student(graph: GraphIn, node_id: str, *, sanitise: bool) -> NodeOut | None:
    node = next((n for n in graph.nodes if n.id == node_id), None)
    if node is None:
        return None
    if not sanitise:
        return node
    # Reuse the scenario sanitiser by wrapping as a single-node scenario clone.
    from schemas.scenario import ScenarioFullOut
    placeholder = ScenarioFullOut(
        id=0, title="", description=None, disease_category=None, cover_url=None,
        status="published", author_id=None, author_name=None, time_limit_min=None,
        max_attempts=None, passing_score=0, version=1, node_count=1,
        assigned_groups=[], my_attempts_count=0,
        created_at=_now(), updated_at=_now(),
        nodes=[node], edges=[],
    )
    return sanitize_scenario_for_student(placeholder).nodes[0]


def _load_scenario(db: Session, scenario_id: int) -> Scenario:
    scenario = (
        db.query(Scenario)
        .options(joinedload(Scenario.nodes), joinedload(Scenario.edges))
        .filter(Scenario.id == scenario_id)
        .one_or_none()
    )
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сценарий не найден")
    return scenario


def _load_attempt(db: Session, attempt_id: int) -> Attempt:
    attempt = (
        db.query(Attempt)
        .options(joinedload(Attempt.steps))
        .filter(Attempt.id == attempt_id)
        .one_or_none()
    )
    if attempt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Попытка не найдена")
    return attempt


def _ensure_attempt_owner(attempt: Attempt, actor: User) -> None:
    role = actor.role.name
    if role == RoleName.ADMIN:
        return
    if role == RoleName.STUDENT and attempt.user_id == actor.id:
        return
    if role == RoleName.TEACHER:
        # Teacher owns analytics for their own scenarios only; use scenario_service for read access.
        scenario_owner = attempt.scenario.author_id if attempt.scenario else None
        if scenario_owner == actor.id:
            return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к попытке")


def _student_can_attempt(db: Session, scenario: Scenario, student: User) -> bool:
    if scenario.status != "published":
        return False
    if student.group_id is None:
        return False
    link = (
        db.query(ScenarioGroup)
        .filter(
            ScenarioGroup.scenario_id == scenario.id,
            ScenarioGroup.group_id == student.group_id,
        )
        .one_or_none()
    )
    return link is not None


def _node_max_score(node: ScenarioNode) -> float:
    data = node.node_data or {}
    if node.node_type in ("decision", "text_input"):
        return float(data.get("max_score", 0.0))
    if node.node_type == "form":
        if "max_score" in data:
            return float(data["max_score"])
        return float(sum(float(f.get("score", 0.0)) for f in data.get("fields") or []
                          if isinstance(f, dict)))
    return 0.0


def _scenario_max_score(scenario: Scenario) -> float:
    return float(sum(_node_max_score(n) for n in scenario.nodes))


def _summary_from(attempt: Attempt, scenario: Scenario) -> AttemptSummaryOut:
    max_total = scenario.passing_score
    score_pct = (
        round((attempt.total_score / attempt.max_score) * 100.0, 2)
        if attempt.max_score > 0 else 0.0
    )
    return AttemptSummaryOut(
        id=attempt.id,
        scenario_id=scenario.id,
        scenario_title=scenario.title,
        attempt_num=attempt.attempt_num,
        status=attempt.status,  # type: ignore[arg-type]
        total_score=attempt.total_score,
        max_score=attempt.max_score,
        score_pct=score_pct,
        passed=score_pct >= max_total,
        started_at=attempt.started_at,
        finished_at=attempt.finished_at,
        duration_sec=attempt.duration_sec,
    )


def _result_from(attempt: Attempt, scenario: Scenario) -> AttemptResultOut:
    base = _summary_from(attempt, scenario)
    nodes_by_id = {n.id: n for n in scenario.nodes}
    steps_out: list[StepResultOut] = []
    path: list[str] = []
    for step in attempt.steps:
        node = nodes_by_id.get(step.node_id)
        steps_out.append(
            StepResultOut(
                step_id=step.id,
                node_id=step.node_id,
                node_type=node.node_type if node else "unknown",
                node_title=node.title if node else "",
                action=step.action,
                answer_data=step.answer_data or {},
                score_received=step.score_received,
                max_score=step.max_score,
                is_correct=step.is_correct,
                feedback=step.feedback,
                time_spent_sec=step.time_spent_sec,
                created_at=step.created_at,
            )
        )
        if not path or path[-1] != step.node_id:
            path.append(step.node_id)
    return AttemptResultOut(**base.model_dump(), path=path, steps=steps_out)


# ──────────────── service ────────────────


class AttemptService:
    grader = GraderService()

    # ─── start ──────────────────────────────────────────────

    @classmethod
    def start(cls, db: Session, *, scenario_id: int, actor: User) -> AttemptStartOut:
        scenario = _load_scenario(db, scenario_id)

        if actor.role.name == RoleName.STUDENT and not _student_can_attempt(db, scenario, actor):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Сценарий не назначен вашей группе",
            )
        if scenario.status != "published":
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Сценарий не опубликован",
            )

        # F5-resume — return the existing in_progress row if any.
        active = (
            db.query(Attempt)
            .filter(
                Attempt.user_id == actor.id,
                Attempt.scenario_id == scenario_id,
                Attempt.status == "in_progress",
            )
            .one_or_none()
        )
        if active is not None:
            return cls._start_out(active, scenario, resumed=True)

        prior_count = (
            db.query(Attempt)
            .filter(Attempt.user_id == actor.id, Attempt.scenario_id == scenario_id)
            .count()
        )
        if scenario.max_attempts is not None and prior_count >= scenario.max_attempts:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Лимит попыток исчерпан ({scenario.max_attempts})",
            )

        graph = _build_graph(scenario)
        engine = GraphEngine(graph)
        start_node = engine.get_start_node()

        now = _now()
        expires_at = (
            now + timedelta(minutes=scenario.time_limit_min)
            if scenario.time_limit_min else None
        )

        attempt = Attempt(
            user_id=actor.id,
            scenario_id=scenario_id,
            attempt_num=prior_count + 1,
            status="in_progress",
            total_score=0.0,
            max_score=_scenario_max_score(scenario),
            current_node_id=start_node.id,
            started_at=now,
            expires_at=expires_at,
        )
        savepoint = db.begin_nested()
        try:
            db.add(attempt)
            db.flush()
            savepoint.commit()
        except IntegrityError:
            savepoint.rollback()
            # Concurrent start raced us — fetch the winner.
            active = (
                db.query(Attempt)
                .filter(
                    Attempt.user_id == actor.id,
                    Attempt.scenario_id == scenario_id,
                    Attempt.status == "in_progress",
                )
                .one()
            )
            return cls._start_out(active, scenario, resumed=True)

        db.refresh(attempt)
        return cls._start_out(attempt, scenario, resumed=False)

    @classmethod
    def _start_out(
        cls, attempt: Attempt, scenario: Scenario, *, resumed: bool
    ) -> AttemptStartOut:
        graph = _build_graph(scenario)
        sanitise = True  # student-facing payload by construction in /start
        node = _node_for_student(
            graph, attempt.current_node_id or graph.nodes[0].id, sanitise=sanitise
        )
        return AttemptStartOut(
            attempt_id=attempt.id,
            attempt_num=attempt.attempt_num,
            current_node=node,  # type: ignore[arg-type]
            started_at=attempt.started_at,
            time_limit_min=scenario.time_limit_min,
            expires_at=attempt.expires_at,
            resumed=resumed,
        )

    # ─── step ───────────────────────────────────────────────

    @classmethod
    def step(
        cls,
        db: Session,
        *,
        attempt_id: int,
        payload: StepSubmit,
        actor: User,
    ) -> StepOut:
        attempt = _load_attempt(db, attempt_id)
        _ensure_attempt_owner(attempt, actor)

        if attempt.status != "in_progress":
            raise HTTPException(status.HTTP_404_NOT_FOUND,
                                "Попытка уже завершена")

        if attempt.expires_at is not None and _now() >= attempt.expires_at:
            cls._finalise(db, attempt, reason="time_expired")
            raise HTTPException(
                status.HTTP_410_GONE, "Время попытки истекло"
            )

        if attempt.current_node_id != payload.node_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Недопустимый переход: текущий узел '{attempt.current_node_id}', "
                f"получен '{payload.node_id}'",
            )

        scenario = _load_scenario(db, attempt.scenario_id)
        graph = _build_graph(scenario)
        engine = GraphEngine(graph)
        current_node = next(n for n in scenario.nodes if n.id == payload.node_id)

        # ─ grade ─
        result, edge_id = cls._grade_step(
            current_node=current_node, edges=engine.outgoing(current_node.id),
            payload=payload,
        )

        # ─ persist step + advance ─
        savepoint = db.begin_nested()
        try:
            step_row = AttemptStep(
                attempt_id=attempt.id,
                node_id=payload.node_id,
                edge_id=edge_id,
                action=payload.action,
                answer_data=payload.answer_data or {},
                score_received=result.score,
                max_score=result.max_score,
                is_correct=result.is_correct,
                feedback=result.feedback,
                time_spent_sec=payload.time_spent_sec,
            )
            db.add(step_row)
            attempt.total_score = float(attempt.total_score) + float(result.score)

            next_node_id = (
                None if current_node.node_type == "final"
                else (
                    next(
                        (e.target for e in engine.outgoing(current_node.id)
                         if e.id == edge_id),
                        None,
                    )
                    if edge_id else
                    (engine.outgoing(current_node.id)[0].target
                     if engine.outgoing(current_node.id) else None)
                )
            )
            if next_node_id is None:
                cls._finalise(
                    db, attempt, reason="reached_final", actor_id=actor.id
                )
            else:
                attempt.current_node_id = next_node_id
            db.flush()
            savepoint.commit()
        except HTTPException:
            savepoint.rollback()
            raise
        except Exception:
            savepoint.rollback()
            raise

        db.refresh(attempt)
        path = [s.node_id for s in attempt.steps]
        next_node = (
            _node_for_student(graph, attempt.current_node_id, sanitise=actor.role.name == RoleName.STUDENT)
            if attempt.status == "in_progress" and attempt.current_node_id
            else None
        )
        return StepOut(
            step_result=result,
            next_node=next_node,
            path_so_far=path,
            attempt_status=attempt.status,  # type: ignore[arg-type]
        )

    @classmethod
    def _grade_step(
        cls,
        *,
        current_node: ScenarioNode,
        edges: list[EdgeOut],
        payload: StepSubmit,
    ) -> tuple[StepResult, str | None]:
        node_data = current_node.node_data or {}
        edge_id: str | None = None

        if current_node.node_type == "decision":
            result = cls.grader.grade_decision(
                node_data=node_data, answer_data=payload.answer_data or {},
                edges=edges,
            )
            selected = (payload.answer_data or {}).get("selected_option_id")
            edge_id = next(
                (e.id for e in edges if e.data.get("option_id") == selected),
                None,
            )
        elif current_node.node_type == "form":
            result = cls.grader.grade_form(
                node_data=node_data, answer_data=payload.answer_data or {},
            )
        elif current_node.node_type == "text_input":
            result = cls.grader.grade_text_input(
                node_data=node_data, answer_data=payload.answer_data or {},
            )
        else:  # data, start, final
            result = cls.grader.grade_view_data(
                node_data=node_data, answer_data=payload.answer_data or {},
            )
        return result, edge_id

    # ─── finish / abandon ───────────────────────────────────

    @classmethod
    def finish(
        cls, db: Session, *, attempt_id: int, actor: User
    ) -> AttemptResultOut:
        attempt = _load_attempt(db, attempt_id)
        _ensure_attempt_owner(attempt, actor)
        if attempt.status == "in_progress":
            cls._finalise(db, attempt, reason="manual", actor_id=actor.id)
        scenario = _load_scenario(db, attempt.scenario_id)
        return _result_from(attempt, scenario)

    @classmethod
    def abandon(cls, db: Session, *, attempt_id: int, actor: User) -> dict:
        attempt = _load_attempt(db, attempt_id)
        _ensure_attempt_owner(attempt, actor)
        if attempt.status == "in_progress":
            attempt.status = "abandoned"
            attempt.finished_at = _now()
            attempt.duration_sec = int(
                (attempt.finished_at - attempt.started_at).total_seconds()
            )
            db.flush()
            log_action(
                db,
                actor_id=actor.id,
                action="attempt.abandon",
                entity_type="attempt",
                entity_id=attempt.id,
            )
        return {"status": "abandoned"}

    @classmethod
    def _finalise(
        cls,
        db: Session,
        attempt: Attempt,
        *,
        reason: str,
        actor_id: int | None = None,
    ) -> None:
        attempt.status = "completed"
        attempt.finished_at = _now()
        attempt.duration_sec = int(
            (attempt.finished_at - attempt.started_at).total_seconds()
        )
        db.flush()
        # Map ``reason`` → audit ``action``: ``time_expired`` (APScheduler) is
        # the only system-attributed reason; ``manual`` and ``reached_final``
        # are owned by the student/actor that walked the graph.
        is_system = reason == "time_expired"
        log_action(
            db,
            actor_id=None if is_system else actor_id,
            action="attempt.auto_finish" if is_system else "attempt.finish",
            entity_type="attempt",
            entity_id=attempt.id,
            meta={
                "reason": reason,
                "total_score": attempt.total_score,
                "max_score": attempt.max_score,
            },
        )

    # ─── time-remaining (§A.7) ──────────────────────────────

    @classmethod
    def time_remaining(
        cls, db: Session, *, attempt_id: int, actor: User
    ) -> TimeRemaining:
        attempt = _load_attempt(db, attempt_id)
        _ensure_attempt_owner(attempt, actor)
        if attempt.status != "in_progress":
            raise HTTPException(status.HTTP_410_GONE, "Попытка уже завершена")
        if attempt.expires_at is None:
            return TimeRemaining(remaining_sec=None, expires_at=None)
        delta = (attempt.expires_at - _now()).total_seconds()
        return TimeRemaining(
            remaining_sec=max(0, int(delta)),
            expires_at=attempt.expires_at,
        )

    # ─── list / get ─────────────────────────────────────────

    @classmethod
    def list_for_student(
        cls,
        db: Session,
        *,
        actor: User,
        scenario_id: int | None = None,
    ) -> list[AttemptSummaryOut]:
        q = (
            db.query(Attempt)
            .options(selectinload(Attempt.scenario))
            .filter(Attempt.user_id == actor.id)
        )
        if scenario_id is not None:
            q = q.filter(Attempt.scenario_id == scenario_id)
        q = q.order_by(Attempt.started_at.desc())
        return [
            _summary_from(attempt, attempt.scenario)
            for attempt in q.all()
            if attempt.scenario is not None
        ]

    @classmethod
    def get_detail(
        cls, db: Session, *, attempt_id: int, actor: User
    ) -> AttemptResultOut:
        attempt = _load_attempt(db, attempt_id)
        _ensure_attempt_owner(attempt, actor)
        scenario = _load_scenario(db, attempt.scenario_id)
        return _result_from(attempt, scenario)

    # ─── auto_finish_expired (§U.3) ─────────────────────────

    @classmethod
    def auto_finish_expired_attempts(cls, db: Session) -> int:
        """Finalise every ``in_progress`` row whose ``expires_at`` lies in the past.

        Returns the number of attempts auto-finished. Designed to be called
        from APScheduler once per minute.
        """
        now = _now()
        expired = (
            db.query(Attempt)
            .filter(
                Attempt.status == "in_progress",
                Attempt.expires_at.isnot(None),
                Attempt.expires_at < now,
            )
            .all()
        )
        for attempt in expired:
            cls._finalise(db, attempt, reason="time_expired")
        return len(expired)


# Re-export for callers that prefer module-level helpers.
def get_attempt_full(db: Session, *, attempt_id: int) -> AttemptResultOut:
    attempt = _load_attempt(db, attempt_id)
    scenario = _load_scenario(db, attempt.scenario_id)
    return _result_from(attempt, scenario)


# Suppress an unused-import warning in static analysers — _to_full_out is
# legitimately used by callers that import this module to share the helper.
_ = _to_full_out
