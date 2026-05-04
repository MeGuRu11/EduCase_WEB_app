import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/api/attempts';
import type { AttemptStart, StepSubmit } from '@/types/attempt';

export const attemptKeys = {
  all: ['attempts'] as const,
  detail: (id: number) => [...attemptKeys.all, id] as const,
  timer: (id: number) => [...attemptKeys.all, id, 'timer'] as const,
  listMy: (scenarioId?: number) => [...attemptKeys.all, 'my', scenarioId ?? 'all'] as const,
};

export function useStartAttempt() {
  return useMutation({ mutationFn: (payload: AttemptStart) => attemptsApi.start(payload) });
}

export function useSubmitStep(attemptId: number | null) {
  return useMutation({
    mutationFn: (payload: StepSubmit) => {
      if (attemptId == null) throw new Error('No active attempt');
      return attemptsApi.step(attemptId, payload);
    },
  });
}

export function useFinishAttempt(attemptId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (attemptId == null) throw new Error('No active attempt');
      return attemptsApi.finish(attemptId);
    },
    onSuccess: (result) => {
      if (attemptId != null) queryClient.setQueryData(attemptKeys.detail(attemptId), result);
    },
  });
}

export function useAttemptResult(attemptId: number | null) {
  return useQuery({
    enabled: attemptId != null,
    queryKey: attemptId == null ? [...attemptKeys.all, 'missing'] : attemptKeys.detail(attemptId),
    queryFn: () => attemptsApi.detail(attemptId as number),
  });
}

export function useMyAttempts(scenarioId?: number) {
  return useQuery({
    queryKey: attemptKeys.listMy(scenarioId),
    queryFn: () => attemptsApi.listMy(scenarioId),
  });
}
