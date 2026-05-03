import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function finalTone(result: unknown) {
  if (result === 'correct') return 'success';
  if (result === 'incorrect') return 'danger';
  return 'warning';
}

function FinalNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  return (
    <NodeView
      icon="nodeFinal"
      selected={selected}
      source={false}
      subtitle="Final node"
      title={data.title}
      tone={finalTone(data.result_type)}
    >
      {String(data.result_type ?? 'partial')}
    </NodeView>
  );
}

export const FinalNode = memo(FinalNodeComponent);
export default FinalNode;
