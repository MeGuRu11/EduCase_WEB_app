import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMyAttempts } from '@/hooks/useAttempts';
import { useScenarios } from '@/hooks/useScenarios';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/utils/formatters';
import type { AttemptSummaryOut } from '@/types/attempt';
import type { ScenarioListOut, ScenarioStatus } from '@/types/scenario';

type CaseStatusFilter = ScenarioStatus | 'all';

const statusLabels: Record<ScenarioStatus, string> = {
  archived: 'Архив',
  draft: 'Черновик',
  published: 'Опубликован',
};

const statusVariants: Record<ScenarioStatus, BadgeVariant> = {
  archived: 'neutral',
  draft: 'neutral',
  published: 'info',
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

function latestAttemptFor(scenarioId: number, attempts: AttemptSummaryOut[]) {
  return attempts
    .filter((attempt) => attempt.scenario_id === scenarioId)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
}

function CaseActions({ attempt, scenario }: { attempt?: AttemptSummaryOut; scenario: ScenarioListOut }) {
  if (scenario.status === 'archived') {
    return (
      <Link className="focus-ring rounded bg-lavender/40 px-3 py-2 text-sm font-medium text-fg-muted" to="/student/results">
        Результат
      </Link>
    );
  }

  if (attempt?.status === 'in_progress') {
    return (
      <div className="flex flex-wrap gap-2">
        <Link className="focus-ring rounded bg-royal-ink px-3 py-2 text-sm font-medium text-white hover:bg-cyan-ink" to={`/student/cases/${scenario.id}/play`}>
          Продолжить
        </Link>
        <Link className="focus-ring rounded border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface" to="/student/results">
          Результат
        </Link>
      </div>
    );
  }

  if (attempt) {
    return (
      <Link className="focus-ring rounded bg-purple-ink px-3 py-2 text-sm font-medium text-white hover:bg-purple-ink/90" to="/student/results">
        Результат
      </Link>
    );
  }

  return (
    <Link className="focus-ring rounded bg-royal-ink px-3 py-2 text-sm font-medium text-white hover:bg-cyan-ink" to={`/student/cases/${scenario.id}/play`}>
      Начать
    </Link>
  );
}

function CaseCard({ attempts, scenario }: { attempts: AttemptSummaryOut[]; scenario: ScenarioListOut }) {
  const latestAttempt = scenario.my_attempts_count > 0 ? latestAttemptFor(scenario.id, attempts) : undefined;

  return (
    <Card className={scenario.status === 'archived' ? 'opacity-70' : undefined}>
      <div className="mb-4 flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
        {scenario.cover_url ? (
          <img src={scenario.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="cases" className="h-12 w-12 text-royal-ink" />
        )}
      </div>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">{scenario.title}</h2>
            <p className="text-sm text-fg-muted">{scenario.disease_category ?? 'Без категории'}</p>
          </div>
          <Badge variant={statusVariants[scenario.status]}>{statusLabels[scenario.status]}</Badge>
        </div>
        <p className="line-clamp-2 text-sm text-fg-muted">{scenario.description ?? 'Описание не заполнено.'}</p>
        <div className="text-xs text-fg-muted">
          Попыток: {scenario.my_attempts_count} · Обновлено {formatDateTime(scenario.updated_at)}
        </div>
        <CaseActions scenario={scenario} attempt={latestAttempt} />
      </div>
    </Card>
  );
}

export default function MyCases() {
  const scenarios = useScenarios();
  const attempts = useMyAttempts();
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<CaseStatusFilter>('all');
  const [topic, setTopic] = useState('');

  const allScenarios = scenarios.data ?? [];
  const allAttempts = attempts.data ?? [];
  const categories = Array.from(new Set(allScenarios.map((scenario) => scenario.disease_category).filter(Boolean)));
  const filtered = allScenarios.filter((scenario) => {
    const matchesCategory = category === 'all' || scenario.disease_category === category;
    const matchesStatus = status === 'all' || scenario.status === status;
    const topicNeedle = topic.trim().toLocaleLowerCase('ru-RU');
    const matchesTopic =
      !topicNeedle ||
      scenario.title.toLocaleLowerCase('ru-RU').includes(topicNeedle) ||
      (scenario.description ?? '').toLocaleLowerCase('ru-RU').includes(topicNeedle);
    return matchesCategory && matchesStatus && matchesTopic;
  });

  if (scenarios.isLoading || attempts.isLoading) return <Skeleton rows={6} label="Loading table" />;

  if (scenarios.isError || attempts.isError) {
    return <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-4 text-danger-ink">Не удалось загрузить кейсы.</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-royal-ink">S-2 Assigned cases</p>
        <h1 className="text-3xl font-bold text-fg">Мои кейсы</h1>
      </header>

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField label="Дисциплина" value={category} onChange={setCategory}>
            <option value="all">Все дисциплины</option>
            {categories.map((item) => (
              <option key={item} value={item ?? ''}>{item}</option>
            ))}
          </SelectField>
          <label className="space-y-1 text-sm font-medium text-fg">
            <span>Тема</span>
            <input
              className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Название или описание"
            />
          </label>
          <SelectField label="Статус" value={status} onChange={(value) => setStatus(value as CaseStatusFilter)}>
            <option value="all">Все статусы</option>
            <option value="published">Опубликованные</option>
            <option value="draft">Черновики</option>
            <option value="archived">Архив</option>
          </SelectField>
        </div>
      </Card>

      {filtered.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Список кейсов">
          {filtered.map((scenario) => <CaseCard key={scenario.id} scenario={scenario} attempts={allAttempts} />)}
        </section>
      ) : (
        <EmptyState icon="cases" title="Нет кейсов под выбранные фильтры" description="Измените фильтры или проверьте назначенные сценарии." />
      )}
    </div>
  );
}