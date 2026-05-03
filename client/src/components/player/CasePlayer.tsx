import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { attemptsApi } from '@/api/attempts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { notify } from '@/components/ui/Toast';
import { useStartAttempt, useSubmitStep } from '@/hooks/useAttempts';
import DataView from './DataView';
import DecisionView from './DecisionView';
import FinalView from './FinalView';
import FormView from './FormView';
import ProgressBar from './ProgressBar';
import ServerTimer from './ServerTimer';
import TextInputView from './TextInputView';
import type { AttemptResultOut, AttemptStartOut, StepAction, StepOut } from '@/types/attempt';
import type { JsonObject, NodeOut, ScenarioFullOut } from '@/types/scenario';

export interface CasePlayerProps {
  previewScenario?: ScenarioFullOut;
  scenarioId?: number;
}

function errorStatus(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status;
}

function actionForNode(type: NodeOut['type']): StepAction {
  if (type === 'decision') return 'choose_option';
  if (type === 'form') return 'submit_form';
  if (type === 'text_input') return 'submit_text';
  return 'view_data';
}

function previewAttempt(currentNode: NodeOut): AttemptStartOut {
  return {
    attempt_id: 0,
    attempt_num: 1,
    current_node: currentNode,
    expires_at: null,
    resumed: false,
    started_at: new Date().toISOString(),
    time_limit_min: null,
  };
}

function nextPreviewNode(scenario: ScenarioFullOut, currentNodeId: string) {
  const edge = scenario.edges.find((item) => item.source === currentNodeId);
  return scenario.nodes.find((item) => item.id === edge?.target) ?? null;
}

function previewStep(scenario: ScenarioFullOut, currentNode: NodeOut, path: string[]): StepOut {
  const nextNode = currentNode.type === 'final' ? null : nextPreviewNode(scenario, currentNode.id);
  return {
    attempt_status: nextNode ? 'in_progress' : 'completed',
    next_node: nextNode,
    path_so_far: [...path, currentNode.id],
    step_result: {
      details: {},
      feedback: 'Preview navigation only. No answer is saved.',
      max_score: 0,
      score: 0,
    },
  };
}

