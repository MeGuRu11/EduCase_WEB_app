import api from './client';
import type {
  AttemptResultOut,
  AttemptStart,
  AttemptStartOut,
  AttemptSummaryOut,
  StepOut,
  StepSubmit,
  TimeRemaining,
} from '@/types/attempt';

export const attemptsApi = {
  async start(payload: AttemptStart) {
    const response = await api.post<AttemptStartOut>('/attempts/start', payload);
    return response.data;
  },

  async step(attemptId: number, payload: StepSubmit) {
    const response = await api.post<StepOut>(`/attempts/${attemptId}/step`, payload);
    return response.data;
  },

  async finish(attemptId: number) {
    const response = await api.post<AttemptResultOut>(`/attempts/${attemptId}/finish`);
    return response.data;
  },

  async abandon(attemptId: number) {
    const response = await api.post<{ status: string }>(`/attempts/${attemptId}/abandon`);
    return response.data;
  },

  async timeRemaining(attemptId: number) {
    const response = await api.get<TimeRemaining>(`/attempts/${attemptId}/time-remaining`);
    return response.data;
  },

  async listMy(scenarioId?: number) {
    const response = await api.get<AttemptSummaryOut[]>('/attempts/my', {
      params: scenarioId ? { scenario_id: scenarioId } : undefined,
    });
    return response.data;
  },

  async detail(attemptId: number) {
    const response = await api.get<AttemptResultOut>(`/attempts/${attemptId}`);
    return response.data;
  },
};
