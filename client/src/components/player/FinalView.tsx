import { Badge } from '@/components/ui/Badge';
import type { AttemptResultOut } from '@/types/attempt';

export interface FinalViewProps {
  result: AttemptResultOut;
}

function formatDuration(sec: number | null) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function FinalView({ result }: FinalViewProps) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-bg p-6">
      <Badge data-testid="final-badge" variant={result.passed ? 'success' : 'danger'}>
        {result.passed ? 'Passed' : 'Failed'}
      </Badge>
      <h2 className="text-2xl font-bold text-fg">{result.scenario_title}</h2>
      <p className="text-sm text-fg-muted">Попытка #{result.attempt_num}</p>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <dt>Баллы</dt>
          <dd className="font-medium text-fg">
            {result.total_score}/{result.max_score}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Длительность</dt>
          <dd className="font-medium text-fg">{formatDuration(result.duration_sec)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Шагов</dt>
          <dd className="font-medium text-fg">{result.path.length}</dd>
        </div>
      </dl>
    </section>
  );
}

export default FinalView;
