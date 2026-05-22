import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsPage from '@/pages/teacher/AnalyticsPage';
import GroupsPage from '@/pages/teacher/GroupsPage';
import MyCases from '@/pages/student/MyCases';
import MyResults from '@/pages/student/MyResults';
import StudentDashboard from '@/pages/student/StudentDashboard';
import TeacherDashboard from '@/pages/teacher/TeacherDashboard';
import type { StudentDashboardOut, TeacherScenarioStatsOut, PathHeatmapOut } from '@/types/analytics';
import type { AttemptSummaryOut } from '@/types/attempt';
import type { GroupOut } from '@/types/group';
import type { ScenarioListOut } from '@/types/scenario';
import { server } from './setup';
import { renderWithProviders } from './testUtils';

vi.mock('recharts', () => ({
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`bar-${dataKey}`} />,
  BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  CartesianGrid: () => <div data-testid="chart-grid" />,
  Cell: () => null,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  LineChart: ({ children }: { children?: ReactNode }) => <div data-testid="line-chart">{children}</div>,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  Tooltip: () => <div data-testid="chart-tooltip" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}));

vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="analytics-flow-background" />,
  Controls: () => <div data-testid="analytics-flow-controls" />,
  MiniMap: () => <div data-testid="analytics-flow-minimap" />,
  ReactFlow: ({
    children,
    edges = [],
    nodes = [],
    onNodeClick,
  }: {
    children?: ReactNode;
    edges?: Array<{ id: string; label?: string }>;
    nodes?: Array<{ id: string; data?: { label?: string; title?: string } }>;
    onNodeClick?: (event: unknown, node: { id: string }) => void;
  }) => (
    <div data-testid="analytics-heatmap">
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={(event) => onNodeClick?.(event, node)}>
          {node.data?.label ?? node.data?.title ?? node.id}
        </button>
      ))}
      {edges.map((edge) => (
        <span key={edge.id}>{edge.label ?? edge.id}</span>
      ))}
      {children}
    </div>
  ),
}));

const now = '2026-05-02T09:00:00Z';

function attempt(patch: Partial<AttemptSummaryOut> = {}): AttemptSummaryOut {
  return {
    id: 11,
    scenario_id: 7,
    scenario_title: 'Пневмония',
    attempt_num: 1,
    status: 'completed',
    total_score: 82,
    max_score: 100,
    score_pct: 82,
    passed: true,
    started_at: now,
    finished_at: '2026-05-02T09:20:00Z',
    duration_sec: 1200,
    ...patch,
  };
}

function scenario(patch: Partial<ScenarioListOut> = {}): ScenarioListOut {
  return {
    id: 7,
    title: 'Пневмония',
    description: 'Дыхательная недостаточность',
    disease_category: 'Терапия',
    cover_url: null,
    status: 'published',
    author_id: 2,
    author_name: 'Teacher',
    time_limit_min: 30,
    max_attempts: 3,
    passing_score: 70,
    version: 1,
    node_count: 4,
    assigned_groups: [3],
    my_attempts_count: 0,
    created_at: now,
    updated_at: now,
    ...patch,
  };
}

const dashboard: StudentDashboardOut = {
  total_scenarios: 4,
  completed_scenarios: 2,
  in_progress_scenarios: 1,
  avg_score: 78,
  best_score: 94,
  total_time_hours: 3.5,
  recent_attempts: [
    attempt({ id: 11, scenario_title: 'Пневмония', score_pct: 82 }),
    attempt({ id: 12, scenario_id: 8, scenario_title: 'Гепатит', score_pct: 74, attempt_num: 2 }),
  ],
};

const weakNode = {
  node_id: 'decision-1',
  title: 'Выбор антибиотика',
  node_type: 'decision',
  visit_count: 9,
  avg_score_pct: 45,
  most_common_wrong_answer: 'Амоксициллин без показаний',
};

