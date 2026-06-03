import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { ANSWER_EDGE_KEY, type ScenarioEditorEdge } from '@/stores/scenarioEditorStore';

const edgeStyles = {
  danger: { stroke: 'var(--color-danger)', strokeDasharray: '6 4', strokeWidth: 2.5 },
  neutral: { stroke: 'var(--color-fg-muted)', strokeWidth: 2 },
  success: { stroke: 'var(--color-success)', strokeWidth: 2.5 },
  warning: { stroke: 'var(--color-warning)', strokeWidth: 2.5 },
} as const;

function getEdgeState(data: ScenarioEditorEdge['data']) {
  if (data?.partial) return 'warning';
  if (data?.[ANSWER_EDGE_KEY] === true) return 'success';
  if (data?.[ANSWER_EDGE_KEY] === false) return 'danger';
  return 'neutral';
}

function isAnswerEdge(data: ScenarioEditorEdge['data']) {
  return data?.[ANSWER_EDGE_KEY] === true || data?.[ANSWER_EDGE_KEY] === false;
}

function formatScore(value: unknown) {
  const score = Number(value ?? 0);
  if (score > 0) return `+${score}`;
  if (score < 0) return `−${Math.abs(score)}`;
  return '0';
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
  const score = Number(data?.score_delta ?? 0);
  // Hide the «−0» badge on plain transitions; show it for answer edges or any non-zero delta.
  const showScore = score !== 0 || isAnswerEdge(data);

  return (
    <g data-edge-state={state} data-testid={`choice-edge-${id}`}>
      <BaseEdge id={id} path={edgePath} style={edgeStyles[state]} />
      {showScore ? (
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
      ) : null}
    </g>
  );
}

export default ChoiceEdge;
