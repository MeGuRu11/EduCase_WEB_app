import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EdgeInspector } from '@/components/scenario/EdgeInspector';
import { NodeInspector } from '@/components/scenario/NodeInspector';
import { NodePalette } from '@/components/scenario/NodePalette';
import { ScenarioCanvas } from '@/components/scenario/ScenarioCanvas';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useSaveScenarioGraph, useScenario } from '@/hooks/useScenarios';
import { useScenarioEditorStore } from '@/stores/scenarioEditorStore';

function SaveIndicator({ isSaving, lastSaveAt }: { isSaving: boolean; lastSaveAt: string | null }) {
  if (isSaving) return <span className="text-sm font-medium text-warning-ink">● Сохранение...</span>;
  if (!lastSaveAt) return <span className="text-sm text-fg-muted">Нет сохранённых изменений</span>;
  return (
    <span className="text-sm font-medium text-success-ink">
      ✓ Сохранено {new Date(lastSaveAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function ScenarioEditorPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const scenarioQuery = useScenario(Number.isFinite(id) ? id : null);
  const saveMutation = useSaveScenarioGraph(id);
  const loadGraph = useScenarioEditorStore((state) => state.loadGraph);
  const toGraphIn = useScenarioEditorStore((state) => state.toGraphIn);
  const markSaved = useScenarioEditorStore((state) => state.markSaved);
  const selectedEdgeId = useScenarioEditorStore((state) => state.selectedEdgeId);
  const { error: autoSaveError, isSaving, lastSaveAt } = useAutoSave({
    scenarioId: id,
    saveGraph: (graph) => saveMutation.mutateAsync(graph),
  });

  useEffect(() => {
    if (scenarioQuery.data) loadGraph(scenarioQuery.data);
  }, [loadGraph, scenarioQuery.data]);

  if (scenarioQuery.isLoading) return <Skeleton rows={8} label="Загрузка..." />;
  if (scenarioQuery.isError || !scenarioQuery.data) {
    return (
      <EmptyState
        icon="warn"
        title="Конструктор недоступен"
        description="Сценарий не удалось загрузить."
        action={{ label: 'Назад к сценариям', href: '/teacher/scenarios' }}
      />
    );
  }

  const onManualSave = () => {
    const revision = useScenarioEditorStore.getState().revision;
    void saveMutation.mutateAsync(toGraphIn()).then(() => markSaved(undefined, revision));
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg px-4 py-3">
        <div>
          <p className="text-sm text-fg-muted">Конструктор сценария</p>
          <h1 className="text-2xl font-bold text-fg">{scenarioQuery.data.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator isSaving={isSaving || saveMutation.isPending} lastSaveAt={lastSaveAt} />
          {autoSaveError ? <span className="text-sm text-danger-ink">{autoSaveError}</span> : null}
          <Button variant="secondary" onClick={onManualSave} isLoading={saveMutation.isPending}>
            Сохранить
          </Button>
          <Button variant="accent" onClick={() => navigate(`/teacher/scenarios/${id}/preview`)}>
            Предпросмотр
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_340px] overflow-hidden rounded-xl border border-border bg-surface">
        <NodePalette />
        <main className="min-w-0 p-4">
          <ScenarioCanvas scenarioId={id} />
        </main>
        {selectedEdgeId ? <EdgeInspector /> : <NodeInspector />}
      </div>
    </div>
  );
}
