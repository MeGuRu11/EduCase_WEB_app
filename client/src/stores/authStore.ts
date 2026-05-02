import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { authApi } from '@/api/auth';
import type { LoginRequest } from '@/types/auth';
import type { UserOut } from '@/types/user';

const STORAGE_KEY = 'epicase.auth';

interface StoredAuth {
  user: UserOut | null;
  accessToken: string | null;
  refreshToken: string | null;
}

interface SessionInput {
  user: UserOut;
  accessToken: string;
  refreshToken?: string | null;
}

export interface AuthState extends StoredAuth {
  isAuthenticated: boolean;
  hydrate: () => void;
  setSession: (session: SessionInput) => void;
  setAccessToken: (accessToken: string) => void;
  login: (payload: LoginRequest) => Promise<UserOut>;
  refresh: () => Promise<string | null>;
  logout: () => void;
  markPasswordChanged: () => void;
}

function readStoredAuth(): StoredAuth {
  if (typeof localStorage === 'undefined') {
    return { user: null, accessToken: null, refreshToken: null };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, refreshToken: null };
    return JSON.parse(raw) as StoredAuth;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { user: null, accessToken: null, refreshToken: null };
  }
}

function writeStoredAuth(value: StoredAuth) {
  if (typeof localStorage === 'undefined') return;

  if (!value.user || !value.accessToken) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

const initial = readStoredAuth();

export const useAuthStore = create<AuthState>()(
  immer((set, get) => ({
    ...initial,
    isAuthenticated: Boolean(initial.user && initial.accessToken),

    hydrate: () => {
      const stored = readStoredAuth();
      set((state) => {
        state.user = stored.user;
        state.accessToken = stored.accessToken;
        state.refreshToken = stored.refreshToken;
        state.isAuthenticated = Boolean(stored.user && stored.accessToken);
      });
    },

    setSession: ({ user, accessToken, refreshToken }) => {
      const next = {
        user,
        accessToken,
        refreshToken: refreshToken ?? get().refreshToken,
      };
      writeStoredAuth(next);
      set((state) => {
        state.user = next.user;
        state.accessToken = next.accessToken;
        state.refreshToken = next.refreshToken;
        state.isAuthenticated = true;
      });
    },

    setAccessToken: (accessToken) => {
      const next = { user: get().user, accessToken, refreshToken: get().refreshToken };
      writeStoredAuth(next);
      set((state) => {
        state.accessToken = accessToken;
        state.isAuthenticated = Boolean(state.user);
      });
    },

    login: async (payload) => {
      const { data } = await authApi.login(payload);
      if (!data.user || !data.refresh_token) {
        throw new Error('Login response did not include a complete session');
      }

      get().setSession({
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      return data.user;
    },

    refresh: async () => {
      const refreshToken = get().refreshToken;
      if (!refreshToken) return null;

      const { data } = await authApi.refresh({ refresh_token: refreshToken });
      get().setAccessToken(data.access_token);
      return data.access_token;
    },

    logout: () => {
      writeStoredAuth({ user: null, accessToken: null, refreshToken: null });
      set((state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
      });
    },

    markPasswordChanged: () => {
      const user = get().user;
      if (!user) return;

      get().setSession({
        user: { ...user, must_change_password: false },
        accessToken: get().accessToken ?? '',
        refreshToken: get().refreshToken,
      });
    },
  })),
);
