import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ScenarioEditorNode } from '@/stores/scenarioEditorStore';
import { NodeView } from './nodeView';

function DataNodeComponent({ data, selected }: NodeProps<ScenarioEditorNode>) {
  return (
    <NodeView icon="nodeData" selected={selected} subtitle="Data node" title={data.title} tone="data">
      HTML content
    </NodeView>
  );
}

export const DataNode = memo(DataNodeComponent);
export default DataNode;
