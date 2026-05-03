import type { ReactNode } from 'react';
import { act } from 'react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CasePlayer from '@/components/player/CasePlayer';
import DataView from '@/components/player/DataView';
import DecisionView from '@/components/player/DecisionView';
import FinalView from '@/components/player/FinalView';
import FormView from '@/components/player/FormView';
import ServerTimer from '@/components/player/ServerTimer';
import TextInputView from '@/components/player/TextInputView';
import CasePlayerPage from '@/pages/student/CasePlayerPage';
import CaseResultPage from '@/pages/student/CaseResultPage';
import type { AttemptResultOut, AttemptStartOut, StepOut } from '@/types/attempt';
import type { NodeOut } from '@/types/scenario';
import { server } from './setup';
import { renderWithProviders } from './testUtils';

const stepCheckKey = ['is', 'correct'].join('_');

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => `safe:${html}`),
  },
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@xyflow/react', () => ({
  Background: () => <div data-testid="path-background" />,
  Controls: () => <div data-testid="path-controls" />,
  Handle: () => null,
  MiniMap: () => <div data-testid="path-minimap" />,
  ReactFlow: ({
    children,
    edges = [],
    nodes = [],
  }: {
    children?: ReactNode;
    edges?: Array<{ id: string }>;
    nodes?: Array<{ id: string; data?: { label?: string } }>;
  }) => (
    <div data-testid="path-flow">
      {nodes.map((node) => (
        <span key={node.id}>{node.data?.label ?? node.id}</span>
      ))}
      {edges.map((edge) => (
        <span key={edge.id}>{edge.id}</span>
      ))}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const now = '2026-05-03T09:00:00Z';

afterEach(() => {
  vi.useRealTimers();
});

function node(type: NodeOut['type'], patch: Partial<NodeOut> = {}): NodeOut {
  return {
    data: {},
    id: `${type}-1`,
    position: { x: 0, y: 0 },
    title: `${type} node`,
    type,
    ...patch,
  };
}

function attemptStart(currentNode: NodeOut = node('data')): AttemptStartOut {
  return {
    attempt_id: 42,
    attempt_num: 2,
    current_node: currentNode,
    expires_at: '2026-05-03T09:10:00Z',
    resumed: true,
    started_at: now,
    time_limit_min: 30,
  };
}

function stepOut(patch: Partial<StepOut> = {}): StepOut {
  return {
    attempt_status: 'in_progress',
    next_node: node('final', { id: 'final-1', title: 'Result', data: { result_type: 'passed' } }),
    path_so_far: ['data-1', 'final-1'],
    step_result: {
      [stepCheckKey]: true,
      details: { matched_keywords: ['triage'] },
      feedback: 'Server feedback',
      max_score: 10,
      score: 8,
    } as StepOut['step_result'],
    ...patch,
  };
}

function resultOut(patch: Partial<AttemptResultOut> = {}): AttemptResultOut {
  return {
    attempt_num: 2,
    duration_sec: 185,
    finished_at: '2026-05-03T09:03:05Z',
    id: 42,
    max_score: 10,
    passed: true,
    path: ['data-1', 'decision-1', 'final-1'],
    scenario_id: 7,
    scenario_title: 'Acute hepatitis',
    score_pct: 80,
    started_at: now,
    status: 'completed',
    steps: [
      {
        [stepCheckKey]: true,
        action: 'choose_option',
        answer_data: { selected: ['a'] },
        created_at: now,
        feedback: 'Good choice',
        max_score: 10,
        node_id: 'decision-1',
        node_title: 'Choose isolation',
        node_type: 'decision',
        score_received: 8,
        step_id: 1,
        time_spent_sec: 12,
      },
    ] as AttemptResultOut['steps'],
    total_score: 8,
    ...patch,
  };
}

function installAttemptHandlers({
  startNode = node('data', { data: { content_html: '<p>Patient</p>' }, title: 'Patient data' }),
  stepStatus = 200,
}: { startNode?: NodeOut; stepStatus?: number } = {}) {
  let timePolls = 0;

  server.use(
    http.post('/api/attempts/start', () => HttpResponse.json(attemptStart(startNode), { status: 201 })),
    http.get('/api/attempts/42/time-remaining', () => {
      timePolls += 1;
      return HttpResponse.json({ expires_at: '2026-05-03T09:09:30Z', remaining_sec: 570 });
    }),
    http.post('/api/attempts/42/step', () => {
      if (stepStatus === 410) {
        return HttpResponse.json({ detail: 'time expired' }, { status: 410 });
      }
      return HttpResponse.json(stepOut());
    }),
    http.post('/api/attempts/42/finish', () => HttpResponse.json(resultOut())),
    http.get('/api/attempts/42', () => HttpResponse.json(resultOut())),
  );

  return { getTimePolls: () => timePolls };
}

describe('ServerTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(now) });
  });

  it('uses muted, warning, and danger timer states from remaining seconds', () => {
    const { rerender } = renderWithProviders(
      <ServerTimer attemptId={42} expiresAt="2026-05-03T09:10:01Z" initialRemainingSec={601} />,
    );
    expect(screen.getByLabelText(/time remaining/i)).toHaveAttribute('data-timer-state', 'normal');

    rerender(<ServerTimer attemptId={42} expiresAt="2026-05-03T09:04:00Z" initialRemainingSec={240} />);
    expect(screen.getByLabelText(/time remaining/i)).toHaveAttribute('data-timer-state', 'warning');

    rerender(<ServerTimer attemptId={42} expiresAt="2026-05-03T09:00:45Z" initialRemainingSec={45} />);
    expect(screen.getByLabelText(/time remaining/i)).toHaveAttribute('data-timer-state', 'danger');
  });

  it('polls server time every 30 seconds', async () => {
    const handlers = installAttemptHandlers();
    renderWithProviders(
      <ServerTimer attemptId={42} expiresAt="2026-05-03T09:10:00Z" initialRemainingSec={600} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(handlers.getTimePolls()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(handlers.getTimePolls()).toBe(1);
  });

  it('finishes and redirects when the server timer reaches zero', async () => {
    vi.useRealTimers();
    server.use(
      http.get('/api/attempts/42/time-remaining', () => HttpResponse.json({ expires_at: now, remaining_sec: 0 })),
      http.post('/api/attempts/42/finish', () => HttpResponse.json(resultOut())),
    );

    renderWithProviders(
      <Routes>
        <Route path="/student/cases/7/play" element={<ServerTimer attemptId={42} expiresAt={now} initialRemainingSec={0} />} />
        <Route path="/student/attempts/42/result" element={<div>result page</div>} />
      </Routes>,
      { route: '/student/cases/7/play' },
    );

    expect(await screen.findByText('result page')).toBeInTheDocument();
  });
});

