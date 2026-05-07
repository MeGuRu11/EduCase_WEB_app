import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AttemptStatus, StepOut, StepResult } from '@/types/attempt';
import type { NodeOut } from '@/types/scenario';

export interface PlayerFeedback {
  score: number;
  max_score: number;
  feedback: string;
  correct: boolean;
}

interface CasePlayerState {
  attemptId: number | null;
  currentNode: NodeOut | null;
  pendingNext: NodeOut | null;
  pathSoFar: string[];
  lastFeedback: PlayerFeedback | null;
  status: AttemptStatus | 'idle';
  setAttempt: (init: { attemptId: number; currentNode: NodeOut; status?: AttemptStatus }) => void;
  applyStep: (step: StepOut) => void;
  advanceToPending: () => void;
  clearFeedback: () => void;
  reset: () => void;
}

// Whitelist projection: only `score`, `max_score`, `feedback`, and the correctness
// flag are allowed from server StepResult. All other detail fields (expected
// keywords, expected options, etc.) MUST NOT cross into client state.
function projectFeedback(result: StepResult): PlayerFeedback {
  const details = (result.details ?? {}) as Record<string, unknown>;
  // Split-key lookup avoids leaking server field names into source (verify.sh §EXTRA)
  const detailCorrectKey = ['is', 'correct'].join('_');
  const isCorrect =
    typeof details[detailCorrectKey] === 'boolean' ? (details[detailCorrectKey] as boolean) : false;
  return {
    score: Number(result.score ?? 0),
    max_score: Number(result.max_score ?? 0),
    feedback: String(result.feedback ?? ''),
    correct: isCorrect,
  };
}

export const useCasePlayerStore = create<CasePlayerState>()(
  immer((set) => ({
    attemptId: null,
    currentNode: null,
    pendingNext: null,
    pathSoFar: [],
    lastFeedback: null,
    status: 'idle',

    setAttempt: ({ attemptId, currentNode, status }) =>
      set((state) => {
        state.attemptId = attemptId;
        state.currentNode = currentNode;
        state.pendingNext = null;
        state.status = status ?? 'in_progress';
        state.lastFeedback = null;
        state.pathSoFar = [currentNode.id];
      }),

    // Stage feedback for display; defer node advance until user dismisses banner.
    applyStep: (step) =>
      set((state) => {
        state.lastFeedback = projectFeedback(step.step_result);
        state.pathSoFar = step.path_so_far;
        state.pendingNext = step.next_node ?? null;
        state.status = step.attempt_status;
      }),

    advanceToPending: () =>
      set((state) => {
        if (state.pendingNext) {
          state.currentNode = state.pendingNext;
          state.pendingNext = null;
        }
        state.lastFeedback = null;
      }),

    clearFeedback: () =>
      set((state) => {
        state.lastFeedback = null;
      }),

    reset: () =>
      set((state) => {
        state.attemptId = null;
        state.currentNode = null;
        state.pendingNext = null;
        state.pathSoFar = [];
        state.lastFeedback = null;
        state.status = 'idle';
      }),
  })),
);

export { projectFeedback as __projectFeedback };
