import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function StartNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  return (
    <NodeView
      icon="nodeStart"
      selected={selected}
      source
      subtitle="Стартовый узел"
      target={false}
      title={data.title}
      tone="start"
    />
  );
}

export const StartNode = memo(StartNodeComponent);
export default StartNode;
