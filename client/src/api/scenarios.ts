import api from './client';
import type {
  GraphIn,
  PublishResult,
  ScenarioAssign,
  ScenarioCreate,
  ScenarioFullOut,
  ScenarioListOut,
  ScenarioStatus,
  ScenarioUpdate,
} from '@/types/scenario';

export interface ScenarioListParams {
  status?: ScenarioStatus | 'all';
}

export const scenariosApi = {
  async list(params: ScenarioListParams = {}) {
    const response = await api.get<ScenarioListOut[]>('/scenarios/', {
      params: params.status && params.status !== 'all' ? { status_filter: params.status } : undefined,
    });
    return response.data;
  },

  async get(id: number) {
    const response = await api.get<ScenarioFullOut>(`/scenarios/${id}`);
    return response.data;
  },

  async create(payload: ScenarioCreate) {
    const response = await api.post<ScenarioFullOut>('/scenarios/', payload);
    return response.data;
  },

  async update(id: number, payload: ScenarioUpdate) {
    const response = await api.patch<ScenarioFullOut>(`/scenarios/${id}`, payload);
    return response.data;
  },

  async saveGraph(id: number, graph: GraphIn) {
    const response = await api.put<ScenarioFullOut>(`/scenarios/${id}/graph`, graph);
    return response.data;
  },

  async publish(id: number) {
    const response = await api.post<PublishResult>(`/scenarios/${id}/publish`);
    return response.data;
  },

  async unpublish(id: number) {
    const response = await api.post<PublishResult>(`/scenarios/${id}/unpublish`);
    return response.data;
  },

  async assign(id: number, payload: ScenarioAssign) {
    const response = await api.post<{ status: string }>(`/scenarios/${id}/assign`, payload);
    return response.data;
  },

  async duplicate(id: number) {
    const response = await api.post<ScenarioFullOut>(`/scenarios/${id}/duplicate`);
    return response.data;
  },

  async archive(id: number) {
    const response = await api.post<ScenarioListOut>(`/scenarios/${id}/archive`);
    return response.data;
  },

  async delete(id: number) {
    await api.delete(`/scenarios/${id}`);
  },

  async preview(id: number) {
    const response = await api.post<Record<string, unknown>>(`/scenarios/${id}/preview`);
    return response.data;
  },
};