function NavigationPanel({ currentNode, path }: { currentNode: NodeOut | null; path: string[] }) {
  const rows = [...path, currentNode?.id].filter(Boolean) as string[];
  return (
    <aside className="space-y-4 rounded-xl border border-border bg-bg p-4">
      <div>
        <p className="text-sm font-semibold text-fg">Навигация</p>
        <p className="text-xs text-fg-muted">Прогресс по этапам кейса</p>
      </div>
      <ol className="space-y-2">
        {rows.length ? (
          rows.map((id, index) => (
            <li className="flex items-center gap-2 text-sm text-fg" key={`${id}-${index}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-royal/10 text-xs font-semibold text-royal">
                {index + 1}
              </span>
              <span className={id === currentNode?.id ? 'font-semibold text-fg' : 'text-fg-muted'}>{id}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-fg-muted">Этапы появятся после старта.</li>
        )}
      </ol>
    </aside>
  );
}

export default function CasePlayer({ previewScenario, scenarioId }: CasePlayerProps) {
  const navigate = useNavigate();
  const startAttempt = useStartAttempt();
  const [attempt, setAttempt] = useState<AttemptStartOut | null>(null);
  const [currentNode, setCurrentNode] = useState<NodeOut | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [finalResult, setFinalResult] = useState<AttemptResultOut | null>(null);
  const stepStartedAtRef = useRef(Date.now());
  const submitStep = useSubmitStep(attempt?.attempt_id ?? 0);
  const isPreview = Boolean(previewScenario);

  useEffect(() => {
    if (previewScenario) {
      const start = previewScenario.nodes.find((node) => node.type === 'start') ?? previewScenario.nodes[0] ?? null;
      if (!start) return;
      setAttempt(previewAttempt(start));
      setCurrentNode(start);
      setPath([]);
      return;
    }

    if (!scenarioId) return;
    startAttempt.mutate(
      { scenario_id: scenarioId },
      {
        onError: () => notify.error('Не удалось начать попытку'),
        onSuccess: (started) => {
          setAttempt(started);
          setCurrentNode(started.current_node);
          setPath([]);
          stepStartedAtRef.current = Date.now();
        },
      },
    );
  }, [previewScenario, scenarioId]);

  const advance = (nextNode: NodeOut | null, result: StepOut) => {
    setPath(result.path_so_far);
    if (!nextNode || result.attempt_status === 'completed') {
      if (attempt && !isPreview) {
        navigate(`/student/attempts/${attempt.attempt_id}/result`);
      }
      return;
    }
    setCurrentNode(nextNode);
    stepStartedAtRef.current = Date.now();
  };

  const submitCurrentStep = async (answerData: JsonObject): Promise<StepOut> => {
    if (!currentNode || !attempt) throw new Error('Attempt is not ready');

    if (previewScenario) {
      return previewStep(previewScenario, currentNode, path);
    }

    try {
      return await submitStep.mutateAsync({
        action: actionForNode(currentNode.type),
        answer_data: answerData,
        node_id: currentNode.id,
        time_spent_sec: Math.max(0, Math.round((Date.now() - stepStartedAtRef.current) / 1_000)),
      });
    } catch (error) {
      if (errorStatus(error) === 410) {
        navigate(`/student/attempts/${attempt.attempt_id}/result`);
        return {
          attempt_status: 'completed',
          next_node: null,
          path_so_far: path,
          step_result: { details: {}, feedback: 'Время истекло', max_score: 0, score: 0 },
        };
      }
      throw error;
    }
  };

  const continueData = async () => {
    const result = await submitCurrentStep({});
    advance(result.next_node, result);
  };

  const finishAttempt = async () => {
    if (!attempt) return;
    if (isPreview) {
      navigate('/teacher/scenarios');
      return;
    }
    const result = await attemptsApi.finish(attempt.attempt_id);
    setFinalResult(result);
  };

  const exportPdf = () => window.print();

  if (startAttempt.isPending && !attempt) return <Skeleton rows={8} label="Loading case player" />;
  if (!currentNode || !attempt) {
    return <EmptyState icon="cases" title="Кейс недоступен" description="Не удалось загрузить текущий этап." />;
  }

  if (finalResult) {
    return <FinalView attempt={finalResult} onExportPdf={exportPdf} nodes={previewScenario?.nodes} />;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg p-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={isPreview ? 'warning' : 'info'}>{isPreview ? 'Preview' : `Attempt ${attempt.attempt_num}`}</Badge>
            {attempt.resumed ? <Badge variant="accent">Resumed</Badge> : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-fg">{currentNode.title}</h1>
        </div>
        {attempt.expires_at ? (
          <ServerTimer
            attemptId={attempt.attempt_id}
            expiresAt={attempt.expires_at}
            initialRemainingSec={attempt.expires_at ? undefined : null}
          />
        ) : (
          <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-semibold text-fg-muted">
            Без лимита
          </div>
        )}
      </header>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <NavigationPanel currentNode={currentNode} path={path} />
        <main className="min-h-[520px] rounded-xl border border-border bg-bg p-6">
          {currentNode.type === 'decision' ? (
            <DecisionView node={currentNode} onAdvance={advance} onSubmit={submitCurrentStep} />
          ) : currentNode.type === 'form' ? (
            <FormView node={currentNode} onAdvance={advance} onSubmit={submitCurrentStep} />
          ) : currentNode.type === 'text_input' ? (
            <TextInputView node={currentNode} onAdvance={advance} onSubmit={submitCurrentStep} />
          ) : currentNode.type === 'final' ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-success">Финальный этап</p>
              <h2 className="text-2xl font-semibold text-fg">{currentNode.title}</h2>
              <Button onClick={finishAttempt}>Завершить попытку</Button>
            </div>
          ) : (
            <DataView node={currentNode} onContinue={continueData} />
          )}
        </main>
      </div>

      <ProgressBar currentNode={currentNode} path={path} />
    </div>
  );
}
