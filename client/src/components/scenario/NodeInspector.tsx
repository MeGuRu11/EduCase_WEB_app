import { useDeferredValue, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useScenarioEditorStore, type ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import type { JsonObject } from '@/types/scenario';

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function asObjectArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === 'object') : [];
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg p-4">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function Textarea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
      />
    </div>
  );
}

function CommonFields({ node }: { node: ScenarioEditorNode }) {
  const updateNode = useScenarioEditorStore((state) => state.updateNode);
  return (
    <Input
      label="Title"
      value={node.title}
      onChange={(event) => updateNode(node.id, { title: event.target.value })}
    />
  );
}

function DataInspector({ node }: { node: ScenarioEditorNode }) {
  const updateNodeData = useScenarioEditorStore((state) => state.updateNodeData);
  const html = String(node.data.html ?? '');
  const deferredHtml = useDeferredValue(html);
  return (
    <Section title="Content HTML">
      <Textarea label="Content HTML" value={html} onChange={(value) => updateNodeData(node.id, { html: value })} />
      <Input
        label="Attachments"
        value={asStringArray(node.data.attachments).join(', ')}
        onChange={(event) => updateNodeData(node.id, { attachments: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
        hint="Comma-separated file references"
      />
      <div>
        <p className="mb-1 text-sm font-medium text-fg">Preview</p>
        <div
          className="rounded border border-border bg-surface p-3 text-sm text-fg"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(deferredHtml) }}
        />
      </div>
    </Section>
  );
}

function DecisionInspector({ node }: { node: ScenarioEditorNode }) {
  const updateNodeData = useScenarioEditorStore((state) => state.updateNodeData);
  const options = asObjectArray(node.data.options);
  const setOptions = (nextOptions: JsonObject[]) => updateNodeData(node.id, { options: nextOptions });

  return (
    <Section title="Decision options">
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={Boolean(node.data.allow_multiple)}
          onChange={(event) => updateNodeData(node.id, { allow_multiple: event.target.checked })}
        />
        Allow multiple answers
      </label>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={Boolean(node.data.partial_credit)}
          onChange={(event) => updateNodeData(node.id, { partial_credit: event.target.checked })}
        />
        Partial credit
      </label>
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={String(option.id ?? index)} className="flex items-end gap-2">
            <Input
              label={`Option ${index + 1}`}
              value={String(option.label ?? '')}
              onChange={(event) => {
                const next = [...options];
                next[index] = { ...next[index], label: event.target.value };
                setOptions(next);
              }}
            />
            <Button variant="ghost" onClick={() => setOptions(options.filter((_, itemIndex) => itemIndex !== index))}>
              Remove option {index + 1}
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        onClick={() => setOptions([...options, { id: `option-${options.length + 1}`, label: '' }])}
      >
        Add option
      </Button>
    </Section>
  );
}

function FormInspector({ node }: { node: ScenarioEditorNode }) {
  const updateNodeData = useScenarioEditorStore((state) => state.updateNodeData);
  const fields = asObjectArray(node.data.fields);
  return (
    <Section title="Form template">
      <Input
        label="Form template"
        value={String(node.data.form_template_id ?? '')}
        onChange={(event) => updateNodeData(node.id, { form_template_id: event.target.value })}
      />
      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">Field scoring</p>
        {fields.length ? (
          fields.map((field, index) => (
            <Input
              key={String(field.id ?? index)}
              label={`${String(field.label ?? field.id ?? `Field ${index + 1}`)} score`}
              type="number"
              value={String(field.score_value ?? field.score ?? 0)}
              onChange={(event) => {
                const next = [...fields];
                next[index] = { ...next[index], score_value: Number(event.target.value) };
                updateNodeData(node.id, { fields: next });
              }}
            />
          ))
        ) : (
          <p className="text-sm text-fg-muted">No fields configured yet.</p>
        )}
      </div>
    </Section>
  );
}

function TextInputInspector({ node }: { node: ScenarioEditorNode }) {
  const updateNodeData = useScenarioEditorStore((state) => state.updateNodeData);
  return (
    <Section title="Keywords">
      <Input
        label="Keywords"
        value={asStringArray(node.data.keywords).join(', ')}
        onChange={(event) => updateNodeData(node.id, { keywords: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
      />
      <Textarea
        label="Synonyms"
        value={JSON.stringify(node.data.synonyms ?? {}, null, 2)}
        onChange={(value) => updateNodeData(node.id, { synonyms_text: value })}
      />
      <Input
        label="Minimum length"
        type="number"
        value={String(node.data.min_length ?? 1)}
        onChange={(event) => updateNodeData(node.id, { min_length: Number(event.target.value) })}
      />
    </Section>
  );
}

function FinalInspector({ node }: { node: ScenarioEditorNode }) {
  const updateNodeData = useScenarioEditorStore((state) => state.updateNodeData);
  return (
    <Section title="Final result">
      <div className="space-y-1.5">
        <label htmlFor="result-type" className="block text-sm font-medium text-fg">
          Result type
        </label>
        <select
          id="result-type"
          value={String(node.data.result_type ?? 'partial')}
          onChange={(event) => updateNodeData(node.id, { result_type: event.target.value })}
          className="h-10 w-full rounded border border-border bg-bg px-3 text-sm text-fg focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/40"
        >
          <option value="correct">Correct</option>
          <option value="partial">Partial</option>
          <option value="incorrect">Incorrect</option>
        </select>
      </div>
    </Section>
  );
}

function ModeInspector({ node }: { node: ScenarioEditorNode }) {
  if (node.type === 'data') return <DataInspector node={node} />;
  if (node.type === 'decision') return <DecisionInspector node={node} />;
  if (node.type === 'form') return <FormInspector node={node} />;
  if (node.type === 'text_input') return <TextInputInspector node={node} />;
  if (node.type === 'final') return <FinalInspector node={node} />;
  return <Section title="Start node"><p className="text-sm text-fg-muted">Entry point of the case.</p></Section>;
}

export function NodeInspector() {
  const selectedNodeId = useScenarioEditorStore((state) => state.selectedNodeId);
  const node = useScenarioEditorStore((state) => state.nodes.find((item) => item.id === selectedNodeId));

  return (
    <aside className="h-full border-l border-border bg-surface p-4" aria-label="Inspector">
      <h2 className="mb-3 text-sm font-semibold text-fg">Inspector</h2>
      {node ? (
        <div className="space-y-4">
          <CommonFields node={node} />
          <ModeInspector node={node} />
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-bg p-4 text-sm text-fg-muted">
          Select a node to edit its configuration.
        </p>
      )}
    </aside>
  );
}

export default NodeInspector;
