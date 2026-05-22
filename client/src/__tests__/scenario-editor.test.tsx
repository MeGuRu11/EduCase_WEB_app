import { act, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Position } from '@xyflow/react';
import { ScenarioCanvas } from '@/components/scenario/ScenarioCanvas';
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
    onEdgesChange,
    onNodeClick,
    onNodesChange,
  }: {
    children?: ReactNode;
    edges?: Array<{ id: string; label?: string | null }>;
    nodes?: Array<{ id: string; type?: string; data?: { title?: string }; title?: string }>;
    onConnect?: (connection: { source: string; target: string }) => void;
    onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
    onDrop?: (event: DragEvent<HTMLDivElement>) => void;
    onEdgesChange?: (changes: Array<{ id: string; type: string }>) => void;
    onNodeClick?: (event: MouseEvent<HTMLButtonElement>, node: { id: string }) => void;
    onNodesChange?: (changes: Array<{ id: string; type: string; position?: { x: number; y: number } }>) => void;
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
        <span key={edge.id}>{edge.label ?? edge.id}</span>
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

  it('connects two nodes with default answer metadata', async () => {
    useScenarioEditorStore.getState().loadGraph(fullScenario());
    render(<ScenarioCanvas scenarioId={7} />);

    await userEvent.click(screen.getByRole('button', { name: 'connect mocked nodes' }));

    const edges = useScenarioEditorStore.getState().edges;
    const edge = edges[edges.length - 1];
    expect(edge?.source).toBe('start-1');
    expect(edge?.target).toBe('data-1');
    expect(edge?.data?.[ANSWER_EDGE_KEY]).toBe(false);
    expect(edge?.data?.score_delta).toBe(0);
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
    ['start', 'Start node'],
    ['data', 'Content HTML'],
    ['decision', 'Варианты ответа'],
    ['form', 'Form template'],
    ['text_input', 'Keywords'],
    ['final', 'Final result'],
  ] as const)('renders %s inspector controls', (type, expectedLabel) => {
    const node = useScenarioEditorStore.getState().addNode(type, { x: 0, y: 0 });
    useScenarioEditorStore.getState().selectNode(node.id);

    render(<NodeInspector />);

    expect(screen.getAllByText(expectedLabel).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('updates selected node title from the inspector', async () => {
    const user = userEvent.setup();
    const node = useScenarioEditorStore.getState().addNode('data', { x: 0, y: 0 });
    useScenarioEditorStore.getState().selectNode(node.id);
    render(<NodeInspector />);

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Updated patient data');

    expect(useScenarioEditorStore.getState().nodes[0].title).toBe('Updated patient data');
  });

  it('adds and removes decision options', async () => {
    const user = userEvent.setup();
    const node = useScenarioEditorStore.getState().addNode('decision', { x: 0, y: 0 });
    useScenarioEditorStore.getState().selectNode(node.id);
    render(<NodeInspector />);

    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить вариант 1' }));
    expect(screen.queryByLabelText('Option 1')).not.toBeInTheDocument();
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
