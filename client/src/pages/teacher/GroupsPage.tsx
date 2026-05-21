import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { groupsApi } from '@/api/groups';
import { useTeacherScenarioStats } from '@/hooks/useAnalytics';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatPercent } from '@/utils/formatters';
import type { GroupOut } from '@/types/group';

function groupMetrics(group: GroupOut, stats: ReturnType<typeof useTeacherScenarioStats>['data']) {
  const related = (stats ?? []).filter((item) => item.group_id === group.id);
  const avg = related.length ? related.reduce((sum, item) => sum + item.avg_score, 0) / related.length : 0;
  return { assigned: related.length, avg };
}

export default function GroupsPage() {
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const stats = useTeacherScenarioStats();

  if (groups.isLoading || stats.isLoading) return <Skeleton rows={6} label="Загрузка..." />;

  if (groups.isError || stats.isError) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger-ink">Не удалось загрузить группы.</div>;
  }

  const data = groups.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-purple-ink">Преподаватель</p>
        <h1 className="text-3xl font-bold text-fg">Мои группы</h1>
        <p className="mt-1 text-sm text-fg-muted">Группы, доступные преподавателю для аналитики и назначений.</p>
      </header>

      {data.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Группы">
          {data.map((group) => {
            const metrics = groupMetrics(group, stats.data);
            return (
              <Card key={group.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-fg">{group.name}</h2>
                    <p className="text-sm text-fg-muted">{group.description ?? 'Описание не заполнено'}</p>
                  </div>
                  <Badge variant={group.is_active ? 'success' : 'neutral'}>{group.is_active ? 'Активна' : 'Архив'}</Badge>
                </div>
                <div className="space-y-1 text-sm text-fg-muted">
                  <p>{group.student_count} студентов · {metrics.assigned} сценариев назначено</p>
                  <p>Средний балл: {metrics.assigned ? formatPercent(metrics.avg) : '—'}</p>
                  <p>Преподаватели: {group.teachers.map((teacher) => teacher.full_name).join(', ') || 'не назначены'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="focus-ring rounded border border-royal px-3 py-2 text-sm font-medium text-royal-ink hover:bg-royal/5" to={`/teacher/analytics?group_id=${group.id}`}>
                    Список студентов
                  </Link>
                  <Link className="focus-ring rounded bg-purple-ink px-3 py-2 text-sm font-medium text-white hover:bg-purple-ink/90" to="/teacher/scenarios">
                    Назначить сценарий
                  </Link>
                </div>
              </Card>
            );
          })}
        </section>
      ) : (
        <EmptyState icon="groups" title="Групп пока нет" description="Администратор должен назначить преподавателя на группу." />
      )}
    </div>
  );
}