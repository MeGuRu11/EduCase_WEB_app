import type { ReactNode } from 'react';
import { Input } from '@/components/ui/Input';
import {
  ANSWER_EDGE_KEY,
  useScenarioEditorStore,
  type ScenarioEditorEdge,
} from '@/stores/scenarioEditorStore';
import type { JsonObject } from '@/types/scenario';

type EdgeLinkType = 'correct' | 'incorrect' | 'neutral';

const linkTypeOptions: Array<{ value: EdgeLinkType; label: string; hint: string }> = [
  { value: 'correct', label: 'Правильный путь', hint: 'Верный выбор — переход засчитывается как правильный.' },
  { value: 'incorrect', label: 'Неправильный путь', hint: 'Ошибочный выбор — переход помечается как неправильный.' },
  { value: 'neutral', label: 'Нейтральный переход', hint: 'Обычный переход без оценки правильности.' },
];

function linkTypeOf(data: ScenarioEditorEdge['data']): EdgeLinkType {
  if (data?.[ANSWER_EDGE_KEY] === true) return 'correct';
  if (data?.[ANSWER_EDGE_KEY] === false) return 'incorrect';
  return 'neutral';
}

function answerPatch(type: EdgeLinkType): JsonObject {
  if (type === 'correct') return { [ANSWER_EDGE_KEY]: true };
  if (type === 'incorrect') return { [ANSWER_EDGE_KEY]: false };
  return { [ANSWER_EDGE_KEY]: undefined };
}

function asObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === 'object')
    : [];
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg p-4">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

export function EdgeInspector() {
  const selectedEdgeId = useScenarioEditorStore((state) => state.selectedEdgeId);
  const edges = useScenarioEditorStore((state) => state.edges);
  const nodes = useScenarioEditorStore((state) => state.nodes);
  const updateEdgeData = useScenarioEditorStore((state) => state.updateEdgeData);

  const edge = edges.find((item) => item.id === selectedEdgeId);
  const sourceNode = edge ? nodes.find((node) => node.id === edge.source) : undefined;
  const isDecisionSource = sourceNode?.type === 'decision';
  const options = asObjectArray(sourceNode?.data.options);

  return (
    <aside className="h-full border-l border-border bg-surface p-4" aria-label="Инспектор">
      <h2 className="mb-3 text-sm font-semibold text-fg">Инспектор</h2>
      {edge ? (
        <div className="space-y-4">
          <Section title="Тип связи">
            <fieldset className="space-y-2">
              <legend className="sr-only">Тип связи</legend>
              {linkTypeOptions.map((option) => (
                <label key={option.value} className="flex items-start gap-2 text-sm text-fg">
                  <input
                    type="radio"
                    name="edge-link-type"
                    className="mt-1"
                    value={option.value}
                    checked={linkTypeOf(edge.data) === option.value}
                    onChange={() => updateEdgeData(edge.id, answerPatch(option.value))}
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-xs text-fg-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </Section>

          <Section title="Баллы за переход">
            <Input
              label="Баллы"
              type="number"
              value={String(edge.data?.score_delta ?? 0)}
              onChange={(event) => updateEdgeData(edge.id, { score_delta: Number(event.target.value) })}
              hint="Начисляется (или снимается при отрицательном значении) при переходе по связи."
            />
            {isDecisionSource ? (
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={Boolean(edge.data?.partial)}
                  onChange={(event) => updateEdgeData(edge.id, { partial: event.target.checked })}
                />
                Частичный балл
              </label>
            ) : null}
          </Section>

          {isDecisionSource ? (
            <Section title="Вариант ответа">
              <div className="space-y-1.5">
                <label htmlFor="edge-option" className="block text-sm font-medium text-fg">
                  Вариант ответа
                </label>
                <select
                  id="edge-option"
                  value={String(edge.data?.option_id ?? '')}
                  onChange={(event) =>
                    updateEdgeData(edge.id, { option_id: event.target.value || undefined })
                  }
                  className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
                >
                  <option value="">— не выбрано —</option>
                  {options.map((option, index) => {
                    const optionId = String(option.id ?? index);
                    return (
                      <option key={optionId} value={optionId}>
                        {String(option.label || optionId)}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-fg-muted">
                  Свяжите связь с вариантом ответа, иначе переход не сработает.
                </p>
              </div>
            </Section>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-bg p-4 text-sm text-fg-muted">
          Выберите связь для редактирования.
        </p>
      )}
    </aside>
  );
}

export default EdgeInspector;
