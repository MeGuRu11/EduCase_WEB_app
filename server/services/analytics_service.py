"""Analytics — student dashboard, teacher scenario stats, path heatmap, admin stats.

Aggregations are written as pure SQL ``GROUP BY`` queries — no per-row N+1.
``selectinload`` is used only when we need ORM rows alongside the aggregate
counts (e.g. recent attempts on the student dashboard).

Spec:
* PROJECT_DESIGN §6.6
* ADDENDUM §R.6 (response shapes)
"""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session, selectinload

from models.attempt import Attempt, AttemptStep
from models.scenario import Scenario
from models.user import Role, RoleName, User
from schemas.analytics import (
    AdminStatsOut,
    HeatmapEdge,
    HeatmapNode,
    PathAnalysisOut,
    PathHeatmapOut,
    ScoreDistributionOut,
    StudentDashboardOut,
    StudentRankingEntry,
    TeacherScenarioStatsOut,
)
from schemas.attempt import AttemptSummaryOut

_DIST_BINS: list[int] = [0, 20, 40, 60, 80, 100]


def _human_age(delta: timedelta) -> str:
    sec = int(delta.total_seconds())
    if sec < 60:
        return f"{sec} с назад"
    if sec < 3600:
        return f"{sec // 60} мин назад"
    if sec < 86400:
        return f"{sec // 3600} ч назад"
    return f"{sec // 86400} дн назад"


def _to_summary(attempt: Attempt, scenario: Scenario) -> AttemptSummaryOut:
    pct = (
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
        score_pct=pct,
        passed=pct >= scenario.passing_score,
        started_at=attempt.started_at,
        finished_at=attempt.finished_at,
        duration_sec=attempt.duration_sec,
    )


