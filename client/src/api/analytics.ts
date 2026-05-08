import api from './client';
import type { PathHeatmapOut, StudentDashboardOut, TeacherScenarioStatsOut } from '@/types/analytics';

export type AnalyticsExportFormat = 'xlsx' | 'pdf';

export interface TeacherScenarioStatsParams {
  scenarioId?: number | null;
}

export interface PathHeatmapParams {
  scenarioId: number;
  groupId?: number | null;
}

export const analyticsApi = {
  async studentDashboard() {
    const response = await api.get<StudentDashboardOut>('/analytics/student/dashboard');
    return response.data;
  },

  async teacherScenarios(params: TeacherScenarioStatsParams = {}) {
    const response = await api.get<TeacherScenarioStatsOut[]>('/analytics/teacher/scenarios', {
      params: params.scenarioId ? { scenario_id: params.scenarioId } : undefined,
    });
    return response.data;
  },

  async pathHeatmap({ groupId, scenarioId }: PathHeatmapParams) {
    const response = await api.get<PathHeatmapOut>(`/analytics/teacher/heatmap/${scenarioId}`, {
      params: groupId ? { group_id: groupId } : undefined,
    });
    return response.data;
  },

  async exportAnalytics(format: AnalyticsExportFormat) {
    const response = await api.get<Blob>('/analytics/export', {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },
};