import { useParams } from 'react-router-dom';
import { FinalView } from '@/components/player/FinalView';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAttemptResult } from '@/hooks/useAttempts';

export default function CaseResultPage() {
  const id = Number(useParams().id);
  const { data, isLoading, isError } = useAttemptResult(Number.isFinite(id) ? id : null);

  if (isLoading) return <Skeleton rows={6} label="Загрузка..." />;
  if (isError || !data) {
    return (
      <EmptyState
        icon="warn"
        title="Результат недоступен"
        description="Попытка не найдена."
        action={{ label: 'Мои результаты', href: '/student/results' }}
      />
    );
  }

  return (
    <div data-testid="case-result-page" className="space-y-4">
      <FinalView result={data} />
      <section className="rounded-xl border border-border bg-bg p-4">
        <h2 className="mb-2 text-lg font-semibold text-fg">Шаги</h2>
        {data.steps.length === 0 ? (
          <p className="text-sm text-fg-muted">Нет записанных шагов.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.steps.map((step) => (
              <li key={step.step_id} className="flex justify-between">
                <span className="text-fg">{step.node_title}</span>
                <span className="text-fg-muted">
                  {step.score_received}/{step.max_score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
