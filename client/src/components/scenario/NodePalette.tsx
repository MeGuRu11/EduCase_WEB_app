import type { DragEvent } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { NodeType } from '@/types/scenario';

interface PaletteItem {
  type: NodeType;
  label: string;
  icon: IconName;
  tone: string;
}

const items: PaletteItem[] = [
  { icon: 'nodeStart', label: 'Start', tone: 'text-success bg-success/10 border-success/30', type: 'start' },
  { icon: 'nodeData', label: 'Data', tone: 'text-cyan bg-sky/20 border-sky/40', type: 'data' },
  { icon: 'nodeDecision', label: 'Decision', tone: 'text-royal bg-royal/10 border-royal/30', type: 'decision' },
  { icon: 'nodeForm', label: 'Form', tone: 'text-purple bg-purple/10 border-purple/30', type: 'form' },
  { icon: 'nodeText', label: 'Text input', tone: 'text-cyan bg-cyan/15 border-cyan/40', type: 'text_input' },
  { icon: 'nodeFinal', label: 'Final', tone: 'text-warning bg-warning/10 border-warning/30', type: 'final' },
];

function onDragStart(event: DragEvent<HTMLButtonElement>, type: NodeType) {
  event.dataTransfer.setData('application/reactflow', type);
  event.dataTransfer.effectAllowed = 'move';
}

export function NodePalette() {
  return (
    <aside className="h-full border-r border-border bg-bg p-4" aria-label="Node palette">
      <h2 className="mb-3 text-sm font-semibold text-fg">Node palette</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.type}
            type="button"
            draggable
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
