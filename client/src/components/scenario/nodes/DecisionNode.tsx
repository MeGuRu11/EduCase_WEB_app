import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function DecisionNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  const options = Array.isArray(data.options) ? data.options.length : 0;
  return (
    <NodeView icon="nodeDecision" selected={selected} subtitle="Узел решения" title={data.title} tone="decision">
      {options} вариантов
    </NodeView>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
export default DecisionNode;
