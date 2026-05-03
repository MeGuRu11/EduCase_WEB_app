import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function TextInputNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  const keywords = Array.isArray(data.keywords) ? data.keywords.length : 0;
  return (
    <NodeView icon="nodeText" selected={selected} subtitle="Text input node" title={data.title} tone="text">
      {keywords} keywords
    </NodeView>
  );
}

export const TextInputNode = memo(TextInputNodeComponent);
export default TextInputNode;