const teacherStats: TeacherScenarioStatsOut[] = [
  {
    scenario_id: 7,
    scenario_title: 'Пневмония',
    group_id: 3,
    group_name: '431 учебная',
    total_students: 12,
    completed: 9,
    in_progress: 2,
    avg_score: 71,
    score_distribution: { bins: [0, 20, 40, 60, 80], counts: [1, 1, 2, 4, 4] },
    path_analysis: {
      correct_path_count: 6,
      incorrect_path_count: 3,
      most_common_wrong_node: weakNode,
    },
    weak_nodes: [
      weakNode,
      {
        node_id: 'form-1',
        title: 'План обследования',
        node_type: 'form',
        visit_count: 6,
        avg_score_pct: 62,
        most_common_wrong_answer: null,
      },
    ],
    student_ranking: [
      { user_id: 1, full_name: 'Иванов И.И.', score: 91, duration_sec: 1240, path: ['start-1', 'decision-1'] },
      { user_id: 2, full_name: 'Петров П.П.', score: 66, duration_sec: 1480, path: ['start-1', 'form-1'] },
    ],
  },
];

const heatmap: PathHeatmapOut = {
  scenario_id: 7,
  group_id: 3,
  total_attempts: 12,
  nodes: [
    { id: 'start-1', title: 'Старт', node_type: 'start', visit_count: 12, avg_score_pct: null },
    { id: 'decision-1', title: 'Выбор антибиотика', node_type: 'decision', visit_count: 9, avg_score_pct: 45 },
    { id: 'final-1', title: 'Итог', node_type: 'final', visit_count: 8, avg_score_pct: 88 },
  ],
  edges: [
    { source: 'start-1', target: 'decision-1', traverse_count: 9 },
    { source: 'decision-1', target: 'final-1', traverse_count: 8 },
  ],
};

const groups: GroupOut[] = [
  {
    id: 3,
    name: '431 учебная',
    description: 'Терапевтический профиль',
    teachers: [{ id: 2, full_name: 'Teacher User' }],
    student_count: 25,
    is_active: true,
    created_at: now,
  },
];

function useStage8Handlers() {
  server.use(
    http.get('/api/analytics/student/dashboard', () => HttpResponse.json(dashboard)),
    http.get('/api/attempts/my', () =>
      HttpResponse.json([
        attempt({ id: 11, scenario_title: 'Пневмония', status: 'completed', score_pct: 82 }),
        attempt({ id: 12, scenario_id: 8, scenario_title: 'Гепатит', status: 'in_progress', score_pct: 31 }),
      ]),
    ),
    http.get('/api/scenarios/', () =>
      HttpResponse.json([
        scenario({ id: 7, title: 'Пневмония', disease_category: 'Терапия', my_attempts_count: 0 }),
        scenario({ id: 8, title: 'Гепатит', disease_category: 'Инфекции', my_attempts_count: 2 }),
        scenario({ id: 9, title: 'Архивный кейс', disease_category: 'Терапия', status: 'archived' }),
      ]),
    ),
    http.get('/api/analytics/teacher/scenarios', () => HttpResponse.json(teacherStats)),
    http.get('/api/analytics/teacher/heatmap/7', () => HttpResponse.json(heatmap)),
    http.get('/api/groups/', () => HttpResponse.json(groups)),
    http.get('/api/analytics/export', ({ request }) => {
      const format = new URL(request.url).searchParams.get('format');
      return new HttpResponse(`${format}-payload`, {
        headers: { 'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/octet-stream' },
      });
    }),
  );
}

function renderAnalytics(route = '/teacher/scenarios/7/analytics?group_id=3') {
  return renderWithProviders(
    <Routes>
      <Route path="/teacher/scenarios/:id/analytics" element={<AnalyticsPage />} />
      <Route path="/teacher/analytics" element={<AnalyticsPage />} />
    </Routes>,
    { route },
  );
}

