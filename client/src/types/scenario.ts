export type JsonObject = Record<string, unknown>;
export type NodeType = 'start' | 'data' | 'decision' | 'form' | 'text_input' | 'final';
export type ScenarioStatus = 'draft' | 'published' | 'archived';

export interface ScenarioCreate {
  title: string;
  description?: string | null;
  disease_category?: string | null;
  topic_id?: number | null;
  time_limit_min?: number | null;
  max_attempts?: number | null;
  passing_score?: number;
}

export interface ScenarioUpdate {
  title?: string | null;
  description?: string | null;
  disease_category?: string | null;
  topic_id?: number | null;
  time_limit_min?: number | null;
  max_attempts?: number | null;
  passing_score?: number | null;
  cover_path?: string | null;
}

export interface ScenarioListOut {
  id: number;
  title: string;
  description: string | null;
  disease_category: string | null;
  cover_url: string | null;
  status: ScenarioStatus;
  author_id: number | null;
  author_name: string | null;
  time_limit_min: number | null;
  max_attempts: number | null;
  passing_score: number;
  version: number;
  node_count: number;
  assigned_groups: number[];
  my_attempts_count: number;
  created_at: string;
  updated_at: string;
}

export interface NodeOut {
  id: string;
  type: NodeType;
  position: { x?: number; y?: number } & JsonObject;
  data: JsonObject;
  title: string;
}

export interface EdgeOut {
  id: string;
  source: string;
  target: string;
  label: string | null;
  data: JsonObject;
}

export interface ScenarioFullOut extends ScenarioListOut {
  nodes: NodeOut[];
  edges: EdgeOut[];
  published_at: string | null;
}

export interface GraphIn {
  nodes: NodeOut[];
  edges: EdgeOut[];
}

export interface ScenarioAssign {
  group_id: number;
  deadline?: string | null;
}

export interface PublishResult {
  status: ScenarioStatus;
  errors: string[];
}
