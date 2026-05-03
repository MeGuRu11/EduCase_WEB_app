import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scenariosApi, type ScenarioListParams } from '@/api/scenarios';
import type { GraphIn, ScenarioCreate, ScenarioUpdate } from '@/types/scenario';

export const scenarioKeys = {
  all: ['scenarios'] as const,
  detail: (id: number) => [...scenarioKeys.all, id] as const,
  list: (params: ScenarioListParams = {}) => [...scenarioKeys.all, 'list', params.status ?? 'all'] as const,
};

export function useScenarios(params: ScenarioListParams = {}) {
  return useQuery({
    queryFn: () => scenariosApi.list(params),
    queryKey: scenarioKeys.list(params),
  });
}

export function useScenario(id: number | null) {
  return useQuery({
    enabled: id !== null,
    queryFn: () => scenariosApi.get(id as number),
    queryKey: id === null ? [...scenarioKeys.all, 'missing'] : scenarioKeys.detail(id),
  });
}

export function useCreateScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScenarioCreate) => scenariosApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}

export function useUpdateScenario(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScenarioUpdate) => scenariosApi.update(id, payload),
    onSuccess: (scenario) => {
      queryClient.setQueryData(scenarioKeys.detail(id), scenario);
      queryClient.invalidateQueries({ queryKey: scenarioKeys.list() });
    },
  });
}

export function useSaveScenarioGraph(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (graph: GraphIn) => scenariosApi.saveGraph(id, graph),
    onSuccess: (scenario) => {
      queryClient.setQueryData(scenarioKeys.detail(id), scenario);
      queryClient.invalidateQueries({ queryKey: scenarioKeys.list() });
    },
  });
}

export function useDuplicateScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => scenariosApi.duplicate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}

export function useArchiveScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => scenariosApi.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => scenariosApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}
