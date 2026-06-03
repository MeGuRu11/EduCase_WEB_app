import { act, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Position } from '@xyflow/react';
import { ScenarioCanvas } from '@/components/scenario/ScenarioCanvas';
import { EdgeInspector } from '@/components/scenario/EdgeInspector';
import { NodeInspector } from '@/components/scenario/NodeInspector';
import { NodePalette } from '@/components/scenario/NodePalette';
import { ChoiceEdge } from '@/components/scenario/edges/ChoiceEdge';
import { useAutoSave } from '@/hooks/useAutoSave';
import MyScenarios from '@/pages/teacher/MyScenarios';
import ScenarioEditorPage from '@/pages/teacher/ScenarioEditorPage';
import ScenarioPreview from '@/pages/teacher/ScenarioPreview';
import {
  ANSWER_EDGE_KEY,
  SENSITIVE_FORM_VALUE_KEY,
  useScenarioEditorStore,
} from '@/stores/scenarioEditorStore';
import type { ScenarioFullOut, ScenarioListOut } from '@/types/scenario';
import { server } from './setup';
import { renderWithProviders } from './testUtils';

vi.mock('@xyflow/react', () => {
  const ReactFlow = ({
    children,
    edges = [],
    nodes = [],
    onConnect,
    onDragOver,
    onDrop,
    onEdgeClick,
    onEdgesChange,
    onNodeClick,
    onNodesChange,
    onPaneClick,
  }: {
    children?: ReactNode;
    edges?: Array<{ id: string; label?: string | null; selected?: boolean }>;
    nodes?: Array<{ id: string; type?: string; data?: { title?: string }; title?: string }>;
    onConnect?: (connection: { source: string; target: string }) => void;
    onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
    onDrop?: (event: DragEvent<HTMLDivElement>) => void;
    onEdgeClick?: (event: MouseEvent<HTMLButtonElement>, edge: { id: string }) => void;
    onEdgesChange?: (changes: Array<{ id: string; type: string }>) => void;
    onNodeClick?: (event: MouseEvent<HTMLButtonElement>, node: { id: string }) => void;
    onNodesChange?: (changes: Array<{ id: string; type: string; position?: { x: number; y: number } }>) => void;
    onPaneClick?: () => void;
  }) => (
    <div
      data-testid="scenario-flow"
      onDragOver={onDragOver}
      onDrop={onDrop}
      tabIndex={0}
    >
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={(event) => onNodeClick?.(event, node)}>
          {node.data?.title ?? node.title ?? node.id}
        </button>
      ))}
      {edges.map((edge) => (
        <button
          key={edge.id}
          type="button"
          data-edge-selected={edge.selected ? 'true' : 'false'}
          onClick={(event) => onEdgeClick?.(event, edge)}
        >
          {edge.label ?? edge.id}
        </button>
      ))}
      <button type="button" onClick={() => onConnect?.({ source: 'start-1', target: 'data-1' })}>
        connect mocked nodes
      </button>
      <button
        type="button"
        onClick={() => onNodesChange?.([{ id: 'start-1', type: 'position', position: { x: 40, y: 55 } }])}
      >
        move mocked node
      </button>
      <button type="button" onClick={() => onEdgesChange?.([{ id: 'edge-1', type: 'remove' }])}>
        remove mocked edge
      </button>
      <button type="button" onClick={() => onPaneClick?.()}>
        click pane
      </button>
      {children}
    </div>
  );

  return {
    Background: () => <div data-testid="flow-background" />,
    BaseEdge: ({ id, path }: { id: string; path: string }) => <path data-testid={`edge-${id}`} d={path} />,
    Controls: () => <div data-testid="flow-controls" />,
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Handle: ({ type }: { type: string }) => <span data-testid={`handle-${type}`} />,
    MiniMap: () => <div data-testid="flow-minimap" />,
    Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
    ReactFlow,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    getBezierPath: () => ['M 0 0 C 10 10 20 20 30 30', 15, 15],
    useReactFlow: () => ({ screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }) }),
  };
});

const now = '2026-05-02T09:00:00Z';

function listScenario(patch: Partial<ScenarioListOut> = {}): ScenarioListOut {
  return {
    id: 7,
    title: 'Acute hepatitis',
    description: 'Training case',
    disease_category: 'Infectious disease',
    cover_url: null,
    status: 'draft',
    author_id: 2,
    author_name: 'Teacher',
    time_limit_min: 30,
    max_attempts: 3,
    passing_score: 70,
    version: 1,
    node_count: 2,
    assigned_groups: [],
    my_attempts_count: 0,
    created_at: now,
    updated_at: now,
    ...patch,
  };
}

