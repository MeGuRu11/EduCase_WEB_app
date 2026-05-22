import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStartAttempt, useSubmitStep, useFinishAttempt } from '@/hooks/useAttempts';
import { useCasePlayerStore } from '@/stores/casePlayerStore';
import type { StepAction, StepOut, StepSubmit } from '@/types/attempt';
import type { EdgeOut, NodeOut, ScenarioFullOut } from '@/types/scenario';
import { DataView } from './DataView';
import { DecisionView } from './DecisionView';
import { FormView } from './FormView';
import { TextInputView } from './TextInputView';
import { ProgressBar } from './ProgressBar';
import { ServerTimer } from './ServerTimer';

const PREVIEW_ATTEMPT_ID = 0;

export interface CasePlayerProps {
  scenarioId?: number;
  previewScenario?: ScenarioFullOut;
}

function findStartNode(scenario: ScenarioFullOut): NodeOut | null {
  return scenario.nodes.find((node) => node.type === 'start') ?? scenario.nodes[0] ?? null;
}

function edgeTarget(scenario: ScenarioFullOut, edge: EdgeOut | undefined): NodeOut | null {
  if (!edge) return null;
  return scenario.nodes.find((node) => node.id === edge.target) ?? null;
}

function firstOutgoingEdge(scenario: ScenarioFullOut, nodeId: string): EdgeOut | undefined {
  return scenario.edges.find((edge) => edge.source === nodeId);
}

function selectedDecisionEdge(
  scenario: ScenarioFullOut,
  nodeId: string,
  answerData: Record<string, unknown>,
): EdgeOut | undefined {
  const selected = Array.isArray(answerData.option_ids) ? answerData.option_ids.map(String) : [];
  const outgoing = scenario.edges.filter((edge) => edge.source === nodeId);
  return (
    outgoing.find((edge) => selected.includes(String(edge.data.option_id ?? ''))) ??
    outgoing.find((edge) => selected.includes(edge.id)) ??
    outgoing[0]
  );
}

function previewNextNode(
  scenario: ScenarioFullOut,
  currentNode: NodeOut,
  action: StepAction,
  answerData: Record<string, unknown>,
): NodeOut | null {
  if (action === 'choose_option') {
    return edgeTarget(scenario, selectedDecisionEdge(scenario, currentNode.id, answerData));
  }
  return edgeTarget(scenario, firstOutgoingEdge(scenario, currentNode.id));
}

function makePreviewStep(
  scenario: ScenarioFullOut,
  currentNode: NodeOut,
  action: StepAction,
  answerData: Record<string, unknown>,
  pathSoFar: string[],
): StepOut {
  const nextNode = previewNextNode(scenario, currentNode, action, answerData);
  const path = pathSoFar.includes(currentNode.id) ? [...pathSoFar] : [...pathSoFar, currentNode.id];
  if (nextNode && !path.includes(nextNode.id)) path.push(nextNode.id);

  return {
    attempt_status: nextNode == null || nextNode.type === 'final' ? 'completed' : 'in_progress',
    next_node: nextNode,
    path_so_far: path,
    step_result: {
      details: {},
      feedback: 'Preview step recorded locally.',
      max_score: 0,
      score: 0,
    },
  };
}

