import { useMemo } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import type { NodeOut } from '@/types/scenario';

export interface PathVisualizationProps {
  path: string[];
  nodes?: NodeOut[];
}

export function PathVisualization({ nodes = [], path }: PathVisualizationProps) {
  const nodeTitles = useMemo(() => new Map(nodes.map((node) => [node.id, node.title])), [nodes]);
  const flowNodes = useMemo<Node[]>(
    () =>
      path.map((id, index) => ({
        data: { label: nodeTitles.get(id) ?? id },
        id,
        position: { x: index * 180, y: 0 },
        type: 'default',
      })),
    [nodeTitles, path],
  );
  const flowEdges = useMemo<Edge[]>(
    () =>
      path.slice(1).map((target, index) => ({
        id: `${path[index]}-${target}`,
        source: path[index],
        target,
      })),
    [path],
  );

  if (!path.length) {
    return <p className="text-sm text-fg-muted">Маршрут пока пуст.</p>;
  }

  return (
    <div className="h-56 overflow-hidden rounded-lg border border-border bg-bg">
      <ReactFlowProvider>
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView nodesDraggable={false} nodesConnectable={false}>
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

export default PathVisualization;
