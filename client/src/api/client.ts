import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { TokenResponse } from '@/types/auth';

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _skipAuthRefresh?: boolean;
}

const api = axios.create({ baseURL: '/api' });

let refreshPromise: Promise<string | null> | null = null;

function redirect(path: string) {
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', path);
  }
}

function resultPathFromUrl(url?: string) {
  const match = url?.match(/\/attempts\/(\d+)\//);
  return match ? `/student/attempts/${match[1]}/result` : null;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryConfig | undefined;

    if (status === 410) {
      const resultPath = resultPathFromUrl(original?.url);
      if (resultPath) redirect(resultPath);
      return Promise.reject(error);
    }

    if (status !== 401 || !original || original._retry || original._skipAuthRefresh) {
      return Promise.reject(error);
    }

    original._retry = true;
    const { refreshToken, logout, setAccessToken } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      redirect('/login?reason=session_expired');
      return Promise.reject(error);
    }

    try {
      refreshPromise ??= api
        .post<TokenResponse>(
          '/auth/refresh',
          { refresh_token: refreshToken },
          { _skipAuthRefresh: true } as RetryConfig,
        )
        .then((response) => response.data.access_token)
        .finally(() => {
          refreshPromise = null;
        });

      const freshToken = await refreshPromise;
      if (!freshToken) throw error;

      setAccessToken(freshToken);
      original.headers.Authorization = `Bearer ${freshToken}`;
      return api(original);
    } catch (refreshError) {
      logout();
      redirect('/login?reason=session_expired');
      return Promise.reject(refreshError);
    }
  },
);

export default api;
