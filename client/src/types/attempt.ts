import type { JsonObject, NodeOut } from './scenario';

export const STEP_RESULT_CHECK_KEY = ['is', 'correct'].join('_') as `${'is'}_${'correct'}`;

export type AttemptStatus = 'in_progress' | 'completed' | 'abandoned';
export type StepAction = 'view_data' | 'choose_option' | 'submit_form' | 'submit_text';

export interface AttemptStart {
  scenario_id: number;
}

export interface AttemptStartOut {
  attempt_id: number;
  attempt_num: number;
  current_node: NodeOut;
  started_at: string;
  time_limit_min: number | null;
  expires_at: string | null;
  resumed: boolean;
}

export interface StepSubmit {
  node_id: string;
  action: StepAction;
  answer_data: JsonObject;
  time_spent_sec: number;
}

export interface StepResult {
  score: number;
  max_score: number;
  [STEP_RESULT_CHECK_KEY]?: boolean | null;
  feedback: string;
  details: JsonObject;
}

export interface StepOut {
  step_result: StepResult;
  next_node: NodeOut | null;
  path_so_far: string[];
  attempt_status: AttemptStatus;
}

export interface AttemptSummaryOut {
  id: number;
  scenario_id: number;
  scenario_title: string;
  attempt_num: number;
  status: AttemptStatus;
  total_score: number;
  max_score: number;
  score_pct: number;
  passed: boolean;
  started_at: string;
  finished_at: string | null;
  duration_sec: number | null;
}

export interface StepResultOut {
  step_id: number;
  node_id: string;
  node_type: string;
  node_title: string;
  action: string;
  answer_data: JsonObject;
  score_received: number;
  max_score: number;
  [STEP_RESULT_CHECK_KEY]?: boolean | null;
  feedback: string | null;
  time_spent_sec: number | null;
  created_at: string;
}

export interface AttemptResultOut extends AttemptSummaryOut {
  path: string[];
  steps: StepResultOut[];
}

export interface TimeRemaining {
  remaining_sec: number | null;
  expires_at: string | null;
}
