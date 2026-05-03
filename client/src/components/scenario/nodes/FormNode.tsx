import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function FormNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  const fields = Array.isArray(data.fields) ? data.fields.length : 0;
  return (
    <NodeView icon="nodeForm" selected={selected} subtitle="Form node" title={data.title} tone="form">
      {fields} fields
    </NodeView>
  );
}

export const FormNode = memo(FormNodeComponent);
export default FormNode;
