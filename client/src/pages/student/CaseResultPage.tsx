import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, type TableColumn } from '@/components/ui/Table';
import PathVisualization from '@/components/player/PathVisualization';
import { useAttempt } from '@/hooks/useAttempts';
import { STEP_RESULT_CHECK_KEY, type AttemptResultOut, type StepResultOut } from '@/types/attempt';

function formatDuration(seconds: number | null) {
  if (seconds === null) return 'Нет данных';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}м ${rest}с`;
}

function stepStatus(step: StepResultOut) {
  const value = step[STEP_RESULT_CHECK_KEY];
  if (value === true) return <Badge variant="success">Верно</Badge>;
  if (value === false) return <Badge variant="danger">Ошибка</Badge>;
  return <Badge variant="neutral">Просмотр</Badge>;
}

const columns: TableColumn<StepResultOut>[] = [
  { header: 'Этап', key: 'node_title' },
  { header: 'Тип', key: 'node_type' },
  {
    header: 'Проверка',
    key: 'check',
    render: stepStatus,
  },
  {
    header: 'Баллы',
    key: 'score',
    render: (step) => `+${step.score_received} / ${step.max_score}`,
  },
  {
    header: 'Feedback',
    key: 'feedback',
    render: (step) => step.feedback ?? '',
  },
];

function ResultSummary({ result }: { result: AttemptResultOut }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded-lg border border-border bg-bg p-4">
        <p className="text-xs text-fg-muted">Score</p>
        <p className="text-3xl font-bold text-fg">{result.score_pct}%</p>
      </div>
      <div className="rounded-lg border border-border bg-bg p-4">
        <p className="text-xs text-fg-muted">Баллы</p>
        <p className="text-2xl font-semibold text-fg">
          {result.total_score} / {result.max_score}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-bg p-4">
        <p className="text-xs text-fg-muted">Duration</p>
        <p className="text-2xl font-semibold text-fg">{formatDuration(result.duration_sec)}</p>
      </div>
      <div className="rounded-lg border border-border bg-bg p-4">
        <p className="text-xs text-fg-muted">Status</p>
        <div className="mt-2">
          <Badge variant={result.passed ? 'success' : 'danger'}>{result.passed ? 'Passed' : 'Failed'}</Badge>
        </div>
      </div>
    </div>
  );
}

export default function CaseResultPage() {
  const attemptId = Number(useParams().id);
  const attempt = useAttempt(Number.isFinite(attemptId) ? attemptId : null);

  if (attempt.isLoading) {
    return <Table columns={columns} data={[]} getRowKey={(row) => row.step_id} isLoading />;
  }

  if (attempt.isError || !attempt.data) {
    return (
      <EmptyState
        icon="warn"
        title="Результат не найден"
        description="Попытка недоступна или была удалена."
        action={{ href: '/student/results', label: 'К результатам' }}
      />
    );
  }

  const result = attempt.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-bg p-5">
        <div>
          <p className="text-sm font-medium text-royal">Попытка {result.attempt_num}</p>
          <h1 className="text-3xl font-bold text-fg">{result.scenario_title}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            className="focus-ring inline-flex h-10 items-center rounded border border-royal bg-bg px-4 text-sm font-medium text-royal hover:bg-royal/5"
            to={`/student/cases/${result.scenario_id}/play`}
          >
            Попытка {result.attempt_num}
          </Link>
          <Button onClick={() => window.print()}>Export PDF</Button>
        </div>
      </header>

      <ResultSummary result={result} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Шаги</h2>
        <Table columns={columns} data={result.steps} getRowKey={(row) => row.step_id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-fg">Path visualization</h2>
        <PathVisualization path={result.path} />
      </section>
    </div>
  );
}
