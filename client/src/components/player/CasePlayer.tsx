import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStartAttempt, useSubmitStep, useFinishAttempt } from '@/hooks/useAttempts';
import { useCasePlayerStore } from '@/stores/casePlayerStore';
import type { StepAction, StepSubmit } from '@/types/attempt';
import { DataView } from './DataView';
import { DecisionView } from './DecisionView';
import { FormView } from './FormView';
import { TextInputView } from './TextInputView';
import { ProgressBar } from './ProgressBar';
import { ServerTimer } from './ServerTimer';

export interface CasePlayerProps {
  scenarioId: number;
}

export function CasePlayer({ scenarioId }: CasePlayerProps) {
  const navigate = useNavigate();
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

  const submitStep = useSubmitStep(attemptId);
  const finish = useFinishAttempt(attemptId);

  const expiresAt = start.data?.expires_at ?? null;

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

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
    if (!currentNode || attemptId == null) return;
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
      if (attemptId != null) goToResult(attemptId);
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

  if (start.isPending) {
    return <Skeleton rows={4} label="Loading case" />;
  }
  if (start.isError || !currentNode) {
    return (
      <EmptyState
        icon="warn"
        title="Case unavailable"
        description="Could not start this case. Try again later."
      />
    );
  }

  const totalNodes = Math.max(pathSoFar.length, 1);

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
        <div>
          <p className="text-sm text-fg-muted">Case in progress</p>
          <p className="text-sm text-fg">Step {pathSoFar.length}</p>
        </div>
        {attemptId != null ? (
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
            <button
              type="button"
              className="rounded bg-royal px-4 py-2 text-white"
              onClick={() => attemptId != null && goToResult(attemptId)}
            >
              Перейти к результату
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default CasePlayer;
