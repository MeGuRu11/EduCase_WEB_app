"""Analytics schemas — ADDENDUM §R.6."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from schemas.attempt import AttemptSummaryOut


class StudentDashboardOut(BaseModel):
    total_scenarios: int
    completed_scenarios: int
    in_progress_scenarios: int
    avg_score: float
    best_score: float
    total_time_hours: float
    recent_attempts: list[AttemptSummaryOut] = Field(default_factory=list)


class ScoreDistributionOut(BaseModel):
    bins: list[int]
    counts: list[int]


class WeakNodeOut(BaseModel):
    node_id: str
    title: str
    node_type: str
    visit_count: int
    avg_score_pct: float
    most_common_wrong_answer: str | None = None


class PathAnalysisOut(BaseModel):
    correct_path_count: int
    incorrect_path_count: int
    most_common_wrong_node: WeakNodeOut | None = None


class StudentRankingEntry(BaseModel):
    user_id: int
    full_name: str
    score: float
    duration_sec: int
    path: list[str] = Field(default_factory=list)


class TeacherScenarioStatsOut(BaseModel):
    scenario_id: int
    scenario_title: str
    group_id: int | None = None
    group_name: str | None = None
    total_students: int
    completed: int
    in_progress: int
    avg_score: float
    score_distribution: ScoreDistributionOut
    path_analysis: PathAnalysisOut
    weak_nodes: list[WeakNodeOut] = Field(default_factory=list)
    student_ranking: list[StudentRankingEntry] = Field(default_factory=list)


class HeatmapNode(BaseModel):
    id: str
    title: str
    node_type: str
    visit_count: int
    avg_score_pct: float | None = None


class HeatmapEdge(BaseModel):
    source: str
    target: str
    traverse_count: int
    is_correct: bool


class PathHeatmapOut(BaseModel):
    scenario_id: int
    group_id: int | None = None
    total_attempts: int
    nodes: list[HeatmapNode] = Field(default_factory=list)
    edges: list[HeatmapEdge] = Field(default_factory=list)


class AdminStatsOut(BaseModel):
    users_total: int
    students: int
    teachers: int
    admins: int
    scenarios_total: int
    published_scenarios: int
    attempts_today: int
    attempts_total: int
    db_size_mb: float
    last_backup_at: datetime | None = None
    last_backup_age_human: str | None = None
