import { act, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HealthWidget from '@/components/admin/HealthWidget';
import MaintenanceBanner from '@/components/admin/MaintenanceBanner';
import { Sidebar } from '@/components/layout/Sidebar';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import SettingsPage from '@/pages/admin/SettingsPage';
import SystemPage from '@/pages/admin/SystemPage';
import UsersPage from '@/pages/admin/UsersPage';
import { useAuthStore } from '@/stores/authStore';
import type { UserOut } from '@/types/user';
import { server } from './setup';
import { renderWithProviders } from './testUtils';

vi.mock('recharts', () => ({
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
  BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  CartesianGrid: () => <div data-testid="chart-grid" />,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  LineChart: ({ children }: { children?: ReactNode }) => <div data-testid="line-chart">{children}</div>,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  Tooltip: () => <div data-testid="chart-tooltip" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: ({ domain }: { domain?: Array<number | string> }) => <div data-testid="y-axis" data-domain={domain?.join('-') ?? ''} />,
}));

const now = '2026-05-08T09:00:00Z';

const adminStats = {
  users_total: 30,
  students: 22,
  teachers: 6,
  admins: 2,
  scenarios_total: 14,
  published_scenarios: 9,
  attempts_today: 8,
  attempts_total: 140,
  db_size_mb: 42.7,
  last_backup_at: now,
  last_backup_age_human: '2 ч назад',
};

const sysinfo = {
  db_size_mb: 42.7,
  last_backup_at: now,
  last_backup_age_human: '2 ч назад',
  version: '1.1.0',
  python_version: '3.12.7',
  uptime_hours: 18.5,
  maintenance_mode: false,
};

const settings = {
  institution_name: 'ВМедА',
  idle_timeout_min: 30,
  max_file_upload_mb: 5,
  backup_retention_days: 90,
  maintenance_mode: false,
};

const backup = {
  filename: 'backup_20260508_090000.dump',
  size_mb: 12.4,
  created_at: now,
  age_human: '5 мин назад',
};

const errorLog = {
  id: 7,
  level: 'ERROR',
  message: 'pg_restore failed',
  user_id: 1,
  username: 'admin',
  meta: { job: 'restore' },
  created_at: now,
};

const users: UserOut[] = [
  {
    id: 1,
    username: 'ivanov.i',
    full_name: 'Иванов И.И.',
    role: 'student',
    role_id: 1,
    group_id: 3,
    group_name: '431 учебная',
    avatar_url: null,
    is_active: true,
    must_change_password: false,
    last_login_at: now,
    created_at: now,
  },
  {
    id: 2,
    username: 'petrov.p',
    full_name: 'Петров П.П.',
    role: 'teacher',
    role_id: 2,
    group_id: null,
    group_name: null,
    avatar_url: null,
    is_active: false,
    must_change_password: false,
    last_login_at: null,
    created_at: now,
  },
];

function health(status: 'ok' | 'warning' | 'error') {
  return {
    status,
    version: '1.1.0',
    checked_at: now,
    checks: {
      db: { status: status === 'error' ? 'error' : 'ok', latency_ms: 12 },
      disk: { status: status === 'warning' ? 'warning' : 'ok', free_gb: 4.2 },
      backup: { status: 'ok', last_backup_age_hours: 2 },
      scheduler: { status: 'ok', running: true },
      errors_24h: { status: 'ok', count: 0 },
    },
  };
}

function useAdminHandlers(status: 'ok' | 'warning' | 'error' = 'ok') {
  server.use(
    http.get('/api/analytics/admin/stats', () => HttpResponse.json(adminStats)),
    http.get('/api/admin/health', () => HttpResponse.json(health(status))),
    http.get('/api/admin/logs', () => HttpResponse.json({ items: [errorLog], total: 1, page: 1, pages: 1, per_page: 5 })),
    http.get('/api/admin/sysinfo', () => HttpResponse.json(sysinfo)),
    http.get('/api/admin/backup', () => HttpResponse.json([backup])),
    http.get('/api/admin/settings', () => HttpResponse.json(settings)),
    http.get('/api/users/', () => HttpResponse.json({ items: users, total: users.length, page: 1, pages: 1, per_page: 20 })),
    http.get('/api/groups/', () => HttpResponse.json([{ id: 3, name: '431 учебная', description: null, teachers: [], student_count: 1, is_active: true, created_at: now }])),
  );
}

afterEach(() => {
  act(() => {
    useAuthStore.getState().logout();
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Stage 9 admin panel', () => {
  it('renders AdminDashboard with HealthWidget and admin KPI tiles', async () => {
    useAdminHandlers('ok');
    renderWithProviders(<AdminDashboard />);

    expect(await screen.findByText('АДМИНИСТРАТОР: ПАНЕЛЬ')).toBeInTheDocument();
    expect(screen.getByTestId('health-widget')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getAllByTestId('line-chart')).toHaveLength(2);
    expect(screen.getAllByTestId('y-axis')).toHaveLength(2);
    expect(screen.getAllByTestId('y-axis').map((axis) => axis.dataset.domain)).toEqual(['0-30', '0-30']);
  });

  it('AdminDashboard keeps the 0-30 Y axis for empty admin chart data', async () => {
    useAdminHandlers('ok');
    server.use(
      http.get('/api/analytics/admin/stats', () =>
        HttpResponse.json({
          ...adminStats,
          users_total: 0,
          attempts_today: 0,
          attempts_total: 0,
        }),
      ),
    );

    renderWithProviders(<AdminDashboard />);

    expect(await screen.findByText('АДМИНИСТРАТОР: ПАНЕЛЬ')).toBeInTheDocument();
    expect(screen.getAllByTestId('y-axis').map((axis) => axis.dataset.domain)).toEqual(['0-30', '0-30']);
  });

  it('renders Russian admin sidebar navigation', () => {
    act(() => {
      useAuthStore.getState().setSession({
        user: { ...users[0], role: 'admin', role_id: 3 },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    renderWithProviders(<Sidebar />, { route: '/admin' });

    expect(screen.getByRole('link', { name: /Панель управления/ })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: /Пользователи/ })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: /Система/ })).toHaveAttribute('href', '/admin/system');
    expect(screen.getByRole('link', { name: /Настройки/ })).toHaveAttribute('href', '/admin/settings');
  });

  it.each([
    ['ok', 'Система в норме'],
    ['warning', 'Требует внимания'],
    ['error', 'Критическая ошибка'],
  ] as const)('HealthWidget shows %s status without losing the visual indicator', async (status, label) => {
    useAdminHandlers(status);
    renderWithProviders(<HealthWidget />);

    const statusNode = await screen.findByTestId('health-status');
    expect(statusNode).toHaveAttribute('data-status', status);
    expect(within(screen.getByTestId('health-widget')).getByText(label)).toBeInTheDocument();
  });

  it('HealthWidget plays an alert when status changes from ok to error and rate-limits sound', async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const AudioMock = vi.fn().mockImplementation(() => ({ play }));
    vi.stubGlobal('Audio', AudioMock);
    const statuses: Array<'ok' | 'warning' | 'error'> = ['ok', 'error', 'ok', 'error'];
    server.use(
      http.get('/api/admin/health', () => HttpResponse.json(health(statuses.shift() ?? 'error'))),
      http.get('/api/admin/logs', () => HttpResponse.json({ items: [errorLog], total: 1, page: 1, pages: 1, per_page: 5 })),
    );

    const { queryClient } = renderWithProviders(<HealthWidget />);
    expect(await screen.findByText('Система в норме')).toBeInTheDocument();

    await queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    await queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    await screen.findByText('Система в норме');
    await queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    await waitFor(() => expect(screen.getByTestId('health-status')).toHaveAttribute('data-status', 'error'));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('HealthWidget plays an alert on initial render when status is already error (must not be missed)', async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const AudioMock = vi.fn().mockImplementation(() => ({ play }));
    vi.stubGlobal('Audio', AudioMock);
    server.use(
      http.get('/api/admin/health', () => HttpResponse.json(health('error'))),
      http.get('/api/admin/logs', () => HttpResponse.json({ items: [errorLog], total: 1, page: 1, pages: 1, per_page: 5 })),
    );

    renderWithProviders(<HealthWidget />);
    await waitFor(() => expect(screen.getByTestId('health-status')).toHaveAttribute('data-status', 'error'));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it('HealthWidget plays an alert on warning→error escalation (status=error must not be missed)', async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const AudioMock = vi.fn().mockImplementation(() => ({ play }));
    vi.stubGlobal('Audio', AudioMock);
    const statuses: Array<'ok' | 'warning' | 'error'> = ['warning', 'error'];
    server.use(
      http.get('/api/admin/health', () => HttpResponse.json(health(statuses.shift() ?? 'error'))),
      http.get('/api/admin/logs', () => HttpResponse.json({ items: [errorLog], total: 1, page: 1, pages: 1, per_page: 5 })),
    );

    const { queryClient } = renderWithProviders(<HealthWidget />);
    await waitFor(() => expect(screen.getByTestId('health-status')).toHaveAttribute('data-status', 'warning'));
    // initial warning may have alerted; reset for the warning→error assertion
    play.mockClear();

    await queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    await waitFor(() => expect(screen.getByTestId('health-status')).toHaveAttribute('data-status', 'error'));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it('UsersPage filters users and previews CSV upload errors by row number', async () => {
    useAdminHandlers('ok');
    server.use(
      http.post('/api/users/bulk-csv', () =>
        HttpResponse.json({ detail: { created: 0, errors: [{ row: 3, detail: 'Пароль обязателен' }] } }, { status: 422 }),
      ),
    );
    renderWithProviders(<UsersPage />);

    expect(await screen.findByRole('heading', { name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByText('АДМИНИСТРАТОР: ПОЛЬЗОВАТЕЛИ')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Редактировать' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Сбросить пароль' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Заблокировать' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Разблокировать' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(2);
    await userEvent.type(screen.getByLabelText('Поиск'), 'petrov');
    await userEvent.selectOptions(screen.getByLabelText('Роль'), 'teacher');
    expect(screen.getByText('Петров П.П.')).toBeInTheDocument();
    expect(screen.queryByText('Иванов И.И.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Импорт из CSV' }));
    const file = new File(
      ['username;password;full_name;role;group_name;email\nivanov.i;Student123!;Иванов И.И.;student;431 учебная;\nbad;;;student;;'],
      'users.csv',
      { type: 'text/csv' },
    );
    await userEvent.upload(screen.getByLabelText('CSV файл'), file);
    expect(await screen.findByText('ivanov.i')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Загрузить CSV' }));
    expect(await screen.findByText('Строка 3: Пароль обязателен')).toBeInTheDocument();
  });

  it('UsersPage create user modal keeps focus in edited field while typing', async () => {
    useAdminHandlers('ok');
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    expect(await screen.findByRole('heading', { name: 'Пользователи' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Логин'), 'new.admin');

    const fullNameInput = within(dialog).getByLabelText('ФИО');
    await user.click(fullNameInput);
    await user.type(fullNameInput, 'Иванов Иван');

    expect(fullNameInput).toHaveFocus();
    expect(fullNameInput).toHaveValue('Иванов Иван');

    const passwordInput = within(dialog).getByLabelText('Пароль');
    await user.click(passwordInput);
    await user.type(passwordInput, 'Admin1234!');

    expect(passwordInput).toHaveFocus();
    expect(passwordInput).toHaveValue('Admin1234!');

    const roleSelect = within(dialog).getByLabelText('Роль пользователя');
    await user.selectOptions(roleSelect, 'teacher');

    expect(roleSelect).toHaveFocus();
    expect(roleSelect).toHaveValue('teacher');
  });

  it('UsersPage submits create user form, closes modal and refreshes the table', async () => {
    useAdminHandlers('ok');
    let rows = [...users];
    let authHeader = '';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    act(() => {
      useAuthStore.getState().setSession({
        user: { ...users[0], role: 'admin', role_id: 3 },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
    server.use(
      http.get('/api/users/', () => HttpResponse.json({ items: rows, total: rows.length, page: 1, pages: 1, per_page: 20 })),
      http.post('/api/users/', async ({ request }) => {
        authHeader = request.headers.get('authorization') ?? '';
        const body = (await request.json()) as { username: string; password: string; full_name: string; role_id: number; group_id: number | null };
        const created: UserOut = {
          id: 3,
          username: body.username,
          full_name: body.full_name,
          role: body.role_id === 2 ? 'teacher' : body.role_id === 3 ? 'admin' : 'student',
          role_id: body.role_id,
          group_id: body.group_id,
          group_name: null,
          avatar_url: null,
          is_active: true,
          must_change_password: true,
          last_login_at: null,
          created_at: now,
        };
        rows = [...rows, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderWithProviders(<UsersPage />);

    expect(await screen.findByRole('heading', { name: 'Пользователи' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Логин'), 'sidorov.s');
    await userEvent.type(within(dialog).getByLabelText('Пароль'), 'Student123!');
    await userEvent.type(within(dialog).getByLabelText('ФИО'), 'Сидоров С.С.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(authHeader).toBe('Bearer access-token');
    expect(logSpy).toHaveBeenCalledWith('[UsersPage] create submit', {
      username: 'sidorov.s',
      full_name: 'Сидоров С.С.',
      role_id: 1,
      group_id: null,
    });
    expect(await screen.findByText('Сидоров С.С.')).toBeInTheDocument();
  });

  it('SystemPage requires restore triple-confirm before POSTing restore', async () => {
    useAdminHandlers('ok');
    let restored = '';
    server.use(
      http.post('/api/admin/restore/:filename', ({ params }) => {
        restored = String(params.filename);
        return HttpResponse.json({ status: 'started' }, { status: 202 });
      }),
      http.get('/api/admin/sysinfo', () => HttpResponse.json({ ...sysinfo, maintenance_mode: true })),
    );
    renderWithProviders(<SystemPage />);

    expect(await screen.findByRole('heading', { name: 'Система' })).toBeInTheDocument();
    expect(screen.getByText('АДМИНИСТРАТОР: СИСТЕМА')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Восстановить ${backup.filename}` }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Это заменит все данные');
    await userEvent.click(screen.getByRole('button', { name: 'Я понимаю' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(backup.filename);
    const confirmInput = screen.getByLabelText('Имя бэкапа');
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    await userEvent.type(confirmInput, backup.filename);
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('ПОДТВЕРДИТЕ восстановление');
    await userEvent.click(screen.getByRole('button', { name: 'Восстановить систему' }));
    await waitFor(() => expect(restored).toBe(backup.filename));
  });

  it('MaintenanceBanner is visible when global maintenance flag is true', () => {
    act(() => {
      useAuthStore.getState().setMaintenanceMode(true);
    });
    renderWithProviders(<MaintenanceBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent('Идёт восстановление системы');
  });

  it('SettingsPage saves settings and clears the unsaved changes warning', async () => {
    useAdminHandlers('ok');
    let savedName = '';
    server.use(
      http.put('/api/admin/settings', async ({ request }) => {
        const body = (await request.json()) as { institution_name: string };
        savedName = body.institution_name;
        return HttpResponse.json({ ...settings, institution_name: body.institution_name });
      }),
    );
    renderWithProviders(<SettingsPage />);

    const institution = await screen.findByLabelText('Название учреждения');
    expect(screen.getByText('АДМИНИСТРАТОР: НАСТРОЙКИ')).toBeInTheDocument();
    await userEvent.clear(institution);
    await userEvent.type(institution, 'Военно-медицинская академия');
    expect(screen.getByRole('alert')).toHaveTextContent('Есть несохранённые изменения');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));

    await waitFor(() => expect(savedName).toBe('Военно-медицинская академия'));
    await waitFor(() => expect(screen.queryByText('Есть несохранённые изменения')).not.toBeInTheDocument());
  });

  it('SystemPage exports filtered logs as CSV download', async () => {
    useAdminHandlers('ok');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderWithProviders(<SystemPage />);

    expect(await screen.findByText('pg_restore failed')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Уровень логов'), 'ERROR');
    await userEvent.click(screen.getByRole('button', { name: 'Экспорт CSV' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