function fullScenario(): ScenarioFullOut {
  const valueKey = SENSITIVE_FORM_VALUE_KEY;
  return {
    ...listScenario(),
    nodes: [
      { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: {}, title: 'Start' },
      { id: 'data-1', type: 'data', position: { x: 180, y: 0 }, data: { html: '<p>Patient data</p>' }, title: 'Data' },
      {
        id: 'form-1',
        type: 'form',
        position: { x: 360, y: 0 },
        data: { fields: [{ id: 'diagnosis', label: 'Diagnosis', [valueKey]: 'Hepatitis A', score: 3 }] },
        title: 'Diagnosis form',
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'start-1',
        target: 'data-1',
        label: 'Begin',
        data: { [ANSWER_EDGE_KEY]: true, score_delta: 10, partial: false },
      },
    ],
    published_at: null,
  };
}

function installScenarioHandlers() {
  server.use(
    http.get('/api/scenarios/', ({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status_filter');
      const rows = [
        listScenario({ id: 7, status: 'draft', title: 'Draft case' }),
        listScenario({ id: 8, status: 'published', title: 'Published case' }),
      ].filter((row) => !status || row.status === status);
      return HttpResponse.json(rows);
    }),
    http.get('/api/scenarios/7', () => HttpResponse.json(fullScenario())),
    http.put('/api/scenarios/7/graph', async ({ request }) => {
      const graph = (await request.json()) as Partial<ScenarioFullOut>;
      return HttpResponse.json({ ...fullScenario(), ...graph });
    }),
    http.post('/api/scenarios/7/duplicate', () => HttpResponse.json({ ...fullScenario(), id: 70 }, { status: 201 })),
    http.post('/api/scenarios/7/archive', () => HttpResponse.json(listScenario({ status: 'archived' }))),
    http.delete('/api/scenarios/7', () => new HttpResponse(null, { status: 204 })),
  );
}

function resetEditorStore() {
  useScenarioEditorStore.setState({
    edges: [],
    isDirty: false,
    lastSaveAt: null,
    nodes: [],
    revision: 0,
    selectedEdgeId: null,
    selectedNodeId: null,
  });
}

describe('scenario editor store and canvas', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('adds a dropped palette node to the canvas', () => {
    render(<ScenarioCanvas scenarioId={7} />);
    const flow = screen.getByTestId('scenario-flow');
    const data = new Map<string, string>();

    fireEvent.drop(flow, {
      clientX: 140,
      clientY: 90,
      dataTransfer: { getData: (key: string) => data.get(key) ?? '', setData: (key: string, value: string) => data.set(key, value) },
    });
    expect(useScenarioEditorStore.getState().nodes).toHaveLength(0);

    data.set('application/reactflow', 'data');
    fireEvent.drop(flow, {
      clientX: 140,
      clientY: 90,
      dataTransfer: { getData: (key: string) => data.get(key) ?? '' },
    });

    const [node] = useScenarioEditorStore.getState().nodes;
    expect(node.type).toBe('data');
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(useScenarioEditorStore.getState().isDirty).toBe(true);
  });

  it('connects two nodes with neutral default metadata', async () => {
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    render(<ScenarioCanvas scenarioId={7} />);

    await userEvent.click(screen.getByRole('button', { name: 'connect mocked nodes' }));

    const edges = useScenarioEditorStore.getState().edges;
    const edge = edges[edges.length - 1];
    expect(edge?.source).toBe('start-1');
    expect(edge?.target).toBe('data-1');
    // Neutral by default: no answer flag (so the edge renders grey, not red «−0»).
    expect(edge?.data?.[ANSWER_EDGE_KEY]).toBeUndefined();
    expect(edge?.data?.score_delta).toBe(0);
  });

  it('selects an edge from the canvas and clears it on pane click', async () => {
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    useScenarioEditorStore.getState().selectNode('start-1');
    render(<ScenarioCanvas scenarioId={7} />);

    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(useScenarioEditorStore.getState().selectedEdgeId).toBe('edge-1');
    expect(useScenarioEditorStore.getState().selectedNodeId).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'click pane' }));
    expect(useScenarioEditorStore.getState().selectedEdgeId).toBeNull();
    expect(useScenarioEditorStore.getState().selectedNodeId).toBeNull();
  });

  it('applies node and edge changes from React Flow', async () => {
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    render(<ScenarioCanvas scenarioId={7} />);

    await userEvent.click(screen.getByRole('button', { name: 'move mocked node' }));
    await userEvent.click(screen.getByRole('button', { name: 'remove mocked edge' }));

    expect(useScenarioEditorStore.getState().nodes.find((node) => node.id === 'start-1')?.position).toEqual({
      x: 40,
      y: 55,
    });
    expect(useScenarioEditorStore.getState().edges).toHaveLength(0);
  });

  it('selects and deletes the selected node from the canvas keyboard handler', async () => {
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    render(<ScenarioCanvas scenarioId={7} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.keyDown(screen.getByTestId('scenario-flow'), { key: 'Delete' });

    expect(useScenarioEditorStore.getState().nodes.some((node) => node.id === 'start-1')).toBe(false);
    expect(useScenarioEditorStore.getState().selectedNodeId).toBeNull();
  });

  it('renders the React Flow background, controls, and minimap', () => {
    render(<ScenarioCanvas scenarioId={7} />);

    expect(screen.getByTestId('flow-background')).toBeInTheDocument();
    expect(screen.getByTestId('flow-controls')).toBeInTheDocument();
    expect(screen.getByTestId('flow-minimap')).toBeInTheDocument();
  });
});

