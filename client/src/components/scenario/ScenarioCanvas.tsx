import { useCallback, type DragEvent, type KeyboardEvent } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChoiceEdge } from './edges/ChoiceEdge';
import { DataNode } from './nodes/DataNode';
import { DecisionNode } from './nodes/DecisionNode';
import { FinalNode } from './nodes/FinalNode';
import { FormNode } from './nodes/FormNode';
import { StartNode } from './nodes/StartNode';
import { TextInputNode } from './nodes/TextInputNode';
import {
  type ScenarioEditorEdge,
  type ScenarioEditorNode,
  useScenarioEditorStore,
} from '@/stores/scenarioEditorStore';
import type { NodeType } from '@/types/scenario';

const nodeTypes: NodeTypes = {
  data: DataNode,
  decision: DecisionNode,
  final: FinalNode,
  form: FormNode,
  start: StartNode,
  text_input: TextInputNode,
};

const edgeTypes: EdgeTypes = {
  choice: ChoiceEdge,
};

export interface ScenarioCanvasProps {
  scenarioId: number;
}

function ScenarioCanvasInner({ scenarioId: _scenarioId }: ScenarioCanvasProps) {
  const nodes = useScenarioEditorStore((state) => state.nodes);
  const edges = useScenarioEditorStore((state) => state.edges);
  const addNode = useScenarioEditorStore((state) => state.addNode);
  const addEdge = useScenarioEditorStore((state) => state.addEdge);
  const applyNodeChanges = useScenarioEditorStore((state) => state.applyNodeChanges);
  const applyEdgeChanges = useScenarioEditorStore((state) => state.applyEdgeChanges);
  const deleteSelected = useScenarioEditorStore((state) => state.deleteSelected);
  const selectNode = useScenarioEditorStore((state) => state.selectNode);
  const { screenToFlowPosition } = useReactFlow<ScenarioEditorNode, ScenarioEditorEdge>();

  const onConnect = useCallback((connection: Connection) => addEdge(connection), [addEdge]);
  const onNodesChange = useCallback(
    (changes: NodeChange<ScenarioEditorNode>[]) => applyNodeChanges(changes),
    [applyNodeChanges],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<ScenarioEditorEdge>[]) => applyEdgeChanges(changes),
    [applyEdgeChanges],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type) return;
      addNode(
        type,
        screenToFlowPosition({
          x: Number(event.clientX ?? 0),
          y: Number(event.clientY ?? 0),
        }),
      );
    },
    [addNode, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      }
    },
    [deleteSelected],
  );

  return (
    <div className="h-full min-h-[640px] rounded-xl border border-border bg-bg" onKeyDown={onKeyDown}>
      <ReactFlow<ScenarioEditorNode, ScenarioEditorEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodesChange={onNodesChange}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export function ScenarioCanvas(props: ScenarioCanvasProps) {
  return (
    <ReactFlowProvider>
      <ScenarioCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export default ScenarioCanvas;
