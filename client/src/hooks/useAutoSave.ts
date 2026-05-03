import { useEffect, useState } from 'react';
import { scenariosApi } from '@/api/scenarios';
import { useScenarioEditorStore } from '@/stores/scenarioEditorStore';
import type { GraphIn, ScenarioFullOut } from '@/types/scenario';

const AUTO_SAVE_DELAY_MS = 30_000;

export interface UseAutoSaveOptions {
  scenarioId: number;
  saveGraph?: (graph: GraphIn) => Promise<ScenarioFullOut>;
}

export function useAutoSave({ scenarioId, saveGraph }: UseAutoSaveOptions) {
  const isDirty = useScenarioEditorStore((state) => state.isDirty);
  const revision = useScenarioEditorStore((state) => state.revision);
  const toGraphIn = useScenarioEditorStore((state) => state.toGraphIn);
  const markSaved = useScenarioEditorStore((state) => state.markSaved);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useScenarioEditorStore.getState().isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!isDirty) return undefined;
    const timeout = window.setTimeout(() => {
      setIsSaving(true);
      setError(null);
      const graph = toGraphIn();
      const startRevision = useScenarioEditorStore.getState().revision;
      const runner = saveGraph ?? ((payload: GraphIn) => scenariosApi.saveGraph(scenarioId, payload));
      void runner(graph)
        .then(() => markSaved(undefined, startRevision))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Autosave failed'))
        .finally(() => setIsSaving(false));
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [isDirty, markSaved, revision, saveGraph, scenarioId, toGraphIn]);

  return {
    error,
    isSaving,
    lastSaveAt: useScenarioEditorStore((state) => state.lastSaveAt),
  };
}
