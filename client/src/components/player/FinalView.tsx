import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import PathVisualization from './PathVisualization';
import type { AttemptResultOut } from '@/types/attempt';
import type { NodeOut } from '@/types/scenario';

export interface FinalViewProps {
  attempt: AttemptResultOut;
  nodes?: NodeOut[];
  onExportPdf: () => void;
}

export default function FinalView({ attempt, nodes = [], onExportPdf }: FinalViewProps) {
  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-royal">Итог попытки</p>
          <h2 className="text-2xl font-semibold text-fg">{attempt.scenario_title}</h2>
        </div>
        <Badge variant={attempt.passed ? 'success' : 'danger'}>{attempt.passed ? 'Passed' : 'Failed'}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg p-4">
          <p className="text-xs text-fg-muted">Score</p>
          <p className="text-2xl font-semibold text-fg">{attempt.score_pct}%</p>
        </div>
        <div className="rounded-lg border border-border bg-bg p-4">
          <p className="text-xs text-fg-muted">Баллы</p>
          <p className="text-2xl font-semibold text-fg">
            {attempt.total_score} / {attempt.max_score}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg p-4">
          <p className="text-xs text-fg-muted">Длительность</p>
          <p className="text-2xl font-semibold text-fg">{attempt.duration_sec ?? 0}с</p>
        </div>
      </div>

      <PathVisualization nodes={nodes} path={attempt.path} />

      <div className="flex justify-end">
        <Button onClick={onExportPdf}>Export PDF</Button>
      </div>
    </article>
  );
}
