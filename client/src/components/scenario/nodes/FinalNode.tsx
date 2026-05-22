import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

const resultLabels: Record<string, string> = {
  correct: 'верно',
  incorrect: 'неверно',
  partial: 'частично',
};

function finalTone(result: unknown) {
  if (result === 'correct') return 'success';
  if (result === 'incorrect') return 'danger';
  return 'warning';
}

function FinalNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  const resultType = String(data.result_type ?? 'partial');
  return (
    <NodeView
      icon="nodeFinal"
      selected={selected}
      source={false}
      subtitle="Финальный узел"
      title={data.title}
      tone={finalTone(data.result_type)}
    >
      {resultLabels[resultType] ?? resultType}
    </NodeView>
  );
}

export const FinalNode = memo(FinalNodeComponent);
export default FinalNode;
