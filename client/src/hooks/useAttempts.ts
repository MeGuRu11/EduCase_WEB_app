import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, type MyAttemptsParams } from '@/api/attempts';
import type { AttemptStart, StepSubmit } from '@/types/attempt';

export const attemptKeys = {
  all: ['attempts'] as const,
  detail: (id: number) => [...attemptKeys.all, id] as const,
  list: (params: MyAttemptsParams = {}) => [...attemptKeys.all, 'my', params.scenarioId ?? 'all'] as const,
  timer: (id: number) => [...attemptKeys.detail(id), 'time'] as const,
};

export function useMyAttempts(params: MyAttemptsParams = {}) {
  return useQuery({
    queryFn: () => attemptsApi.listMine(params),
    queryKey: attemptKeys.list(params),
  });
}

export function useAttempt(attemptId: number | null) {
  return useQuery({
    enabled: attemptId !== null,
    queryFn: () => attemptsApi.get(attemptId as number),
    queryKey: attemptId === null ? [...attemptKeys.all, 'missing'] : attemptKeys.detail(attemptId),
  });
}

export function useStartAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AttemptStart) => attemptsApi.start(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attemptKeys.all }),
  });
}

export function useSubmitStep(attemptId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StepSubmit) => attemptsApi.submitStep(attemptId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attemptKeys.detail(attemptId) });
      queryClient.invalidateQueries({ queryKey: attemptKeys.list() });
    },
  });
}

export function useFinishAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: number) => attemptsApi.finish(attemptId),
    onSuccess: (attempt) => {
      queryClient.setQueryData(attemptKeys.detail(attempt.id), attempt);
      queryClient.invalidateQueries({ queryKey: attemptKeys.list() });
    },
  });
}

export function useAbandonAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: number) => attemptsApi.abandon(attemptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attemptKeys.all }),
  });
}

export function useTimeRemaining(attemptId: number | null) {
  return useQuery({
    enabled: attemptId !== null,
    queryFn: () => attemptsApi.timeRemaining(attemptId as number),
    queryKey: attemptId === null ? [...attemptKeys.all, 'timer-missing'] : attemptKeys.timer(attemptId),
    refetchInterval: 30_000,
  });
}
