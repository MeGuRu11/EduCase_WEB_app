import api from './client';
import type { PaginatedResponse, PaginationParams } from '@/types/common';
import type {
  ChangePasswordRequest,
  ResetPasswordRequest,
  UserBulkResult,
  UserCreate,
  UserOut,
  UserStatusUpdate,
  UserUpdate,
} from '@/types/user';

export interface UserListParams extends PaginationParams {
  role?: string | null;
  status?: 'active' | 'locked' | 'all' | null;
  group_id?: number | 'all' | null;
}

function normalizeListParams(params: UserListParams) {
  return {
    role: params.role && params.role !== 'all' ? params.role : undefined,
    search: params.search || undefined,
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };
}

export const usersApi = {
  async list(params: UserListParams = {}) {
    const response = await api.get<PaginatedResponse<UserOut>>('/users/', { params: normalizeListParams(params) });
    return response.data;
  },

  async create(payload: UserCreate) {
    const response = await api.post<UserOut>('/users/', payload);
    return response.data;
  },

  async update(userId: number, payload: UserUpdate) {
    const response = await api.patch<UserOut>(`/users/${userId}`, payload);
    return response.data;
  },

  async setStatus(userId: number, payload: UserStatusUpdate) {
    const response = await api.put<UserOut>(`/users/${userId}/status`, payload);
    return response.data;
  },

  async resetPassword(userId: number, payload: ResetPasswordRequest) {
    const response = await api.post<{ status: string }>(`/users/${userId}/reset-password`, payload);
    return response.data;
  },

  async changePassword(payload: ChangePasswordRequest) {
    const response = await api.post<{ status: string }>('/users/me/change-password', payload);
    return response.data;
  },

  async bulkCsv(file: File) {
    const data = new FormData();
    data.append('file', file);
    // 'fetch' adapter avoids XHR multipart issues under jsdom + MSW v2.
    // baseURL is resolved to an absolute URL because fetch requires it.
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const response = await api.post<UserBulkResult>(`${origin}/api/users/bulk-csv`, data, { adapter: 'fetch' });
    return response.data;
  },
};