describe('scenario node palette and inspector', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('sets the React Flow drag payload for palette items', () => {
    const writes = new Map<string, string>();
    render(<NodePalette />);

    fireEvent.dragStart(screen.getByRole('button', { name: /решение/i }), {
      dataTransfer: {
        effectAllowed: '',
        setData: (key: string, value: string) => writes.set(key, value),
      },
    });

    expect(writes.get('application/reactflow')).toBe('decision');
  });

  it.each([
    ['start', 'Начальный узел'],
    ['data', 'Содержимое узла данных'],
    ['decision', 'Варианты ответа'],
    ['form', 'Бланк документа'],
    ['text_input', 'Ключевые слова'],
    ['final', 'Итоговый результат'],
  ] as const)('renders %s inspector controls', (type, expectedLabel) => {
    const node = useScenarioEditorStore.getState().addNode(type, { x: 0, y: 0 });
    useScenarioEditorStore.getState().selectNode(node.id);

    render(<NodeInspector />);

    expect(screen.getAllByText(expectedLabel).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Заголовок')).toBeInTheDocument();
  });

  it('updates selected node title from the inspector', async () => {
    const user = userEvent.setup();
    const node = useScenarioEditorStore.getState().addNode('data', { x: 0, y: 0 });
    useScenarioEditorStore.getState().selectNode(node.id);
    render(<NodeInspector />);

    await user.clear(screen.getByLabelText('Заголовок'));
    await user.type(screen.getByLabelText('Заголовок'), 'Updated patient data');

    expect(useScenarioEditorStore.getState().nodes[0].title).toBe('Updated patient data');
  });

  it('adds and removes decision options', async () => {
    const user = userEvent.setup();
    const node = useScenarioEditorStore.getState().addNode('decision', { x: 0, y: 0 });
    useScenarioEditorStore.getState().selectNode(node.id);
    render(<NodeInspector />);

    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    expect(screen.getByLabelText('Вариант 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить вариант 1' }));
    expect(screen.queryByLabelText('Вариант 1')).not.toBeInTheDocument();
  });
});

function decisionGraph() {
  return {
    nodes: [
      { id: 'start-1', type: 'start' as const, position: { x: -200, y: 0 }, data: {}, title: 'Старт' },
      {
        id: 'decision-1',
        type: 'decision' as const,
        position: { x: 0, y: 0 },
        data: { options: [{ id: 'o1', label: 'Вариант А' }, { id: 'o2', label: 'Вариант Б' }] },
        title: 'Решение',
      },
      { id: 'final-1', type: 'final' as const, position: { x: 200, y: 0 }, data: {}, title: 'Финал' },
    ],
    edges: [
      { id: 'edge-d', source: 'decision-1', target: 'final-1', label: null, data: { score_delta: 0, partial: false } },
      { id: 'edge-s', source: 'start-1', target: 'decision-1', label: null, data: { score_delta: 0 } },
    ],
  };
}

