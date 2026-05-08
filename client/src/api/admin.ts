import api from './client';
import type {
  AdminStatsOut,
  BackupCreateResult,
  BackupInfo,
  HealthCheckOut,
  LogLevel,
  SysInfoOut,
  SystemLogsOut,
  SystemSettingsOut,
  SystemSettingUpdate,
} from '@/types/admin';

export interface SystemLogParams {
  level?: LogLevel | 'all' | null;
  page?: number;
  per_page?: number;
}

function logParams(params: SystemLogParams = {}) {
  return {
    level: params.level && params.level !== 'all' ? params.level : undefined,
    page: params.page ?? 1,
    per_page: params.per_page ?? 50,
  };
}

export const adminApi = {
  async stats() {
    const response = await api.get<AdminStatsOut>('/analytics/admin/stats');
    return response.data;
  },

  async health() {
    const response = await api.get<HealthCheckOut>('/admin/health');
    return response.data;
  },

  async sysinfo() {
    const response = await api.get<SysInfoOut>('/admin/sysinfo');
    return response.data;
  },

  async settings() {
    const response = await api.get<SystemSettingsOut>('/admin/settings');
    return response.data;
  },

  async updateSettings(payload: SystemSettingUpdate) {
    const response = await api.put<SystemSettingsOut>('/admin/settings', payload);
    return response.data;
  },

  async logs(params: SystemLogParams = {}) {
    const response = await api.get<SystemLogsOut>('/admin/logs', { params: logParams(params) });
    return response.data;
  },

  async backups() {
    const response = await api.get<BackupInfo[]>('/admin/backup');
    return response.data;
  },

  async createBackup() {
    const response = await api.post<BackupCreateResult>('/admin/backup');
    return response.data;
  },

  async deleteBackup(filename: string) {
    await api.delete(`/admin/backup/${encodeURIComponent(filename)}`);
  },

  async restoreBackup(filename: string) {
    const response = await api.post<{ status: string }>(`/admin/restore/${encodeURIComponent(filename)}`);
    return response.data;
  },
};