describe('Stage 8 dashboards and analytics', () => {
  it('renders student dashboard KPI tiles and recent attempt links', async () => {
    useStage8Handlers();
    renderWithProviders(<StudentDashboard />);

    expect(await screen.findByText('Обучаемый')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Пневмония/ })).toHaveAttribute('href', '/student/attempts/11/result');
  });

  it('shows student dashboard loading and error states', async () => {
    server.use(http.get('/api/analytics/student/dashboard', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<StudentDashboard />);

    expect(screen.getByLabelText('Загрузка...')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
  });

  it('filters assigned cases by category and status', async () => {
    useStage8Handlers();
    renderWithProviders(<MyCases />);

    expect(await screen.findByRole('heading', { name: 'Мои кейсы' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Дисциплина'), 'Инфекции');
    expect(screen.queryByText('Пневмония')).not.toBeInTheDocument();
    expect(screen.getByText('Гепатит')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'archived');
    expect(screen.getByText('Нет кейсов под выбранные фильтры')).toBeInTheDocument();
  });

  it('shows start and result actions for student cases', async () => {
    useStage8Handlers();
    renderWithProviders(<MyCases />);

    expect(await screen.findByRole('link', { name: 'Начать' })).toHaveAttribute('href', '/student/cases/7/play');
    expect(screen.getAllByRole('link', { name: 'Результат' })[0]).toHaveAttribute('href', '/student/results');
  });

  it('filters my results table by status and sorts by score', async () => {
    useStage8Handlers();
    renderWithProviders(<MyResults />);

    expect(await screen.findByRole('heading', { name: 'Мои результаты' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'completed');
    expect(screen.getByRole('cell', { name: 'Пневмония' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Гепатит' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Сортировка'), 'score_desc');
    expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', '/student/attempts/11/result');
  });

  it('renders teacher dashboard KPI tiles, activity chart and weak nodes', async () => {
    useStage8Handlers();
    renderWithProviders(<TeacherDashboard />);

    expect(await screen.findByText('Преподаватель')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByText('Выбор антибиотика')).toBeInTheDocument();
  });

  it('renders groups page cards for teacher groups', async () => {
    useStage8Handlers();
    renderWithProviders(<GroupsPage />);

    expect(await screen.findByRole('heading', { name: 'Мои группы' })).toBeInTheDocument();
    expect(screen.getByText('431 учебная')).toBeInTheDocument();
    expect(screen.getByText(/25 студентов/)).toBeInTheDocument();
  });

  it('renders analytics heatmap and opens node detail modal', async () => {
    useStage8Handlers();
    renderAnalytics();

    expect(await screen.findByRole('heading', { name: /Аналитика/ })).toBeInTheDocument();
    expect(screen.getByTestId('analytics-heatmap')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Выбор антибиотика' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('45%');
  });

  it('renders analytics score distribution tab', async () => {
    useStage8Handlers();
    renderAnalytics();

    await screen.findByRole('heading', { name: /Аналитика/ });
    await userEvent.click(screen.getByRole('tab', { name: 'Распределение' }));
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByText('80-100')).toBeInTheDocument();
  });

  it('sorts analytics ranking by duration', async () => {
    useStage8Handlers();
    renderAnalytics();

    await screen.findByRole('heading', { name: /Аналитика/ });
    await userEvent.click(screen.getByRole('tab', { name: 'Рейтинг' }));
    await userEvent.selectOptions(screen.getByLabelText('Сортировка рейтинга'), 'duration_asc');
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Иванов И.И.');
  });

  it('shows only weak nodes below threshold in analytics weak nodes tab', async () => {
    useStage8Handlers();
    renderAnalytics();

    await screen.findByRole('heading', { name: /Аналитика/ });
    await userEvent.click(screen.getByRole('tab', { name: 'Слабые узлы' }));
    expect(screen.getByText('Выбор антибиотика')).toBeInTheDocument();
    expect(screen.queryByText('План обследования')).not.toBeInTheDocument();
  });

  it('export buttons request downloadable files', async () => {
    useStage8Handlers();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const NativeURL = URL;
    class DownloadURL extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:analytics');
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', DownloadURL);
    renderAnalytics();

    await screen.findByRole('heading', { name: /Аналитика/ });
    await userEvent.click(screen.getByRole('button', { name: 'Скачать XLSX' }));
    await userEvent.click(screen.getByRole('button', { name: 'Скачать PDF' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(2));
    vi.stubGlobal('URL', NativeURL);
  });
});