class AnalyticsService:
    # ─── Student dashboard ──────────────────────────────────────────────

    @classmethod
    def student_dashboard(cls, db: Session, *, student: User) -> StudentDashboardOut:
        agg = (
            db.query(
                func.count(Attempt.id).label("total"),
                func.sum(case((Attempt.status == "completed", 1), else_=0)).label("completed"),
                func.sum(case((Attempt.status == "in_progress", 1), else_=0)).label("in_progress"),
                func.coalesce(
                    func.avg(
                        case(
                            (
                                Attempt.max_score > 0,
                                Attempt.total_score / Attempt.max_score * 100.0,
                            ),
                            else_=None,
                        )
                    ),
                    0.0,
                ).label("avg_score"),
                func.coalesce(
                    func.max(
                        case(
                            (
                                Attempt.max_score > 0,
                                Attempt.total_score / Attempt.max_score * 100.0,
                            ),
                            else_=None,
                        )
                    ),
                    0.0,
                ).label("best_score"),
                func.coalesce(func.sum(Attempt.duration_sec), 0).label("total_duration_sec"),
            )
            .filter(Attempt.user_id == student.id)
            .one()
        )

        recent_q = (
            db.query(Attempt)
            .options(selectinload(Attempt.scenario))
            .filter(Attempt.user_id == student.id)
            .order_by(Attempt.started_at.desc())
            .limit(5)
        )
        recent_attempts = [
            _to_summary(a, a.scenario)
            for a in recent_q.all()
            if a.scenario is not None
        ]

        return StudentDashboardOut(
            total_scenarios=int(agg.total or 0),
            completed_scenarios=int(agg.completed or 0),
            in_progress_scenarios=int(agg.in_progress or 0),
            avg_score=round(float(agg.avg_score or 0.0), 2),
            best_score=round(float(agg.best_score or 0.0), 2),
            total_time_hours=round(float(agg.total_duration_sec or 0) / 3600.0, 2),
            recent_attempts=recent_attempts,
        )

    # ─── Teacher scenario stats ─────────────────────────────────────────

    @classmethod
    def teacher_scenario_stats(
        cls, db: Session, *, teacher: User, scenario_id: int | None = None,
    ) -> list[TeacherScenarioStatsOut]:
        scenario_q = db.query(Scenario).filter(Scenario.author_id == teacher.id)
        if scenario_id is not None:
            scenario_q = scenario_q.filter(Scenario.id == scenario_id)
        scenarios = scenario_q.all()

        if not scenarios:
            return []

        ids = [s.id for s in scenarios]
        rows = (
            db.query(
                Attempt.scenario_id,
                func.count(func.distinct(Attempt.user_id)).label("students"),
                func.sum(case((Attempt.status == "completed", 1), else_=0)).label("completed"),
                func.sum(case((Attempt.status == "in_progress", 1), else_=0)).label("in_progress"),
                func.coalesce(
                    func.avg(
                        case(
                            (
                                Attempt.max_score > 0,
                                Attempt.total_score / Attempt.max_score * 100.0,
                            ),
                            else_=None,
                        )
                    ),
                    0.0,
                ).label("avg_score"),
            )
            .filter(Attempt.scenario_id.in_(ids))
            .group_by(Attempt.scenario_id)
            .all()
        )
        agg_by_scenario = {r.scenario_id: r for r in rows}

        dist_rows = (
            db.query(
                Attempt.scenario_id,
                case(
                    (Attempt.max_score == 0, 0),
                    else_=(Attempt.total_score / Attempt.max_score * 100.0),
                ).label("pct"),
            )
            .filter(
                Attempt.scenario_id.in_(ids),
                Attempt.status == "completed",
            )
            .all()
        )
        dist_by_scenario: dict[int, list[float]] = {}
        for r in dist_rows:
            dist_by_scenario.setdefault(r.scenario_id, []).append(float(r.pct))

        rank_rows = (
            db.query(
                Attempt.scenario_id,
                Attempt.user_id,
                User.full_name,
                Attempt.total_score,
                Attempt.max_score,
                Attempt.duration_sec,
            )
            .join(User, User.id == Attempt.user_id)
            .filter(
                Attempt.scenario_id.in_(ids),
                Attempt.status == "completed",
            )
            .order_by(Attempt.scenario_id, Attempt.total_score.desc())
            .all()
        )
        rank_by_scenario: dict[int, list[StudentRankingEntry]] = {}
        for r in rank_rows:
            rank_by_scenario.setdefault(r.scenario_id, []).append(
                StudentRankingEntry(
                    user_id=r.user_id,
                    full_name=r.full_name,
                    score=round(
                        (r.total_score / r.max_score * 100.0)
                        if r.max_score > 0 else 0.0,
                        2,
                    ),
                    duration_sec=int(r.duration_sec or 0),
                    path=[],
                )
            )

        results: list[TeacherScenarioStatsOut] = []
        for scenario in scenarios:
            agg = agg_by_scenario.get(scenario.id)
            samples = dist_by_scenario.get(scenario.id, [])
            counts = [0] * (len(_DIST_BINS) - 1)
            for v in samples:
                for i in range(len(_DIST_BINS) - 1):
                    lo, hi = _DIST_BINS[i], _DIST_BINS[i + 1]
                    upper_inclusive = i == len(_DIST_BINS) - 2
                    if lo <= v < hi or (upper_inclusive and v <= hi):
                        counts[i] += 1
                        break

            results.append(
                TeacherScenarioStatsOut(
                    scenario_id=scenario.id,
                    scenario_title=scenario.title,
                    group_id=None,
                    group_name=None,
                    total_students=int(agg.students if agg else 0),
                    completed=int(agg.completed if agg else 0),
                    in_progress=int(agg.in_progress if agg else 0),
                    avg_score=round(float(agg.avg_score) if agg else 0.0, 2),
                    score_distribution=ScoreDistributionOut(
                        bins=_DIST_BINS,
                        counts=counts,
                    ),
                    path_analysis=PathAnalysisOut(
                        correct_path_count=0,
                        incorrect_path_count=0,
                        most_common_wrong_node=None,
                    ),
                    weak_nodes=[],
                    student_ranking=rank_by_scenario.get(scenario.id, [])[:5],
                )
            )
        return results

    # ─── Path heatmap ──────────────────────────────────────────────────

    @classmethod
    def path_heatmap(cls, db: Session, *, scenario_id: int) -> PathHeatmapOut:
        scenario = db.get(Scenario, scenario_id)
        if scenario is None:
            return PathHeatmapOut(
                scenario_id=scenario_id, total_attempts=0, nodes=[], edges=[],
            )

        node_rows = (
            db.query(
                AttemptStep.node_id,
                func.count(AttemptStep.id).label("visits"),
                func.coalesce(
                    func.avg(
                        case(
                            (
                                AttemptStep.max_score > 0,
                                AttemptStep.score_received
                                / AttemptStep.max_score
                                * 100.0,
                            ),
                            else_=None,
                        )
                    ),
                    None,
                ).label("avg_pct"),
            )
            .join(Attempt, Attempt.id == AttemptStep.attempt_id)
            .filter(Attempt.scenario_id == scenario_id)
            .group_by(AttemptStep.node_id)
            .all()
        )
        visits_by_node = {r.node_id: r for r in node_rows}

        nodes_out: list[HeatmapNode] = []
        for n in scenario.nodes:
            v = visits_by_node.get(n.id)
            nodes_out.append(
                HeatmapNode(
                    id=n.id,
                    title=n.title,
                    node_type=n.node_type,
                    visit_count=int(v.visits) if v else 0,
                    avg_score_pct=(
                        round(float(v.avg_pct), 2)
                        if v is not None and v.avg_pct is not None
                        else None
                    ),
                )
            )

        edge_rows = (
            db.query(
                AttemptStep.edge_id,
                func.count(AttemptStep.id).label("traversed"),
            )
            .join(Attempt, Attempt.id == AttemptStep.attempt_id)
            .filter(
                Attempt.scenario_id == scenario_id,
                AttemptStep.edge_id.isnot(None),
            )
            .group_by(AttemptStep.edge_id)
            .all()
        )
        edge_count_by_id = {r.edge_id: int(r.traversed) for r in edge_rows}

        edges_out: list[HeatmapEdge] = []
        for e in scenario.edges:
            edges_out.append(
                HeatmapEdge(
                    source=e.source_id,
                    target=e.target_id,
                    traverse_count=edge_count_by_id.get(e.id, 0),
                    is_correct=bool(e.is_correct),
                )
            )

        total = (
            db.query(func.count(Attempt.id))
            .filter(Attempt.scenario_id == scenario_id)
            .scalar()
            or 0
        )

        return PathHeatmapOut(
            scenario_id=scenario_id,
            group_id=None,
            total_attempts=int(total),
            nodes=nodes_out,
            edges=edges_out,
        )

    # ─── Admin stats ────────────────────────────────────────────────────

    @classmethod
    def admin_stats(cls, db: Session) -> AdminStatsOut:
        users_total, students, teachers, admins = (
            db.query(
                func.count(User.id),
                func.sum(case((Role.name == RoleName.STUDENT, 1), else_=0)),
                func.sum(case((Role.name == RoleName.TEACHER, 1), else_=0)),
                func.sum(case((Role.name == RoleName.ADMIN, 1), else_=0)),
            )
            .join(Role, Role.id == User.role_id)
            .one()
        )
        scenarios_total, published_scenarios = (
            db.query(
                func.count(Scenario.id),
                func.sum(case((Scenario.status == "published", 1), else_=0)),
            ).one()
        )
        today = datetime.now(tz=UTC).date()
        attempts_today = (
            db.query(func.count(Attempt.id))
            .filter(func.date(Attempt.started_at) == today)
            .scalar()
            or 0
        )
        attempts_total = db.query(func.count(Attempt.id)).scalar() or 0

        db_size_bytes = db.execute(
            sa_text("SELECT pg_database_size(current_database())")
        ).scalar()
        db_size_mb = round(float(db_size_bytes or 0) / (1024 * 1024), 2)

        from services.admin_service import AdminService

        last_backup_at = AdminService.last_backup_at()
        age_human = (
            _human_age(datetime.now(tz=UTC) - last_backup_at)
            if last_backup_at else None
        )

        return AdminStatsOut(
            users_total=int(users_total or 0),
            students=int(students or 0),
            teachers=int(teachers or 0),
            admins=int(admins or 0),
            scenarios_total=int(scenarios_total or 0),
            published_scenarios=int(published_scenarios or 0),
            attempts_today=int(attempts_today),
            attempts_total=int(attempts_total),
            db_size_mb=db_size_mb,
            last_backup_at=last_backup_at,
            last_backup_age_human=age_human,
        )

    # ─── Export (xlsx / pdf) ────────────────────────────────────────────

    @classmethod
    def export_xlsx(cls, db: Session, *, teacher: User) -> bytes:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Сводка"
        ws.append(["scenario_title", "students", "completed", "avg_score"])
        for stats in cls.teacher_scenario_stats(db, teacher=teacher):
            ws.append(
                [
                    stats.scenario_title,
                    stats.total_students,
                    stats.completed,
                    stats.avg_score,
                ]
            )
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    @classmethod
    def export_pdf(cls, db: Session, *, teacher: User) -> bytes:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, 800, "EpiCase — Teacher analytics export")
        c.setFont("Helvetica", 10)
        y = 770
        for stats in cls.teacher_scenario_stats(db, teacher=teacher):
            line = (
                f"{stats.scenario_title}: students={stats.total_students}, "
                f"completed={stats.completed}, avg={stats.avg_score:.1f}%"
            )
            c.drawString(40, y, line)
            y -= 16
            if y < 60:
                c.showPage()
                y = 800
        c.save()
        return buf.getvalue()
