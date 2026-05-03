import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { ANSWER_EDGE_KEY, type ScenarioEditorEdge } from '@/stores/scenarioEditorStore';

const edgeStyles = {
  danger: { stroke: 'var(--color-danger)', strokeDasharray: '6 4', strokeWidth: 2.5 },
  success: { stroke: 'var(--color-success)', strokeWidth: 2.5 },
  warning: { stroke: 'var(--color-warning)', strokeWidth: 2.5 },
} as const;

function getEdgeState(data: ScenarioEditorEdge['data']) {
  if (data?.partial) return 'warning';
  return data?.[ANSWER_EDGE_KEY] === true ? 'success' : 'danger';
}

function formatScore(value: unknown) {
  const score = Number(value ?? 0);
  return score > 0 ? `+${score}` : `−${Math.abs(score)}`;
}

export function ChoiceEdge({
  data,
  id,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<ScenarioEditorEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  const state = getEdgeState(data);

  return (
    <g data-edge-state={state} data-testid={`choice-edge-${id}`}>
      <BaseEdge id={id} path={edgePath} style={edgeStyles[state]} />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-auto rounded-full border border-border bg-bg px-2 py-0.5 text-xs font-semibold text-fg shadow-sm"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {formatScore(data?.score_delta)}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}

export default ChoiceEdge;
