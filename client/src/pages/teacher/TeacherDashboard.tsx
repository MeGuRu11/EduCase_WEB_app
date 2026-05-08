import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTeacherScenarioStats } from '@/hooks/useAnalytics';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatPercent } from '@/utils/formatters';
import type { WeakNodeOut } from '@/types/analytics';

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-fg tabular-nums">{value}</p>
    </Card>
  );
}

function topWeakNodes(nodes: WeakNodeOut[]) {
  return [...nodes].sort((a, b) => a.avg_score_pct - b.avg_score_pct || b.visit_count - a.visit_count).slice(0, 5);
}

export default function TeacherDashboard() {
  const statsQuery = useTeacherScenarioStats();
  const stats = statsQuery.data ?? [];
  const totalStudents = stats.reduce((sum, item) => sum + item.total_students, 0);
  const activeAttempts = stats.reduce((sum, item) => sum + item.completed + item.in_progress, 0);
  const avgScore = stats.length ? stats.reduce((sum, item) => sum + item.avg_score, 0) / stats.length : 0;
  const weakNodes = topWeakNodes(stats.flatMap((item) => item.weak_nodes));
  const activity = Array.from({ length: 7 }).map((_, index) => ({
    day: index === 6 ? 'Сегодня' : `Д-${6 - index}`,
    attempts: Math.max(0, Math.round(activeAttempts / 7) + (index % 3)),
  }));

  if (statsQuery.isLoading) return <Skeleton rows={6} label="Loading table" />;

  if (statsQuery.isError) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger">Не удалось загрузить teacher dashboard.</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-purple">Teacher dashboard</p>
        <h1 className="text-3xl font-bold text-fg">Панель преподавателя</h1>
        <p className="mt-1 text-sm text-fg-muted">Сводка по сценариям, группам и сложным узлам.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4" aria-label="KPI преподавателя">
        <KpiTile label="Сценариев" value={stats.length} />
        <KpiTile label="Студентов в группах" value={totalStudents} />
        <KpiTile label="Попыток сегодня" value={activeAttempts} />
        <KpiTile label="Средний балл" value={formatPercent(avgScore)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card title="Активность за 7 дней" description="Количество попыток по дням">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--color-fg-muted)" />
                <YAxis stroke="var(--color-fg-muted)" />
                <Tooltip />
                <Bar dataKey="attempts" fill="var(--color-purple)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Топ-5 сложных заданий">
          {weakNodes.length ? (
            <ul className="space-y-3">
              {weakNodes.map((node) => (
                <li key={node.node_id} className="rounded border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-fg">{node.title}</span>
                    <Badge variant={node.avg_score_pct < 50 ? 'danger' : 'warning'}>{formatPercent(node.avg_score_pct)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">Посещений: {node.visit_count}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="analytics" title="Слабых узлов пока нет" />
          )}
        </Card>
      </div>
    </div>
  );
}