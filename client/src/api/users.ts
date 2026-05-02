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
}

export const usersApi = {
  list(params: UserListParams = {}) {
    return api.get<PaginatedResponse<UserOut>>('/users/', { params });
  },

  create(payload: UserCreate) {
    return api.post<UserOut>('/users/', payload);
  },

  update(userId: number, payload: UserUpdate) {
    return api.patch<UserOut>(`/users/${userId}`, payload);
  },

  setStatus(userId: number, payload: UserStatusUpdate) {
    return api.put<UserOut>(`/users/${userId}/status`, payload);
  },

  resetPassword(userId: number, payload: ResetPasswordRequest) {
    return api.post<{ status: string }>(`/users/${userId}/reset-password`, payload);
  },

  changePassword(payload: ChangePasswordRequest) {
    return api.post<{ status: string }>('/users/me/change-password', payload);
  },

  bulkCsv(file: File) {
    const data = new FormData();
    data.append('file', file);
    return api.post<UserBulkResult>('/users/bulk-csv', data);
  },
};