describe('scenario edge inspector', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('renders link type, score, and decision-only fields for a decision edge', () => {
    useScenarioEditorStore.getState().loadGraph(decisionGraph());
    useScenarioEditorStore.getState().selectEdge('edge-d');
    render(<EdgeInspector />);

    expect(screen.getByRole('radio', { name: /Правильный путь/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Неправильный путь/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Нейтральный переход/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Баллы')).toBeInTheDocument();
    expect(screen.getByLabelText('Частичный балл')).toBeInTheDocument();
    expect(screen.getByLabelText('Вариант ответа')).toBeInTheDocument();
    // Neutral is the default for a freshly created transition.
    expect(screen.getByRole('radio', { name: /Нейтральный переход/ })).toBeChecked();
  });

  it('hides decision-only fields when the source is not a decision node', () => {
    useScenarioEditorStore.getState().loadGraph(decisionGraph());
    useScenarioEditorStore.getState().selectEdge('edge-s');
    render(<EdgeInspector />);

    expect(screen.getByLabelText('Баллы')).toBeInTheDocument();
    expect(screen.queryByLabelText('Вариант ответа')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Частичный балл')).not.toBeInTheDocument();
  });

  it('changes the edge link type and writes the answer flag to the store', async () => {
    const user = userEvent.setup();
    useScenarioEditorStore.getState().loadGraph(decisionGraph());
    useScenarioEditorStore.getState().selectEdge('edge-d');
    render(<EdgeInspector />);

    await user.click(screen.getByRole('radio', { name: /Правильный путь/ }));
    expect(useScenarioEditorStore.getState().edges.find((e) => e.id === 'edge-d')?.data?.[ANSWER_EDGE_KEY]).toBe(true);

    await user.click(screen.getByRole('radio', { name: /Неправильный путь/ }));
    expect(useScenarioEditorStore.getState().edges.find((e) => e.id === 'edge-d')?.data?.[ANSWER_EDGE_KEY]).toBe(false);

    await user.click(screen.getByRole('radio', { name: /Нейтральный переход/ }));
    expect(useScenarioEditorStore.getState().edges.find((e) => e.id === 'edge-d')?.data?.[ANSWER_EDGE_KEY]).toBeUndefined();
  });

  it('edits the score and links an answer option', async () => {
    const user = userEvent.setup();
    useScenarioEditorStore.getState().loadGraph(decisionGraph());
    useScenarioEditorStore.getState().selectEdge('edge-d');
    render(<EdgeInspector />);

    const score = screen.getByLabelText('Баллы');
    await user.clear(score);
    await user.type(score, '15');
    expect(useScenarioEditorStore.getState().edges.find((e) => e.id === 'edge-d')?.data?.score_delta).toBe(15);

    await user.selectOptions(screen.getByLabelText('Вариант ответа'), 'o1');
    expect(useScenarioEditorStore.getState().edges.find((e) => e.id === 'edge-d')?.data?.option_id).toBe('o1');
  });

  it('deletes the selected edge via the store deleteSelected action', () => {
    useScenarioEditorStore.getState().loadGraph(decisionGraph());
    useScenarioEditorStore.getState().selectEdge('edge-d');

    useScenarioEditorStore.getState().deleteSelected();

    expect(useScenarioEditorStore.getState().edges.some((e) => e.id === 'edge-d')).toBe(false);
    expect(useScenarioEditorStore.getState().selectedEdgeId).toBeNull();
  });

  it('round-trips edge metadata through save serialization (A6)', () => {
    useScenarioEditorStore.getState().loadGraph({
      nodes: [
        {
          id: 'decision-1',
          type: 'decision',
          position: { x: 0, y: 0 },
          data: { options: [{ id: 'o1', label: 'Вариант А' }] },
          title: 'Решение',
        },
        { id: 'final-1', type: 'final', position: { x: 200, y: 0 }, data: {}, title: 'Финал' },
      ],
      edges: [
        {
          id: 'edge-d',
          source: 'decision-1',
          target: 'final-1',
          label: null,
          data: { [ANSWER_EDGE_KEY]: true, score_delta: 7, partial: true, option_id: 'o1' },
        },
      ],
    });

    const edge = useScenarioEditorStore.getState().toGraphIn().edges.find((e) => e.id === 'edge-d');
    expect(edge?.data).toMatchObject({ [ANSWER_EDGE_KEY]: true, score_delta: 7, partial: true, option_id: 'o1' });
  });
});

describe('choice edge and auto-save', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('renders a score label and semantic edge state', () => {
    render(
      <svg>
        <ChoiceEdge
          id="edge-1"
          source="start-1"
          target="data-1"
          sourceX={0}
          sourceY={0}
          targetX={30}
          targetY={30}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          type="choice"
          selected={false}
          selectable
          deletable
          animated={false}
          data={{ [ANSWER_EDGE_KEY]: true, score_delta: 10 }}
        />
      </svg>,
    );

    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByTestId('choice-edge-edge-1')).toHaveAttribute('data-edge-state', 'success');
  });

  it('renders a neutral edge without the «−0» score label', () => {
    render(
      <svg>
        <ChoiceEdge
          id="edge-neutral"
          source="start-1"
          target="data-1"
          sourceX={0}
          sourceY={0}
          targetX={30}
          targetY={30}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          type="choice"
          selected={false}
          selectable
          deletable
          animated={false}
          data={{ score_delta: 0 }}
        />
      </svg>,
    );

    expect(screen.getByTestId('choice-edge-edge-neutral')).toHaveAttribute('data-edge-state', 'neutral');
    expect(screen.queryByText('−0')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders the danger state for an incorrect edge', () => {
    render(
      <svg>
        <ChoiceEdge
          id="edge-bad"
          source="decision-1"
          target="final-1"
          sourceX={0}
          sourceY={0}
          targetX={30}
          targetY={30}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          type="choice"
          selected={false}
          selectable
          deletable
          animated={false}
          data={{ [ANSWER_EDGE_KEY]: false, score_delta: -5 }}
        />
      </svg>,
    );

    expect(screen.getByText('−5')).toBeInTheDocument();
    expect(screen.getByTestId('choice-edge-edge-bad')).toHaveAttribute('data-edge-state', 'danger');
  });

  it('debounces graph saves for exactly 30 seconds', async () => {
    vi.useFakeTimers();
    const saveGraph = vi.fn().mockResolvedValue(fullScenario());
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    useScenarioEditorStore.getState().updateNode('data-1', { title: 'Dirty data' });

    renderHook(() => useAutoSave({ scenarioId: 7, saveGraph }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(saveGraph).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(saveGraph).toHaveBeenCalledTimes(1);
    expect(useScenarioEditorStore.getState().isDirty).toBe(false);
    vi.useRealTimers();
  });

  it('registers a beforeunload warning while the graph is dirty', () => {
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    useScenarioEditorStore.getState().updateNode('data-1', { title: 'Dirty data' });
    renderHook(() => useAutoSave({ scenarioId: 7, saveGraph: vi.fn() }));

    const event = new Event('beforeunload', { cancelable: true });
    const prevented = !window.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});

describe('teacher scenario pages', () => {
  beforeEach(() => {
    resetEditorStore();
    installScenarioHandlers();
  });

  it('renders the scenario editor three-panel shell from loaded graph data', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/teacher/scenarios/:id/edit" element={<ScenarioEditorPage />} />
      </Routes>,
      { route: '/teacher/scenarios/7/edit' },
    );

    expect(await screen.findByText('Палитра узлов')).toBeInTheDocument();
    expect((await screen.findAllByText('Start')).length).toBeGreaterThan(0);
    expect(screen.getByText('Инспектор')).toBeInTheDocument();
  });

  it('lists scenarios and filters by status', async () => {
    renderWithProviders(<MyScenarios />);

    expect(await screen.findByText('Draft case')).toBeInTheDocument();
    expect(screen.getByText('Published case')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Фильтр по статусу'), 'published');

    await waitFor(() => expect(screen.queryByText('Draft case')).not.toBeInTheDocument());
    expect(screen.getByText('Published case')).toBeInTheDocument();
  });

  it('duplicates, archives, and deletes a scenario from the list actions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyScenarios />);

    await screen.findByText('Draft case');
    await user.click(screen.getAllByRole('button', { name: 'Дублировать' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'В архив' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Удалить' })[0]);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Да, удалить' }));

    await waitFor(() => expect(screen.getByText('Выполнено')).toBeInTheDocument());
  });

  it('shows preview mode banner and teacher-only insight labels', async () => {
    let startedAttempts = 0;
    server.use(
      http.post('/api/attempts/start', () => {
        startedAttempts += 1;
        return HttpResponse.json({ error: 'preview must not start persisted attempts' }, { status: 500 });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/teacher/scenarios/:id/preview" element={<ScenarioPreview />} />
      </Routes>,
      { route: '/teacher/scenarios/7/preview' },
    );

    expect(await screen.findByText(/Режим предпросмотра/)).toBeInTheDocument();
    expect(screen.getByText('Подсказки преподавателя')).toBeInTheDocument();
    expect(screen.getByText('Правильный ответ')).toBeInTheDocument();
    expect(screen.getByText('Hepatitis A')).toBeInTheDocument();
    expect(startedAttempts).toBe(0);
  });
});
