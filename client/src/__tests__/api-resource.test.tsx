import axios, { AxiosError, AxiosHeaders } from 'axios';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import api from '@/api/client';
import { ResourceNotFound } from '@/components/ResourceNotFound';
import { useResourceQuery } from '@/hooks/useResourceQuery';
import { useAuthStore } from '@/stores/authStore';
import type { UserOut } from '@/types/user';
import { server } from './setup';
import { createTestQueryClient, renderWithProviders } from './testUtils';

const user: UserOut = {
  id: 1,
  username: 'student',
  full_name: 'Student User',
  role: 'student',
  role_id: 1,
  group_id: null,
  group_name: null,
  avatar_url: null,
  is_active: true,
  must_change_password: false,
  last_login_at: null,
  created_at: '2026-05-02T00:00:00Z',
};

function axiosStatus(status: number) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    statusText: String(status),
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });
}

describe('API client and resource not found pattern', () => {
  it('adds bearer token to API requests', async () => {
    useAuthStore.getState().setSession({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    let authorization = '';
    server.use(
      http.get('/api/protected', ({ request }) => {
        authorization = request.headers.get('authorization') ?? '';
        return HttpResponse.json({ ok: true });
      }),
    );

    await api.get('/protected');

    expect(authorization).toBe('Bearer access-token');
  });

  it('refreshes once on 401 and retries the original request', async () => {
    useAuthStore.getState().setSession({
      user,
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
    });
    let protectedCalls = 0;
    server.use(
      http.get('/api/protected', () => {
        protectedCalls += 1;
        if (protectedCalls === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/auth/refresh', () =>
        HttpResponse.json({ access_token: 'fresh-token', token_type: 'bearer', expires_in: 28800 }),
      ),
    );

    const response = await api.get('/protected');

    expect(response.data).toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
    expect(protectedCalls).toBe(2);
  });

  it('logs out and redirects when refresh also fails', async () => {
    useAuthStore.getState().setSession({
      user,
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
    });
    server.use(
      http.get('/api/protected', () => new HttpResponse(null, { status: 401 })),
      http.post('/api/auth/refresh', () => new HttpResponse(null, { status: 401 })),
    );

    await expect(api.get('/protected')).rejects.toBeTruthy();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.location.href).toContain('/login?reason=session_expired');
  });

  it('redirects 410 attempt responses to result page', async () => {
    server.use(
      http.post('/api/attempts/42/step', () => new HttpResponse(null, { status: 410 })),
    );

    await expect(api.post('/attempts/42/step', {})).rejects.toBeTruthy();

    expect(window.location.href).toContain('/student/attempts/42/result');
  });

  it('renders ResourceNotFound with back navigation', () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/missing"
          element={<ResourceNotFound resourceType="Кейс" backUrl="/student/cases" backLabel="К кейсам" />}
        />
      </Routes>,
      { route: '/missing' },
    );

    expect(screen.getByRole('heading', { name: 'Кейс не найден' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К кейсам' })).toHaveAttribute('href', '/student/cases');
  });

  it('useResourceQuery converts API 404 into null data', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useResourceQuery(['missing'], async () => {
        throw axiosStatus(404);
      }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
    expect(axios.isAxiosError(axiosStatus(404))).toBe(true);
  });

  it('useResourceQuery keeps non-404 errors in error state', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useResourceQuery(['broken'], async () => {
        throw axiosStatus(500);
      }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
  });
});
