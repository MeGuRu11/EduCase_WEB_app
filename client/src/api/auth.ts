import api from './client';
import { authSessionApi } from './authSession';
import type { LogoutResponse } from '@/types/auth';
import type { UserOut } from '@/types/user';

export const authApi = {
  login: authSessionApi.login,
  refresh: authSessionApi.refresh,

  logout() {
    return api.post<LogoutResponse>('/auth/logout');
  },

  me() {
    return api.get<UserOut>('/auth/me');
  },
};
