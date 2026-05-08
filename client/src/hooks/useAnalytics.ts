import { useMutation, useQuery } from '@tanstack/react-query';
import { analyticsApi, type AnalyticsExportFormat } from '@/api/analytics';

export const analyticsKeys = {
  all: ['analytics'] as const,
  studentDashboard: () => [...analyticsKeys.all, 'student', 'dashboard'] as const,
  teacherScenarios: (scenarioId?: number | null) => [...analyticsKeys.all, 'teacher', 'scenarios', scenarioId ?? 'all'] as const,
  heatmap: (scenarioId?: number | null, groupId?: number | null) =>
    [...analyticsKeys.all, 'teacher', 'heatmap', scenarioId ?? 'missing', groupId ?? 'all'] as const,
};

export function useStudentDashboard() {
  return useQuery({
    queryKey: analyticsKeys.studentDashboard(),
    queryFn: () => analyticsApi.studentDashboard(),
  });
}

export function useTeacherScenarioStats(scenarioId?: number | null) {
  return useQuery({
    queryKey: analyticsKeys.teacherScenarios(scenarioId),
    queryFn: () => analyticsApi.teacherScenarios({ scenarioId }),
  });
}

export function usePathHeatmap(scenarioId?: number | null, groupId?: number | null) {
  return useQuery({
    enabled: scenarioId != null,
    queryKey: analyticsKeys.heatmap(scenarioId, groupId),
    queryFn: () => analyticsApi.pathHeatmap({ scenarioId: scenarioId as number, groupId }),
  });
}

export function useExportAnalytics() {
  return useMutation({
    mutationFn: (format: AnalyticsExportFormat) => analyticsApi.exportAnalytics(format),
  });
}