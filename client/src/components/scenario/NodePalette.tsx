import type { DragEvent } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useScenarioEditorStore } from '@/stores/scenarioEditorStore';
import type { NodeType } from '@/types/scenario';

interface PaletteItem {
  type: NodeType;
  label: string;
  icon: IconName;
  tone: string;
}

const items: PaletteItem[] = [
  { icon: 'nodeStart', label: 'Start', tone: 'text-success-ink bg-success/10 border-success/30', type: 'start' },
  { icon: 'nodeData', label: 'Data', tone: 'text-cyan-ink bg-sky/20 border-sky/40', type: 'data' },
  { icon: 'nodeDecision', label: 'Decision', tone: 'text-royal-ink bg-royal/10 border-royal/30', type: 'decision' },
  { icon: 'nodeForm', label: 'Form', tone: 'text-purple-ink bg-purple/10 border-purple/30', type: 'form' },
  { icon: 'nodeText', label: 'Text input', tone: 'text-cyan-ink bg-cyan/15 border-cyan/40', type: 'text_input' },
  { icon: 'nodeFinal', label: 'Final', tone: 'text-warning-ink bg-warning/10 border-warning/30', type: 'final' },
];

function onDragStart(event: DragEvent<HTMLButtonElement>, type: NodeType) {
  event.dataTransfer.setData('application/reactflow', type);
  event.dataTransfer.effectAllowed = 'move';
}

export function NodePalette() {
  const addNode = useScenarioEditorStore((state) => state.addNode);
  const nodesCount = useScenarioEditorStore((state) => state.nodes.length);

  const addFromKeyboard = (type: NodeType) => {
    addNode(type, { x: 80 + (nodesCount % 4) * 40, y: 80 + nodesCount * 36 });
  };

  return (
    <aside className="h-full border-r border-border bg-bg p-4" aria-label="Node palette">
      <h2 className="mb-3 text-sm font-semibold text-fg">Node palette</h2>
      <p className="mb-3 text-xs text-fg-muted">Drag to canvas or press Enter to add a node.</p>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.type}
            type="button"
            draggable
            onClick={() => addFromKeyboard(item.type)}
            onDragStart={(event) => onDragStart(event, item.type)}
            className={`focus-ring flex w-full cursor-grab items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium ${item.tone}`}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export default NodePalette;
