import type { PaginatedResponse } from './common';

export type HealthStatus = 'ok' | 'warning' | 'error';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

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

export interface HealthCheckDetail {
  status: HealthStatus;
  message?: string | null;
  latency_ms?: number;
  free_gb?: number;
  last_backup_age_hours?: number | null;
  running?: boolean;
  count?: number;
}

export interface HealthCheckOut {
  status: HealthStatus;
  checks: Record<string, HealthCheckDetail>;
  version: string;
  checked_at: string;
}

export interface SystemLogOut {
  id: number;
  level: LogLevel;
  message: string;
  user_id: number | null;
  username: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export type SystemLogsOut = PaginatedResponse<SystemLogOut>;

export interface BackupInfo {
  filename: string;
  size_mb: number;
  created_at: string;
  age_human: string;
}

export interface BackupCreateResult {
  filename: string;
  size_mb: number;
  duration_sec: number;
}

export interface SysInfoOut {
  db_size_mb: number;
  last_backup_at: string | null;
  last_backup_age_human: string | null;
  version: string;
  python_version: string;
  uptime_hours: number;
  maintenance_mode: boolean;
}

export interface SystemSettingsOut {
  institution_name: string | null;
  idle_timeout_min: number | null;
  max_file_upload_mb: number | null;
  backup_retention_days: number | null;
  maintenance_mode: boolean;
}

export interface SystemSettingUpdate {
  institution_name?: string | null;
  idle_timeout_min?: number | null;
  max_file_upload_mb?: number | null;
  backup_retention_days?: number | null;
}