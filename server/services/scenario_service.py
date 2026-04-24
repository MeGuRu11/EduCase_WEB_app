"""Scenario CRUD, ``save_graph``, publish / unpublish / assign / duplicate / archive.

Transactional operations follow BEST_PRACTICES §B.3 — ``save_graph`` in
particular uses a ``SAVEPOINT`` so that a mid-insert failure rolls back the
whole replacement, not just the failing row.

The student-facing read path calls ``sanitize_scenario_for_student`` (§T.2).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from models.scenario import (
    Scenario,
    ScenarioEdge,
    ScenarioGroup,
    ScenarioNode,
)
from models.user import Group, TeacherGroup, User
from schemas.scenario import (
    EdgeOut,
    GraphIn,
    NodeOut,
    NodePatch,
    PublishResult,
    ScenarioAssign,
    ScenarioCreate,
    ScenarioFullOut,
    ScenarioListOut,
    ScenarioUpdate,
    sanitize_scenario_for_student,
)
from services.graph_engine import GraphEngine

# ────────────── preview sessions (in-memory, §UI.1) ──────────────

_PreviewState = dict[str, Any]  # {scenario_id, current_node_id, path, created_at}
_preview_sessions: dict[str, _PreviewState] = {}
_PREVIEW_MAX_AGE_SEC = 2 * 60 * 60  # 2 hours


def _reap_preview_sessions() -> None:
    now = datetime.now(tz=UTC)
    stale = [
        sid
        for sid, state in _preview_sessions.items()
        if (now - state["created_at"]).total_seconds() > _PREVIEW_MAX_AGE_SEC
    ]
    for sid in stale:
        _preview_sessions.pop(sid, None)


# ────────────── helpers ──────────────

def _to_full_out(scenario: Scenario, db: Session) -> ScenarioFullOut:
    author: User | None = db.get(User, scenario.author_id) if scenario.author_id else None
    assigned_groups = [
        sg.group_id
        for sg in db.query(ScenarioGroup).filter(ScenarioGroup.scenario_id == scenario.id)
    ]
    nodes_out = [
        NodeOut(
            id=n.id,
            type=n.node_type,  # type: ignore[arg-type]
            position={"x": n.position_x, "y": n.position_y},
            data=n.node_data or {},
            title=n.title,
        )
        for n in scenario.nodes
    ]
    edges_out = [
        EdgeOut(
            id=e.id,
            source=e.source_id,
            target=e.target_id,
            label=e.label,
            data={
                "is_correct": e.is_correct,
                "score_delta": e.score_delta,
                **({} if e.condition is None else {"condition": None}),
            },
        )
        for e in scenario.edges
    ]
    return ScenarioFullOut(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description,
        disease_category=scenario.disease_category,
        cover_url=(
            f"/media/{scenario.cover_path}" if scenario.cover_path else None
        ),
        status=scenario.status,  # type: ignore[arg-type]
        author_id=scenario.author_id,
        author_name=(author.full_name if author else None),
        time_limit_min=scenario.time_limit_min,
        max_attempts=scenario.max_attempts,
        passing_score=scenario.passing_score,
        version=scenario.version,
        node_count=len(scenario.nodes),
        assigned_groups=assigned_groups,
        my_attempts_count=0,  # populated in Stage 3
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        published_at=scenario.published_at,
        nodes=nodes_out,
        edges=edges_out,
    )


def _to_list_out(scenario: Scenario, db: Session) -> ScenarioListOut:
    author = db.get(User, scenario.author_id) if scenario.author_id else None
    node_count = (
        db.query(ScenarioNode).filter(ScenarioNode.scenario_id == scenario.id).count()
    )
    assigned_groups = [
        sg.group_id
        for sg in db.query(ScenarioGroup).filter(ScenarioGroup.scenario_id == scenario.id)
    ]
    return ScenarioListOut(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description,
        disease_category=scenario.disease_category,
        cover_url=(
            f"/media/{scenario.cover_path}" if scenario.cover_path else None
        ),
        status=scenario.status,  # type: ignore[arg-type]
        author_id=scenario.author_id,
        author_name=(author.full_name if author else None),
        time_limit_min=scenario.time_limit_min,
        max_attempts=scenario.max_attempts,
        passing_score=scenario.passing_score,
        version=scenario.version,
        node_count=node_count,
        assigned_groups=assigned_groups,
        my_attempts_count=0,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


def _load_scenario_or_404(db: Session, scenario_id: int) -> Scenario:
    scenario = (
        db.query(Scenario)
        .options(joinedload(Scenario.nodes), joinedload(Scenario.edges))
        .filter(Scenario.id == scenario_id)
        .one_or_none()
    )
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сценарий не найден")
    return scenario


def _ensure_author_or_admin(scenario: Scenario, actor: User) -> None:
    role = actor.role.name
    if role == "admin":
        return
    if role == "teacher" and scenario.author_id == actor.id:
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "Недостаточно прав для редактирования сценария",
    )


def _student_can_see(
    db: Session, scenario: Scenario, student: User
) -> bool:
    if scenario.status != "published" and scenario.status != "archived":
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
    return link is not None and scenario.status == "published"


# ────────────── service ──────────────


class ScenarioService:
    # ─── create / update / delete ─────────────────────────────

    @classmethod
    def create(
        cls, db: Session, payload: ScenarioCreate, *, author: User
    ) -> ScenarioFullOut:
        scenario = Scenario(
            title=payload.title,
            description=payload.description,
            disease_category=payload.disease_category,
            topic_id=payload.topic_id,
            time_limit_min=payload.time_limit_min,
            max_attempts=payload.max_attempts,
            passing_score=payload.passing_score,
            author_id=author.id,
            status="draft",
            version=1,
        )
        db.add(scenario)
        db.flush()
        db.refresh(scenario)
        return _to_full_out(scenario, db)

    @classmethod
    def update(
        cls,
        db: Session,
        *,
        scenario_id: int,
        patch: ScenarioUpdate,
        actor: User,
    ) -> ScenarioFullOut:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        data = patch.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(scenario, key, value)
        scenario.updated_at = datetime.now(tz=UTC)
        db.flush()
        db.refresh(scenario)
        return _to_full_out(scenario, db)

    @classmethod
    def delete_draft(cls, db: Session, *, scenario_id: int, actor: User) -> None:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        if scenario.status != "draft":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Нельзя удалить опубликованный сценарий. Архивируйте.",
            )
        db.delete(scenario)
        db.flush()

    # ─── listing / read ───────────────────────────────────────

    @classmethod
    def list_for(
        cls,
        db: Session,
        *,
        actor: User,
        status_filter: str | None = None,
    ) -> list[ScenarioListOut]:
        q = db.query(Scenario)
        role = actor.role.name
        if role == "student":
            # Published + assigned to the student's group (§6.4).
            if actor.group_id is None:
                return []
            q = (
                q.join(ScenarioGroup, ScenarioGroup.scenario_id == Scenario.id)
                .filter(
                    Scenario.status == "published",
                    ScenarioGroup.group_id == actor.group_id,
                )
            )
        elif role == "teacher":
            # Own (any status) or published (any author).
            q = q.filter(
                (Scenario.author_id == actor.id) | (Scenario.status == "published")
            )
        # admin sees everything

        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            q = q.filter(Scenario.status.in_(statuses))

        q = q.order_by(Scenario.updated_at.desc())
        items = q.all()
        return [_to_list_out(s, db) for s in items]

    @classmethod
    def get_for(
        cls, db: Session, *, scenario_id: int, actor: User
    ) -> ScenarioFullOut:
        scenario = _load_scenario_or_404(db, scenario_id)
        role = actor.role.name

        if role == "student":
            if not _student_can_see(db, scenario, actor):
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Сценарий не назначен вашей группе",
                )
            full = _to_full_out(scenario, db)
            return sanitize_scenario_for_student(full)

        if (
            role == "teacher"
            and scenario.author_id != actor.id
            and scenario.status != "published"
        ):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Нет доступа к чужому черновику",
            )
        return _to_full_out(scenario, db)

    # ─── save_graph (§B.3.2) ──────────────────────────────────

    @classmethod
    def save_graph(
        cls,
        db: Session,
        *,
        scenario_id: int,
        graph_in: GraphIn,
        actor: User,
    ) -> ScenarioFullOut:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        if scenario.status == "published":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Сначала снимите сценарий с публикации (unpublish) перед редактированием графа",
            )
        if scenario.status == "archived":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Нельзя редактировать архивный сценарий",
            )

        # Pydantic would already reject obvious issues; here we enforce invariants
        # that span the whole graph (e.g. duplicate ids).
        node_ids = [n.id for n in graph_in.nodes]
        if len(set(node_ids)) != len(node_ids):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Узлы должны иметь уникальные id",
            )
        edge_ids = [e.id for e in graph_in.edges]
        if len(set(edge_ids)) != len(edge_ids):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Рёбра должны иметь уникальные id",
            )

        # SAVEPOINT so an IntegrityError rolls back the full replacement, not the
        # outer session state used by the test fixture. The caller owns commit().
        savepoint = db.begin_nested()
        try:
            for edge in list(scenario.edges):
                db.delete(edge)
            for node in list(scenario.nodes):
                db.delete(node)
            db.flush()

            for node in graph_in.nodes:
                db.add(
                    ScenarioNode(
                        id=node.id,
                        scenario_id=scenario_id,
                        node_type=node.type,
                        title=node.title or node.id,
                        position_x=float(node.position.get("x", 0.0)),
                        position_y=float(node.position.get("y", 0.0)),
                        node_data=node.data or {},
                    )
                )
            for edge in graph_in.edges:
                edge_data = edge.data or {}
                db.add(
                    ScenarioEdge(
                        id=edge.id,
                        scenario_id=scenario_id,
                        source_id=edge.source,
                        target_id=edge.target,
                        label=edge.label,
                        is_correct=bool(edge_data.get("is_correct", True)),
                        score_delta=float(edge_data.get("score_delta", 0.0)),
                        condition=None,  # §B.5 — reserved for V2
                    )
                )

            scenario.version += 1
            scenario.updated_at = datetime.now(tz=UTC)
            db.flush()
            savepoint.commit()
        except IntegrityError as exc:
            savepoint.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Не удалось сохранить граф: нарушение целостности данных",
            ) from exc
        except HTTPException:
            savepoint.rollback()
            raise
        except Exception:
            savepoint.rollback()
            raise

        db.refresh(scenario)
        return _to_full_out(scenario, db)

    # ─── publish / unpublish / archive ───────────────────────

    @classmethod
    def publish(
        cls, db: Session, *, scenario_id: int, actor: User
    ) -> PublishResult:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)

        if scenario.status == "published":  # E-14 — idempotent
            return PublishResult(status="published", errors=[])
        if scenario.status == "archived":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Нельзя опубликовать архивный сценарий",
            )

        graph = GraphIn(
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
                    },
                )
                for e in scenario.edges
            ],
        )
        errors = GraphEngine(graph).validate_graph()
        if errors:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                {"errors": errors, "status": "draft"},
            )

        scenario.status = "published"
        scenario.published_at = datetime.now(tz=UTC)
        scenario.updated_at = scenario.published_at
        db.flush()
        return PublishResult(status="published", errors=[])

    @classmethod
    def unpublish(
        cls, db: Session, *, scenario_id: int, actor: User
    ) -> PublishResult:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        if scenario.status == "draft":  # E-14 — idempotent
            return PublishResult(status="draft", errors=[])
        if scenario.status == "archived":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Архивный сценарий нельзя снять с публикации",
            )
        scenario.status = "draft"
        scenario.published_at = None
        scenario.updated_at = datetime.now(tz=UTC)
        db.flush()
        return PublishResult(status="draft", errors=[])

    @classmethod
    def archive(
        cls, db: Session, *, scenario_id: int, actor: User
    ) -> ScenarioListOut:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        scenario.status = "archived"
        scenario.updated_at = datetime.now(tz=UTC)
        db.flush()
        return _to_list_out(scenario, db)

    # ─── assign to group ─────────────────────────────────────

    @classmethod
    def assign(
        cls,
        db: Session,
        *,
        scenario_id: int,
        payload: ScenarioAssign,
        actor: User,
    ) -> dict[str, str]:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        if scenario.status != "published":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Сценарий не опубликован",
            )
        group = db.get(Group, payload.group_id)
        if group is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Группа с id={payload.group_id} не существует",
            )
        # Teacher can only assign to groups they're linked to.
        if actor.role.name == "teacher":
            linked = (
                db.query(TeacherGroup)
                .filter(
                    TeacherGroup.teacher_id == actor.id,
                    TeacherGroup.group_id == payload.group_id,
                )
                .one_or_none()
            )
            # If the teacher is author we allow assignment even to groups they
            # don't directly supervise — same rule as §6.3 for listing.
            if linked is None and scenario.author_id != actor.id:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Вы не связаны с этой группой",
                )

        existing = (
            db.query(ScenarioGroup)
            .filter(
                ScenarioGroup.scenario_id == scenario_id,
                ScenarioGroup.group_id == payload.group_id,
            )
            .one_or_none()
        )
        if existing is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Сценарий уже назначен этой группе",
            )
        db.add(
            ScenarioGroup(
                scenario_id=scenario_id,
                group_id=payload.group_id,
                deadline=payload.deadline,
            )
        )
        db.flush()
        return {"status": "assigned"}

    # ─── duplicate ───────────────────────────────────────────

    @classmethod
    def duplicate(
        cls, db: Session, *, scenario_id: int, actor: User
    ) -> ScenarioFullOut:
        original = _load_scenario_or_404(db, scenario_id)
        clone = Scenario(
            title=f"{original.title} (копия)",
            description=original.description,
            disease_category=original.disease_category,
            topic_id=original.topic_id,
            cover_path=original.cover_path,
            time_limit_min=original.time_limit_min,
            max_attempts=original.max_attempts,
            passing_score=original.passing_score,
            settings=dict(original.settings or {}),
            author_id=actor.id,
            status="draft",
            version=1,
        )
        db.add(clone)
        db.flush()
        for node in original.nodes:
            db.add(
                ScenarioNode(
                    id=node.id,
                    scenario_id=clone.id,
                    node_type=node.node_type,
                    title=node.title,
                    content=node.content,
                    position_x=node.position_x,
                    position_y=node.position_y,
                    node_data=dict(node.node_data or {}),
                    color_hex=node.color_hex,
                )
            )
        for edge in original.edges:
            db.add(
                ScenarioEdge(
                    id=edge.id,
                    scenario_id=clone.id,
                    source_id=edge.source_id,
                    target_id=edge.target_id,
                    label=edge.label,
                    is_correct=edge.is_correct,
                    score_delta=edge.score_delta,
                    condition=None,
                )
            )
        db.flush()
        db.refresh(clone)
        return _to_full_out(clone, db)

    # ─── preview (§UI.1) ─────────────────────────────────────

    @classmethod
    def start_preview(
        cls, db: Session, *, scenario_id: int, actor: User
    ) -> dict[str, Any]:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        full = _to_full_out(scenario, db)
        graph = GraphIn(nodes=full.nodes, edges=full.edges)
        start = GraphEngine(graph).get_start_node()

        _reap_preview_sessions()
        session_id = uuid.uuid4().hex
        _preview_sessions[session_id] = {
            "scenario_id": scenario_id,
            "current_node_id": start.id,
            "path": [start.id],
            "created_at": datetime.now(tz=UTC),
        }
        return {
            "preview_session_id": session_id,
            "current_node": start.model_dump(),
            "path_so_far": [start.id],
        }

    # ─── node patch (§6.5) ───────────────────────────────────

    @classmethod
    def patch_node(
        cls,
        db: Session,
        *,
        scenario_id: int,
        node_id: str,
        patch: NodePatch,
        actor: User,
    ) -> NodeOut:
        scenario = _load_scenario_or_404(db, scenario_id)
        _ensure_author_or_admin(scenario, actor)
        if scenario.status == "published":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Снимите сценарий с публикации перед изменением узла",
            )
        node = (
            db.query(ScenarioNode)
            .filter(
                ScenarioNode.scenario_id == scenario_id,
                ScenarioNode.id == node_id,
            )
            .one_or_none()
        )
        if node is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Узел не найден")

        if patch.data is not None:
            node.node_data = patch.data
        if patch.title is not None:
            node.title = patch.title
        if patch.content is not None:
            node.content = patch.content
        if patch.color_hex is not None:
            node.color_hex = patch.color_hex
        scenario.updated_at = datetime.now(tz=UTC)
        scenario.version += 1
        db.flush()
        db.refresh(node)
        return NodeOut(
            id=node.id,
            type=node.node_type,  # type: ignore[arg-type]
            position={"x": node.position_x, "y": node.position_y},
            data=node.node_data or {},
            title=node.title,
        )
