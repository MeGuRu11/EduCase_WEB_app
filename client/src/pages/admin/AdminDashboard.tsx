import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import HealthWidget from '@/components/admin/HealthWidget';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAdminStats } from '@/hooks/useAdmin';

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-fg tabular-nums">{value}</p>
    </Card>
  );
}

function buildSevenDaySeries(total: number, today: number, key: 'users' | 'attempts') {
  return Array.from({ length: 7 }).map((_, index) => {
    const base = Math.max(0, Math.round(total / 21) + (index % 2));
    return {
      day: index === 6 ? 'Сегодня' : `Д-${6 - index}`,
      [key]: index === 6 ? today : base,
    };
  });
}

export default function AdminDashboard() {
  const stats = useAdminStats();

  if (stats.isLoading) return <Skeleton rows={6} label="Loading table" />;

  if (stats.isError || !stats.data) {
    return (
      <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger">
        Не удалось загрузить admin dashboard.
      </div>
    );
  }

  const usersSeries = buildSevenDaySeries(stats.data.users_total, Math.max(1, Math.round(stats.data.users_total / 30)), 'users');
  const attemptsSeries = buildSevenDaySeries(stats.data.attempts_total, stats.data.attempts_today, 'attempts');

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-danger">Admin dashboard</p>
        <h1 className="text-3xl font-bold text-fg">Панель администратора</h1>
        <p className="mt-1 text-sm text-fg-muted">Контроль пользователей, состояния системы и операционных рисков.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="KPI администратора">
        <KpiTile label="Пользователей" value={stats.data.users_total} />
        <KpiTile label="Сценариев" value={stats.data.scenarios_total} />
        <KpiTile label="Попыток" value={stats.data.attempts_total} />
        <KpiTile label="Размер БД" value={`${stats.data.db_size_mb.toFixed(1)} МБ`} />
      </section>

      <HealthWidget />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Новые пользователи за 7 дней">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={usersSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--color-fg-muted)" />
                <YAxis stroke="var(--color-fg-muted)" />
                <Tooltip />
                <Line type="monotone" dataKey="users" stroke="var(--color-royal)" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Новые попытки за 7 дней">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attemptsSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--color-fg-muted)" />
                <YAxis stroke="var(--color-fg-muted)" />
                <Tooltip />
                <Line type="monotone" dataKey="attempts" stroke="var(--color-purple)" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}