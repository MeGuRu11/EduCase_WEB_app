import type { AttemptSummaryOut } from './attempt';

export interface StudentDashboardOut {
  total_scenarios: number;
  completed_scenarios: number;
  in_progress_scenarios: number;
  avg_score: number;
  best_score: number;
  total_time_hours: number;
  recent_attempts: AttemptSummaryOut[];
}

export interface ScoreDistributionOut {
  bins: number[];
  counts: number[];
}

export interface WeakNodeOut {
  node_id: string;
  title: string;
  node_type: string;
  visit_count: number;
  avg_score_pct: number;
  most_common_wrong_answer: string | null;
}

export interface PathAnalysisOut {
  correct_path_count: number;
  incorrect_path_count: number;
  most_common_wrong_node: WeakNodeOut | null;
}

export interface StudentRankingEntry {
  user_id: number;
  full_name: string;
  score: number;
  duration_sec: number;
  path: string[];
}

export interface TeacherScenarioStatsOut {
  scenario_id: number;
  scenario_title: string;
  group_id: number | null;
  group_name: string | null;
  total_students: number;
  completed: number;
  in_progress: number;
  avg_score: number;
  score_distribution: ScoreDistributionOut;
  path_analysis: PathAnalysisOut;
  weak_nodes: WeakNodeOut[];
  student_ranking: StudentRankingEntry[];
}

export interface ActivityDayOut {
  date: string;
  count: number;
}

export interface TeacherActivityOut {
  days: ActivityDayOut[];
  total: number;
}

export interface HeatmapNode {
  id: string;
  title: string;
  node_type: string;
  visit_count: number;
  avg_score_pct: number | null;
}

export interface HeatmapEdge {
  source: string;
  target: string;
  traverse_count: number;
}

export interface PathHeatmapOut {
  scenario_id: number;
  group_id: number | null;
  total_attempts: number;
  nodes: HeatmapNode[];
  edges: HeatmapEdge[];
}

export interface AdminStatsOut {
  users_total: number;
  students: number;
  teachers: number;
  admins: number;
  scenarios_total: number;
  published_scenarios: number;
  attempts_today: number;
  attempts_total: number;
  db_size_mb: number;
  last_backup_at: string | null;
  last_backup_age_human: string | null;
}
