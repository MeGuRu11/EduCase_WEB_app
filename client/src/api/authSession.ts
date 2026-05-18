import axios from 'axios';
import type { LoginRequest, RefreshRequest, TokenResponse } from '@/types/auth';

const authSessionClient = axios.create({ baseURL: '/api' });

export const authSessionApi = {
  login(payload: LoginRequest) {
    return authSessionClient.post<TokenResponse>('/auth/login', payload);
  },

  refresh(payload: RefreshRequest) {
    return authSessionClient.post<TokenResponse>('/auth/refresh', payload);
  },
};
