import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function TextInputNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  const keywords = Array.isArray(data.keywords) ? data.keywords.length : 0;
  return (
    <NodeView icon="nodeText" selected={selected} subtitle="Узел текста" title={data.title} tone="text">
      {keywords} ключевых слов
    </NodeView>
  );
}

export const TextInputNode = memo(TextInputNodeComponent);
export default TextInputNode;
