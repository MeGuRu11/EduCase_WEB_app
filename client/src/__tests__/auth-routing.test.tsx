import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useAuthStore } from '@/stores/authStore';
import type { UserOut } from '@/types/user';
import { server } from './setup';
import { renderWithProviders } from './testUtils';

const student: UserOut = {
  id: 1,
  username: 'student',
  full_name: 'Student User',
  role: 'student',
  role_id: 1,
  group_id: 10,
  group_name: '101',
  avatar_url: null,
  is_active: true,
  must_change_password: false,
  last_login_at: null,
  created_at: '2026-05-02T00:00:00Z',
};

const teacher: UserOut = {
  ...student,
  id: 2,
  username: 'teacher',
  full_name: 'Teacher User',
  role: 'teacher',
  role_id: 2,
  group_id: null,
  group_name: null,
};

beforeEach(() => {
  useAuthStore.getState().logout();
  server.use(
    http.get('/api/analytics/student/dashboard', () =>
      HttpResponse.json({
        total_scenarios: 0,
        completed_scenarios: 0,
        in_progress_scenarios: 0,
        avg_score: 0,
        best_score: 0,
        total_time_hours: 0,
        recent_attempts: [],
      }),
    ),
    http.get('/api/analytics/teacher/scenarios', () => HttpResponse.json([])),
  );
});

describe('auth pages and routing', () => {
  it('logs in and redirects to role home', async () => {
    server.use(
      http.post('/api/auth/login', async () =>
        HttpResponse.json({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          token_type: 'bearer',
          expires_in: 28800,
          user: student,
        }),
      ),
    );

    renderWithProviders(<App />, { route: '/login' });

    await userEvent.type(screen.getByLabelText('Логин'), 'student');
    await userEvent.type(screen.getByLabelText('Пароль'), 'Password1!');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText(/Обучаемый/i)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('access-token');
  });

  it('shows login error without clearing entered username', async () => {
    server.use(http.post('/api/auth/login', () => new HttpResponse(null, { status: 401 })));

    renderWithProviders(<App />, { route: '/login' });

    await userEvent.type(screen.getByLabelText('Логин'), 'student');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Логин')).toHaveValue('student');
  });

  it('submits password change and sends user home', async () => {
    useAuthStore.getState().setSession({
      user: { ...student, must_change_password: true },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    server.use(http.post('/api/users/me/change-password', () => HttpResponse.json({ status: 'ok' })));

    renderWithProviders(<App />, { route: '/change-password' });

    await userEvent.type(screen.getByLabelText('Текущий пароль'), 'Password1!');
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'Password2!');
    await userEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }));

    expect(await screen.findByText(/Обучаемый/i)).toBeInTheDocument();
    expect(useAuthStore.getState().user?.must_change_password).toBe(false);
  });

  it('redirects anonymous users to login', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/student" element={<div>Private</div>} />
        </Route>
        <Route path="/login" element={<div>Login route</div>} />
      </Routes>,
      { route: '/student' },
    );

    expect(await screen.findByText('Login route')).toBeInTheDocument();
  });

  it('redirects users that must change password', async () => {
    useAuthStore.getState().setSession({
      user: { ...student, must_change_password: true },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/student" element={<div>Private</div>} />
        </Route>
        <Route path="/change-password" element={<div>Change password route</div>} />
      </Routes>,
      { route: '/student' },
    );

    expect(await screen.findByText('Change password route')).toBeInTheDocument();
  });

  it('redirects disallowed roles to their home route', async () => {
    useAuthStore.getState().setSession({
      user: student,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<div>Admin</div>} />
        </Route>
        <Route path="/student" element={<div>Student home</div>} />
      </Routes>,
      { route: '/admin' },
    );

    expect(await screen.findByText('Student home')).toBeInTheDocument();
  });

  it('renders protected content when authenticated and role matches', () => {
    useAuthStore.getState().setSession({
      user: teacher,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute roles={['teacher']} />}>
          <Route path="/teacher" element={<div>Teacher area</div>} />
        </Route>
      </Routes>,
      { route: '/teacher' },
    );

    expect(screen.getByText('Teacher area')).toBeInTheDocument();
  });

  it('renders role-based sidebar items', () => {
    useAuthStore.getState().setSession({
      user: teacher,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(<Sidebar />, { route: '/teacher' });

    expect(screen.getByRole('link', { name: /Scenarios/i })).toHaveAttribute('href', '/teacher/scenarios');
    expect(screen.queryByRole('link', { name: /Users/i })).not.toBeInTheDocument();
  });

  it('topbar shows user and logs out', async () => {
    useAuthStore.getState().setSession({
      user: student,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(<TopBar />);

    expect(screen.getByText('Student User')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('app layout renders navigation, topbar and outlet', () => {
    useAuthStore.getState().setSession({
      user: student,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/student" element={<div>Main content</div>} />
        </Route>
      </Routes>,
      { route: '/student' },
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Main content');
  });

  it('shows catch-all not-found page for unknown URLs', async () => {
    useAuthStore.getState().setSession({
      user: student,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(<App />, { route: '/unknown-path' });

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
    expect(screen.getByText('/unknown-path')).toBeInTheDocument();
  });

  it('renders forbidden page without protected route', () => {
    renderWithProviders(<App />, { route: '/forbidden' });

    expect(screen.getByRole('heading', { name: 'Доступ запрещён' })).toBeInTheDocument();
  });

  it('root route redirects authenticated users by role', async () => {
    useAuthStore.getState().setSession({
      user: teacher,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderWithProviders(<App />, { route: '/' });

    await waitFor(() => expect(screen.getByText(/Преподаватель/i)).toBeInTheDocument());
  });
});
