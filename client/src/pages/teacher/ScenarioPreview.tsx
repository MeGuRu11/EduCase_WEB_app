import { useNavigate, useParams } from 'react-router-dom';
import CasePlayer from '@/components/player/CasePlayer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useScenario } from '@/hooks/useScenarios';
import { ANSWER_EDGE_KEY, SENSITIVE_FORM_VALUE_KEY } from '@/stores/scenarioEditorStore';
import type { EdgeOut, JsonObject, NodeOut, ScenarioFullOut } from '@/types/scenario';

type TeacherFormField = JsonObject & {
  [SENSITIVE_FORM_VALUE_KEY]?: unknown;
};

type TeacherPreviewNode = NodeOut & {
  data: JsonObject & {
    fields?: TeacherFormField[];
    keywords?: string[];
  };
};

type TeacherPreviewEdge = EdgeOut & {
  data: JsonObject & {
    [ANSWER_EDGE_KEY]?: boolean;
    partial?: boolean;
    score_delta?: number;
  };
};

type TeacherScenarioFullOut = ScenarioFullOut & {
  nodes: TeacherPreviewNode[];
  edges: TeacherPreviewEdge[];
};

function fieldValues(node: TeacherPreviewNode) {
  const fields = Array.isArray(node.data.fields) ? node.data.fields : [];
  return fields
    .filter((field): field is JsonObject => Boolean(field) && typeof field === 'object')
    .map((field) => ({
      label: String(field.label ?? field.id ?? 'Поле'),
      value: field[SENSITIVE_FORM_VALUE_KEY],
    }))
    .filter((field) => field.value !== undefined);
}

function Insights({ nodes, edges }: { nodes: TeacherPreviewNode[]; edges: TeacherPreviewEdge[] }) {
  const formValues = nodes.flatMap(fieldValues);
  const textNodes = nodes.filter((node) => node.type === 'text_input');

  return (
    <aside className="space-y-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
      <div>
        <p className="text-sm font-semibold text-warning-ink">Подсказки преподавателя</p>
        <p className="text-xs text-fg-muted">Метаданные ответов, видны только преподавателю.</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">Переходы</p>
        {edges.map((edge) => (
          <div key={edge.id} className="flex items-center justify-between rounded bg-bg px-3 py-2 text-sm">
            <span>{edge.label ?? edge.id}</span>
            <Badge variant={edge.data[ANSWER_EDGE_KEY] ? 'success' : 'danger'}>
              {edge.data[ANSWER_EDGE_KEY] ? 'Верный путь' : 'Отвлекающий'}
            </Badge>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">Правильный ответ</p>
        {formValues.length ? (
          formValues.map((field) => (
            <div key={field.label} className="rounded bg-bg px-3 py-2 text-sm">
              <span className="text-fg-muted">{field.label}: </span>
              <span className="font-medium text-fg">{String(field.value)}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-fg-muted">Форм с ответами нет.</p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">Ключевые слова</p>
        {textNodes.length ? (
          textNodes.map((node) => (
            <div key={node.id} className="rounded bg-bg px-3 py-2 text-sm">
              {Array.isArray(node.data.keywords) ? node.data.keywords.join(', ') : 'Ключевые слова не заданы'}
            </div>
          ))
        ) : (
          <p className="text-sm text-fg-muted">Узлов с текстовым вводом нет.</p>
        )}
      </div>
    </aside>
  );
}

export default function ScenarioPreview() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const scenario = useScenario(Number.isFinite(id) ? id : null);

  if (scenario.isLoading) return <Skeleton rows={8} label="Загрузка..." />;
  if (scenario.isError || !scenario.data) {
    return (
      <EmptyState
        icon="warn"
        title="Предпросмотр недоступен"
        description="Сценарий не удалось загрузить."
        action={{ label: 'Назад к редактору', href: `/teacher/scenarios/${id}/edit` }}
      />
    );
  }

  const teacherScenario = scenario.data as TeacherScenarioFullOut;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-warning-ink">Режим предпросмотра — ответы не сохраняются</p>
          <h1 className="text-2xl font-bold text-fg">{scenario.data.title}</h1>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/teacher/scenarios/${id}/edit`)}>
          Выйти из предпросмотра
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main>
          <CasePlayer previewScenario={teacherScenario} />
        </main>
        <Insights nodes={teacherScenario.nodes} edges={teacherScenario.edges} />
      </div>
    </div>
  );
}
