import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStudentDashboard } from '@/hooks/useAnalytics';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime, formatDuration, formatHours, formatPercent } from '@/utils/formatters';
import type { AttemptSummaryOut } from '@/types/attempt';

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-fg tabular-nums">{value}</p>
    </Card>
  );
}

function RecentAttempt({ attempt }: { attempt: AttemptSummaryOut }) {
  return (
    <Link
      to={`/student/attempts/${attempt.id}/result`}
      className="focus-ring flex items-center justify-between rounded border border-border bg-bg px-4 py-3 transition-colors hover:bg-surface"
    >
      <span>
        <span className="block font-semibold text-fg">{attempt.scenario_title}</span>
        <span className="text-sm text-fg-muted">
          Попытка #{attempt.attempt_num} · {formatDateTime(attempt.started_at)} · {formatDuration(attempt.duration_sec)}
        </span>
      </span>
      <Badge variant={attempt.passed ? 'success' : 'warning'}>{formatPercent(attempt.score_pct)}</Badge>
    </Link>
  );
}

export default function StudentDashboard() {
  const dashboard = useStudentDashboard();
  const attempts = dashboard.data?.recent_attempts ?? [];
  const chartData = attempts.slice(-5).map((attempt) => ({
    name: `#${attempt.attempt_num}`,
    score: Math.round(attempt.score_pct),
  }));

  if (dashboard.isLoading) {
    return <Skeleton rows={6} label="Загрузка..." />;
  }

  if (dashboard.isError) {
    return (
      <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-danger-ink">
        Не удалось загрузить данные дашборда.
      </div>
    );
  }

  if (!dashboard.data) {
    return <EmptyState icon="dashboard" title="Нет данных" description="Статистика появится после первой попытки." />;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-royal-ink">Обучаемый</p>
        <h1 className="text-3xl font-bold text-fg">Панель обучаемого</h1>
        <p className="mt-1 text-sm text-fg-muted">Прогресс по назначенным клиническим кейсам.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="KPI обучаемого">
        <KpiTile label="Всего кейсов" value={dashboard.data.total_scenarios} />
        <KpiTile label="Завершено" value={dashboard.data.completed_scenarios} />
        <KpiTile label="Средний балл" value={formatPercent(dashboard.data.avg_score)} />
        <KpiTile label="Общее время" value={formatHours(dashboard.data.total_time_hours)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title="Прогресс последних 5 попыток" description={`Лучший результат: ${formatPercent(dashboard.data.best_score)}`}>
          {chartData.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="var(--color-fg-muted)" />
                  <YAxis domain={[0, 100]} stroke="var(--color-fg-muted)" />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="var(--color-royal)" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="attempts" title="Попыток пока нет" />
          )}
        </Card>

        <Card title="Последние попытки">
          <div className="space-y-3">
            {attempts.length ? attempts.map((attempt) => <RecentAttempt key={attempt.id} attempt={attempt} />) : null}
            {!attempts.length ? <EmptyState icon="attempts" title="История пуста" /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}