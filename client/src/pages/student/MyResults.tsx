import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMyAttempts } from '@/hooks/useAttempts';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Table, type TableColumn } from '@/components/ui/Table';
import { formatDateTime, formatDuration, formatPercent, formatScore } from '@/utils/formatters';
import type { AttemptStatus, AttemptSummaryOut } from '@/types/attempt';

type StatusFilter = AttemptStatus | 'all';
type DateFilter = 'all' | '7' | '30';
type SortMode = 'date_desc' | 'score_desc' | 'duration_asc';

const statusLabels: Record<AttemptStatus, string> = {
  abandoned: 'Прервана',
  completed: 'Завершена',
  in_progress: 'В процессе',
};

const statusVariants: Record<AttemptStatus, BadgeVariant> = {
  abandoned: 'danger',
  completed: 'success',
  in_progress: 'warning',
};

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-fg">
      <span>{label}</span>
      <select
        className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function withinDateFilter(attempt: AttemptSummaryOut, filter: DateFilter) {
  if (filter === 'all') return true;
  const days = Number(filter);
  const startedAt = new Date(attempt.started_at).getTime();
  if (Number.isNaN(startedAt)) return false;
  return Date.now() - startedAt <= days * 24 * 60 * 60 * 1000;
}

export default function MyResults() {
  const attempts = useMyAttempts();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [scenarioId, setScenarioId] = useState('all');
  const [sort, setSort] = useState<SortMode>('date_desc');

  const rows = attempts.data ?? [];
  const scenarios = Array.from(new Map(rows.map((attempt) => [attempt.scenario_id, attempt.scenario_title])).entries());
  const filtered = rows
    .filter((attempt) => status === 'all' || attempt.status === status)
    .filter((attempt) => scenarioId === 'all' || String(attempt.scenario_id) === scenarioId)
    .filter((attempt) => withinDateFilter(attempt, dateFilter))
    .sort((a, b) => {
      if (sort === 'score_desc') return b.score_pct - a.score_pct;
      if (sort === 'duration_asc') return (a.duration_sec ?? Number.MAX_SAFE_INTEGER) - (b.duration_sec ?? Number.MAX_SAFE_INTEGER);
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });

  const columns: TableColumn<AttemptSummaryOut>[] = [
    { key: 'scenario', header: 'Сценарий', render: (row) => row.scenario_title },
    { key: 'date', header: 'Дата', render: (row) => formatDateTime(row.started_at) },
    { key: 'attempt', header: 'Попытка', render: (row) => `#${row.attempt_num}` },
    { key: 'score', header: 'Балл', render: (row) => `${formatPercent(row.score_pct)} · ${formatScore(row.total_score, row.max_score)}` },
    { key: 'duration', header: 'Время', render: (row) => formatDuration(row.duration_sec) },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => <Badge variant={statusVariants[row.status]}>{statusLabels[row.status]}</Badge>,
    },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <Link className="font-semibold text-royal-ink hover:text-cyan-ink" to={`/student/attempts/${row.id}/result`}>
          Открыть
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-royal-ink">S-5 Results history</p>
        <h1 className="text-3xl font-bold text-fg">Мои результаты</h1>
      </header>

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <SelectField label="Дата" value={dateFilter} onChange={(value) => setDateFilter(value as DateFilter)}>
            <option value="all">Все даты</option>
            <option value="7">Последние 7 дней</option>
            <option value="30">Последние 30 дней</option>
          </SelectField>
          <SelectField label="Статус" value={status} onChange={(value) => setStatus(value as StatusFilter)}>
            <option value="all">Все статусы</option>
            <option value="completed">Завершённые</option>
            <option value="in_progress">В процессе</option>
            <option value="abandoned">Прерванные</option>
          </SelectField>
          <SelectField label="Сценарий" value={scenarioId} onChange={setScenarioId}>
            <option value="all">Все сценарии</option>
            {scenarios.map(([id, title]) => <option key={id} value={id}>{title} · фильтр</option>)}
          </SelectField>
          <SelectField label="Сортировка" value={sort} onChange={(value) => setSort(value as SortMode)}>
            <option value="date_desc">Сначала новые</option>
            <option value="score_desc">По баллу</option>
            <option value="duration_asc">По времени</option>
          </SelectField>
        </div>
      </Card>

      <Table
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        isLoading={attempts.isLoading}
        error={attempts.isError ? 'Не удалось загрузить результаты.' : null}
        emptyMessage="Нет попыток под выбранные фильтры"
      />
    </div>
  );
}