export function CasePlayer({ scenarioId, previewScenario }: CasePlayerProps) {
  const navigate = useNavigate();
  const isPreview = previewScenario != null;
  const start = useStartAttempt();
  const attemptId = useCasePlayerStore((s) => s.attemptId);
  const currentNode = useCasePlayerStore((s) => s.currentNode);
  const lastFeedback = useCasePlayerStore((s) => s.lastFeedback);
  const pathSoFar = useCasePlayerStore((s) => s.pathSoFar);
  const status = useCasePlayerStore((s) => s.status);
  const setAttempt = useCasePlayerStore((s) => s.setAttempt);
  const applyStep = useCasePlayerStore((s) => s.applyStep);
  const advanceToPending = useCasePlayerStore((s) => s.advanceToPending);
  const clearFeedback = useCasePlayerStore((s) => s.clearFeedback);

  const submitStep = useSubmitStep(isPreview ? null : attemptId);
  const finish = useFinishAttempt(isPreview ? null : attemptId);

  const expiresAt = isPreview ? null : start.data?.expires_at ?? null;

  useEffect(() => {
    if (!isPreview || !previewScenario) return;
    const startNode = findStartNode(previewScenario);
    if (!startNode) return;
    setAttempt({
      attemptId: PREVIEW_ATTEMPT_ID,
      currentNode: startNode,
      status: 'in_progress',
    });
  }, [isPreview, previewScenario, setAttempt]);

  useEffect(() => {
    if (isPreview || scenarioId == null) return;
    if (start.isPending || start.isSuccess || start.isError) return;
    start.mutate(
      { scenario_id: scenarioId },
      {
        onSuccess: (data) => {
          setAttempt({
            attemptId: data.attempt_id,
            currentNode: data.current_node,
            status: 'in_progress',
          });
        },
      },
    );
  }, [isPreview, scenarioId, setAttempt, start]);

  const goToResult = useMemo(
    () => (id: number) => {
      navigate(`/student/attempts/${id}/result`, { replace: true });
    },
    [navigate],
  );

  const onStepError = (err: unknown) => {
    if (isAxiosError(err) && err.response?.status === 410 && attemptId != null) {
      goToResult(attemptId);
    }
  };

  const submit = (action: StepAction, answer_data: Record<string, unknown>) => {
    if (!currentNode) return;

    if (isPreview && previewScenario) {
      const previewStep = makePreviewStep(previewScenario, currentNode, action, answer_data, pathSoFar);
      applyStep(previewStep);
      if (action === 'view_data') advanceToPending();
      return;
    }

    if (attemptId == null) return;
    const payload: StepSubmit = {
      node_id: currentNode.id,
      action,
      answer_data,
      time_spent_sec: 0,
    };
    submitStep.mutate(payload, {
      onSuccess: (data) => applyStep(data),
      onError: onStepError,
    });
  };

  const advance = () => {
    if (!currentNode) return;
    if (status === 'completed') {
      if (!isPreview && attemptId != null) goToResult(attemptId);
      return;
    }
    if (lastFeedback) {
      advanceToPending();
      return;
    }
    if (currentNode.type === 'data' || currentNode.type === 'start') {
      submit('view_data', {});
    } else {
      clearFeedback();
    }
  };

  if (!isPreview && start.isPending) {
    return <Skeleton rows={4} label="Загрузка..." />;
  }
  if ((!isPreview && start.isError) || !currentNode) {
    return (
      <EmptyState
        icon="warn"
        title="Кейс недоступен"
        description="Не удалось запустить кейс. Попробуйте позже."
      />
    );
  }

  const totalNodes = Math.max(pathSoFar.length, 1);

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
        <div>
          <p className="text-sm text-fg-muted">{isPreview ? 'Предпросмотр' : 'Кейс в процессе'}</p>
          <p className="text-sm text-fg">Шаг {pathSoFar.length}</p>
        </div>
        {!isPreview && attemptId != null ? (
          <ServerTimer
            attemptId={attemptId}
            initialExpiresAt={expiresAt}
            onExpire={() => {
              if (attemptId != null) {
                finish.mutate(undefined, {
                  onSettled: () => goToResult(attemptId),
                });
              }
            }}
          />
        ) : null}
      </header>

      <ProgressBar current={pathSoFar.length} total={totalNodes + 2} />

      <main className="flex-1 rounded-xl border border-border bg-surface p-4">
        {currentNode.type === 'data' || currentNode.type === 'start' ? (
          <DataView node={currentNode} onNext={advance} />
        ) : currentNode.type === 'decision' ? (
          <DecisionView
            node={currentNode}
            feedback={lastFeedback}
            onSubmit={(selected) => submit('choose_option', { option_ids: selected })}
            onNext={advance}
            isSubmitting={submitStep.isPending}
          />
        ) : currentNode.type === 'form' ? (
          <FormView
            node={currentNode}
            feedback={lastFeedback}
            onSubmit={(values) => submit('submit_form', { values })}
            onNext={advance}
            isSubmitting={submitStep.isPending}
          />
        ) : currentNode.type === 'text_input' ? (
          <TextInputView
            node={currentNode}
            feedback={lastFeedback}
            onSubmit={(value) => submit('submit_text', { text: value })}
            onNext={advance}
            isSubmitting={submitStep.isPending}
          />
        ) : currentNode.type === 'final' ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">Кейс завершён.</p>
            {!isPreview ? (
              <button
                type="button"
                className="rounded bg-royal-ink px-4 py-2 text-white"
                onClick={() => attemptId != null && goToResult(attemptId)}
              >
                Перейти к результату
              </button>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default CasePlayer;