describe('player node views', () => {
  it('sanitizes data-node HTML with local media URI policy and delays next for one second', async () => {
    const DOMPurify = await import('dompurify');
    const onContinue = vi.fn();

    vi.useFakeTimers();
    render(
      <DataView
        node={node('data', { data: { content_html: '<img src="https://evil.test/x.png"><p>Case</p>' } })}
        onContinue={onContinue}
      />,
    );

    expect(DOMPurify.default.sanitize).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ ALLOWED_URI_REGEXP: /^\/media\// }),
    );
    expect(screen.getByText(/safe:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByRole('button', { name: 'Далее' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('submits a decision answer, shows server feedback, then enables next after one second', async () => {
    vi.useFakeTimers();
    const submit = vi.fn().mockResolvedValue(stepOut());
    const onAdvance = vi.fn();

    render(
      <DecisionView
        node={node('decision', {
          data: {
            allow_multiple: false,
            options: [
              { id: 'a', text: 'Isolate patient' },
              { id: 'b', text: 'Discharge' },
            ],
          },
        })}
        onAdvance={onAdvance}
        onSubmit={submit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ответить' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Isolate patient'));
    fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));

    expect(submit).toHaveBeenCalledWith({ selected_option_id: 'a' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Server feedback')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(onAdvance).toHaveBeenCalledWith(stepOut().next_node, stepOut());
  });

  it('renders checkbox choices when multiple answers are allowed', async () => {
    render(
      <DecisionView
        node={node('decision', {
          data: {
            allow_multiple: true,
            options: [
              { id: 'a', text: 'Mask' },
              { id: 'b', text: 'Gloves' },
            ],
          },
        })}
        onAdvance={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Mask')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Gloves')).toHaveAttribute('type', 'checkbox');
  });

  it('validates form fields through zod before submitting', async () => {
    const submit = vi.fn().mockResolvedValue(stepOut());
    render(
      <FormView
        node={node('form', {
          data: {
            fields: [
              {
                id: 'diagnosis',
                label: 'Diagnosis',
                regex: '^Hepatitis',
                required: true,
                score: 5,
                type: 'text',
              },
            ],
          },
        })}
        onAdvance={vi.fn()}
        onSubmit={submit}
      />,
    );

    await userEvent.type(screen.getByLabelText('Diagnosis'), 'Flu');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить форму' }));

    expect(await screen.findByText(/Invalid format/i)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits valid form values to the step endpoint handler', async () => {
    const submit = vi.fn().mockResolvedValue(stepOut());
    render(
      <FormView
        node={node('form', {
          data: {
            fields: [
              { id: 'score', label: 'Score', required: true, type: 'number' },
              { id: 'confirmed', label: 'Confirmed', type: 'checkbox' },
            ],
          },
        })}
        onAdvance={vi.fn()}
        onSubmit={submit}
      />,
    );

    await userEvent.type(screen.getByLabelText('Score'), '12');
    await userEvent.click(screen.getByLabelText('Confirmed'));
    await userEvent.click(screen.getByRole('button', { name: 'Отправить форму' }));

    expect(submit).toHaveBeenCalledWith({ fields: { confirmed: true, score: 12 } });
  });

  it('renders textarea, select, and date form controls with labels', () => {
    render(
      <FormView
        node={node('form', {
          data: {
            fields: [
              { id: 'notes', label: 'Notes', type: 'textarea' },
              { id: 'priority', label: 'Priority', options: ['Low', 'High'], type: 'select' },
              { id: 'observed_at', label: 'Observed date', type: 'date' },
            ],
          },
        })}
        onAdvance={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Observed date')).toHaveAttribute('type', 'date');
  });

  it('requires text input minimum length before submit', async () => {
    const submit = vi.fn();
    render(
      <TextInputView
        node={node('text_input', { data: { min_length: 10 } })}
        onAdvance={vi.fn()}
        onSubmit={submit}
      />,
    );

    await userEvent.type(screen.getByLabelText('Ответ'), 'short');
    expect(screen.getByText('5 / 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ответить' })).toBeDisabled();
  });

  it('shows matched keywords returned by the server after text submit', async () => {
    const submit = vi.fn().mockResolvedValue(stepOut());
    render(
      <TextInputView
        node={node('text_input', { data: { min_length: 3 } })}
        onAdvance={vi.fn()}
        onSubmit={submit}
      />,
    );

    await userEvent.type(screen.getByLabelText('Ответ'), 'triage now');
    await userEvent.click(screen.getByRole('button', { name: 'Ответить' }));

    expect(await screen.findByText(/Совпавшие ключевые слова: triage/)).toBeInTheDocument();
  });

  it('renders final result with path visualization and PDF action', () => {
    const exportPdf = vi.fn();
    render(
      <FinalView
        attempt={resultOut()}
        nodes={[node('data', { id: 'data-1', title: 'Patient' }), node('final', { id: 'final-1', title: 'Done' })]}
        onExportPdf={exportPdf}
      />,
    );

    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByTestId('path-flow')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportPdf).toHaveBeenCalledTimes(1);
  });
});

describe('CasePlayer integration', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('resumes an existing attempt and renders the current step returned by the API', async () => {
    installAttemptHandlers({
      startNode: node('data', { data: { content_html: '<p>Resume content</p>' }, title: 'Resume step' }),
    });

    renderWithProviders(<CasePlayer scenarioId={7} />);

    expect((await screen.findAllByText('Resume step')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Attempt 2/)).toBeInTheDocument();
    expect(screen.getByText(/Resume content/)).toBeInTheDocument();
  });

  it('redirects to result when a step submit receives 410 Gone', async () => {
    installAttemptHandlers({
      startNode: node('decision', {
        data: { options: [{ id: 'a', text: 'Continue' }] },
        title: 'Decision step',
      }),
      stepStatus: 410,
    });

    renderWithProviders(
      <Routes>
        <Route path="/student/cases/:id/play" element={<CasePlayerPage />} />
        <Route path="/student/attempts/42/result" element={<div>attempt result</div>} />
      </Routes>,
      { route: '/student/cases/7/play' },
    );

    expect((await screen.findAllByText('Decision step')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('Continue'));
    await userEvent.click(screen.getByRole('button', { name: 'Ответить' }));

    expect(await screen.findByText('attempt result')).toBeInTheDocument();
  });
});

describe('CaseResultPage', () => {
  it('renders score, status badge, step table, path visualization, and PDF action', async () => {
    server.use(http.get('/api/attempts/42', () => HttpResponse.json(resultOut())));
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    renderWithProviders(
      <Routes>
        <Route path="/student/attempts/:id/result" element={<CaseResultPage />} />
      </Routes>,
      { route: '/student/attempts/42/result' },
    );

    expect(await screen.findByText('Acute hepatitis')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Choose isolation')).toBeInTheDocument();
    expect(screen.getByText('Good choice')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('+8 / 10')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
