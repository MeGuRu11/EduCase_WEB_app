import api from './client';
import type { LoginRequest, LogoutResponse, RefreshRequest, TokenResponse } from '@/types/auth';
import type { UserOut } from '@/types/user';

export const authApi = {
  login(payload: LoginRequest) {
    return api.post<TokenResponse>('/auth/login', payload);
  },

  refresh(payload: RefreshRequest) {
    return api.post<TokenResponse>('/auth/refresh', payload);
  },

  logout() {
    return api.post<LogoutResponse>('/auth/logout');
  },

  me() {
    return api.get<UserOut>('/auth/me');
  },
};
