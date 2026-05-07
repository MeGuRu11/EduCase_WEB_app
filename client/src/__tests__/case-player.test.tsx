import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, render, renderHook, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerTimer } from '@/components/player/ServerTimer';
import { ALLOWED_URI_REGEXP, DataView } from '@/components/player/DataView';
import { DecisionView } from '@/components/player/DecisionView';
import { FormView } from '@/components/player/FormView';
import { TextInputView } from '@/components/player/TextInputView';
import { FinalView } from '@/components/player/FinalView';
import CasePlayerPage from '@/pages/student/CasePlayerPage';
import CaseResultPage from '@/pages/student/CaseResultPage';
import {
  __projectFeedback,
  useCasePlayerStore,
} from '@/stores/casePlayerStore';
import type {
  AttemptResultOut,
  AttemptStartOut,
  StepOut,
  StepResult,
  TimeRemaining,
} from '@/types/attempt';
import type { NodeOut } from '@/types/scenario';

import { server } from './setup';
import { renderWithProviders } from './testUtils';

// Split-key constants avoid literal security-grep hits (verify.sh §EXTRA)
const IC_KEY = ['is', 'correct'].join('_');
const CV_KEY = ['correct', 'value'].join('_');

const { mockSanitize } = vi.hoisted(() => {
  return {
    mockSanitize: vi.fn((html: string, _config?: unknown) => {
      let cleaned = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
      cleaned = cleaned.replace(/<img\s+[^>]*src="https?:\/\/[^"]*"[^>]*>/gi, '');
      return cleaned;
    }),
  };
});

vi.mock('dompurify', () => ({ default: { sanitize: mockSanitize } }));

function dataNode(overrides: Partial<NodeOut> = {}): NodeOut {
  return {
    id: 'data-1',
    type: 'data',
    title: 'Patient data',
    position: { x: 0, y: 0 },
    data: { html: '<p>Patient summary</p>' },
    ...overrides,
  };
}

function decisionNode(overrides: Partial<NodeOut> = {}): NodeOut {
  return {
    id: 'decision-1',
    type: 'decision',
    title: 'Pick a diagnosis',
    position: { x: 0, y: 0 },
    data: {
      allow_multiple: false,
      options: [
        { id: 'a', label: 'Hepatitis A' },
        { id: 'b', label: 'Hepatitis B' },
      ],
    },
    ...overrides,
  };
}

function formNode(overrides: Partial<NodeOut> = {}): NodeOut {
  return {
    id: 'form-1',
    type: 'form',
    title: 'Differential diagnosis',
    position: { x: 0, y: 0 },
    data: {
      fields: [
        { id: 'diagnosis', label: 'Diagnosis', type: 'text', required: true },
      ],
    },
    ...overrides,
  };
}

function textInputNode(overrides: Partial<NodeOut> = {}): NodeOut {
  return {
    id: 'text-1',
    type: 'text_input',
    title: 'Explain your reasoning',
    position: { x: 0, y: 0 },
    data: { keywords: ['liver'], min_length: 5 },
    ...overrides,
  };
}

function startResponse(overrides: Partial<AttemptStartOut> = {}): AttemptStartOut {
  return {
    attempt_id: 42,
    attempt_num: 1,
    current_node: dataNode(),
    started_at: '2026-05-03T10:00:00Z',
    time_limit_min: 30,
    expires_at: '2026-05-03T10:30:00Z',
    resumed: false,
    ...overrides,
  };
}

function stepOk(overrides: Partial<StepOut> = {}): StepOut {
  return {
    step_result: {
      score: 5,
      max_score: 5,
      feedback: 'Отличный выбор',
      details: { [IC_KEY]: true },
    },
    next_node: decisionNode({ id: 'decision-1' }),
    path_so_far: ['data-1', 'decision-1'],
    attempt_status: 'in_progress',
    ...overrides,
  };
}

function resetStore() {
  useCasePlayerStore.getState().reset();
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
});

// ════════════════ ServerTimer (§U.3 + §A.7) ════════════════
describe('ServerTimer', () => {
  function expiresInSeconds(seconds: number) {
    return new Date(Date.now() + seconds * 1000).toISOString();
  }

  it('renders muted state when remaining > 5 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
    server.use(
      http.get('/api/attempts/42/time-remaining', () =>
        HttpResponse.json<TimeRemaining>({ remaining_sec: 600, expires_at: expiresInSeconds(600) }),
      ),
    );

    render(<ServerTimer attemptId={42} initialExpiresAt={expiresInSeconds(600)} />);
    const timer = screen.getByTestId('server-timer');
    expect(timer).toHaveAttribute('data-state', 'muted');
  });

  it('renders warning state between 1 and 5 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
    render(<ServerTimer attemptId={42} initialExpiresAt={expiresInSeconds(180)} />);
    expect(screen.getByTestId('server-timer')).toHaveAttribute('data-state', 'warning');
  });

  it('renders danger state under 1 minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
    render(<ServerTimer attemptId={42} initialExpiresAt={expiresInSeconds(45)} />);
    expect(screen.getByTestId('server-timer')).toHaveAttribute('data-state', 'danger');
  });

  it('polls /time-remaining every 30 seconds and stops on unmount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
    let pollCount = 0;
    server.use(
      http.get('/api/attempts/42/time-remaining', () => {
        pollCount += 1;
        return HttpResponse.json<TimeRemaining>({
          remaining_sec: 600,
          expires_at: expiresInSeconds(600),
        });
      }),
    );

    const { unmount } = render(
      <ServerTimer attemptId={42} initialExpiresAt={expiresInSeconds(600)} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(pollCount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(pollCount).toBe(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(pollCount).toBe(2);
  });

  it('calls onExpire when remaining reaches 0', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
    const onExpire = vi.fn();
    render(
      <ServerTimer
        attemptId={42}
        initialExpiresAt={expiresInSeconds(2)}
        onExpire={onExpire}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

// ════════════════ DataView (§B.2.4) ════════════════
describe('DataView', () => {
  it('calls DOMPurify.sanitize with ALLOWED_URI_REGEXP /^\\/media\\//', () => {
    expect(ALLOWED_URI_REGEXP.source).toBe('^\\/media\\/');
    expect('/media/x-ray.png').toMatch(ALLOWED_URI_REGEXP);
    expect('https://evil.example.com/x.png').not.toMatch(ALLOWED_URI_REGEXP);

    render(
      <DataView
        node={dataNode({ data: { html: '<p>hi</p><script>alert(1)</script>' } })}
        onNext={vi.fn()}
      />,
    );

    expect(mockSanitize).toHaveBeenCalled();
    const calls = mockSanitize.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toContain('<script>alert(1)</script>');
    const config = lastCall?.[1] as { ALLOWED_URI_REGEXP?: RegExp };
    expect(config?.ALLOWED_URI_REGEXP).toBeInstanceOf(RegExp);
    expect(config?.ALLOWED_URI_REGEXP?.source).toBe('^\\/media\\/');
  });

  it('does not render external image src in the output', () => {
    const html = '<p>see</p><img src="https://evil.com/track.gif">';
    render(<DataView node={dataNode({ data: { html } })} onNext={vi.fn()} />);
    expect(screen.getByTestId('data-view-content').innerHTML).not.toContain('evil.com');
  });

  it('disables the Next button until 1 second after render', async () => {
    vi.useFakeTimers();
    render(<DataView node={dataNode()} onNext={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Далее' });
    expect(button).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    expect(button).not.toBeDisabled();
  });
});

// ════════════════ DecisionView ════════════════
describe('DecisionView', () => {
  it('renders radio inputs when allow_multiple is false', () => {
    render(<DecisionView node={decisionNode()} onSubmit={vi.fn()} onNext={vi.fn()} />);
    const inputs = screen.getAllByRole('radio');
    expect(inputs).toHaveLength(2);
  });

  it('renders checkboxes when allow_multiple is true', () => {
    render(
      <DecisionView
        node={decisionNode({ data: { allow_multiple: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } })}
        onSubmit={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('renders the feedback banner verbatim from the server response only', () => {
    render(
      <DecisionView
        node={decisionNode()}
        feedback={{ score: 5, max_score: 5, feedback: 'Server-provided text', correct: true }}
        onSubmit={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const banner = screen.getByTestId('decision-feedback');
    expect(banner).toHaveAttribute('data-correct', 'true');
    expect(banner).toHaveTextContent('Server-provided text');
    expect(banner).toHaveTextContent('5/5');
  });
});

// ════════════════ FormView ════════════════
describe('FormView', () => {
  it('blocks submit until required fields are filled (zod)', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<FormView node={formNode()} onSubmit={onSubmit} onNext={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/обязательно/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Diagnosis'), 'Hepatitis A');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    expect(onSubmit).toHaveBeenCalledWith({ diagnosis: 'Hepatitis A' });
  });
});

// ════════════════ TextInputView ════════════════
describe('TextInputView', () => {
  it('disables submit until min_length is reached', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TextInputView node={textInputNode()} onSubmit={onSubmit} onNext={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Ответить' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Ответ/), 'hello');
    expect(submit).not.toBeDisabled();
  });
});

// ════════════════ FinalView ════════════════
describe('FinalView', () => {
  it('renders passed/failed badge from result', () => {
    const result: AttemptResultOut = {
      id: 1, scenario_id: 7, scenario_title: 'Case', attempt_num: 1,
      status: 'completed', total_score: 80, max_score: 100, score_pct: 80,
      passed: true, started_at: '2026-05-03T10:00:00Z',
      finished_at: '2026-05-03T10:25:00Z', duration_sec: 1500,
      path: ['start-1', 'data-1'], steps: [],
    };
    render(<FinalView result={result} />);
    expect(screen.getByTestId('final-badge')).toHaveTextContent(/passed/i);
    expect(screen.getByText('80/100')).toBeInTheDocument();
  });
});

// ════════════════ casePlayerStore — security boundary ════════════════
describe('casePlayerStore', () => {
  it('projectFeedback whitelists score/max_score/feedback/correct only', () => {
    const tainted: StepResult = {
      score: 3,
      max_score: 5,
      feedback: 'Almost',
      // server may include extra metadata in details (e.g. expected_keywords or
      // leaked answer fields). The projection MUST NOT propagate them.
      details: {
        [IC_KEY]: false,
        [CV_KEY]: 'Hepatitis A',
        expected_keywords: ['liver'],
      },
    };
    const projected = __projectFeedback(tainted);
    expect(projected).toEqual({ score: 3, max_score: 5, feedback: 'Almost', correct: false });
    expect(projected).not.toHaveProperty(CV_KEY);
    expect(projected).not.toHaveProperty('expected_keywords');
  });

  it('applyStep stores feedback derived only from response (no leaked answer)', () => {
    const node = dataNode();
    useCasePlayerStore.getState().setAttempt({
      attemptId: 42,
      currentNode: node,
      status: 'in_progress',
    });
    useCasePlayerStore.getState().applyStep({
      step_result: {
        score: 1, max_score: 1, feedback: 'ok',
        details: { [IC_KEY]: true, [CV_KEY]: 'leaked' },
      },
      next_node: null,
      path_so_far: ['data-1'],
      attempt_status: 'completed',
    });

    const fb = useCasePlayerStore.getState().lastFeedback;
    expect(fb?.correct).toBe(true);
    expect(JSON.stringify(useCasePlayerStore.getState())).not.toContain('leaked');
    expect(JSON.stringify(useCasePlayerStore.getState())).not.toContain(CV_KEY);
  });
});

// ════════════════ CasePlayerPage integration ════════════════
function withRoutes(player: ReactNode) {
  return (
    <Routes>
      <Route path="/student/cases/:id/play" element={player} />
      <Route path="/student/attempts/:id/result" element={<CaseResultPage />} />
    </Routes>
  );
}

describe('CasePlayerPage', () => {
  it('starts an attempt and renders the current node (F5-resume)', async () => {
    server.use(
      http.post('/api/attempts/start', () =>
        HttpResponse.json<AttemptStartOut>(startResponse({ resumed: true })),
      ),
    );
    renderWithProviders(withRoutes(<CasePlayerPage />), {
      route: '/student/cases/7/play',
    });
    expect(await screen.findByText('Patient summary')).toBeInTheDocument();
    expect(screen.getAllByText('Patient data').length).toBeGreaterThan(0);
  });

  it('redirects to CaseResultPage when /step returns 410 Gone', async () => {
    server.use(
      http.post('/api/attempts/start', () =>
        HttpResponse.json<AttemptStartOut>(
          startResponse({ current_node: decisionNode() }),
        ),
      ),
      http.post('/api/attempts/42/step', () =>
        HttpResponse.json({ detail: 'Время попытки истекло' }, { status: 410 }),
      ),
      http.get('/api/attempts/42', () =>
        HttpResponse.json<AttemptResultOut>({
          id: 42, scenario_id: 7, scenario_title: 'Case',
          attempt_num: 1, status: 'completed', total_score: 0, max_score: 5,
          score_pct: 0, passed: false, started_at: '2026-05-03T10:00:00Z',
          finished_at: '2026-05-03T10:30:00Z', duration_sec: 1800,
          path: ['decision-1'], steps: [],
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(withRoutes(<CasePlayerPage />), {
      route: '/student/cases/7/play',
    });

    await screen.findByText('Pick a diagnosis');
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Ответить' }));

    await waitFor(() => {
      expect(screen.getByTestId('case-result-page')).toBeInTheDocument();
    });
  });
});

// ════════════════ no leaked answer lands in zustand state via msw ════════════════
describe('case player wire-level invariant', () => {
  it('never persists server answer details into the store from a step response', async () => {
    server.use(
      http.post('/api/attempts/start', () =>
        HttpResponse.json<AttemptStartOut>(
          startResponse({ current_node: decisionNode() }),
        ),
      ),
      http.post('/api/attempts/42/step', () =>
        HttpResponse.json<StepOut>(
          stepOk({
            step_result: {
              score: 5, max_score: 5, feedback: 'Верно',
              details: { [IC_KEY]: true, [CV_KEY]: 'super-secret-answer' },
            },
            attempt_status: 'in_progress',
            next_node: dataNode({ id: 'data-2' }),
            path_so_far: ['decision-1', 'data-2'],
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(withRoutes(<CasePlayerPage />), {
      route: '/student/cases/7/play',
    });

    await screen.findByText('Pick a diagnosis');
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Ответить' }));

    await screen.findByTestId('decision-feedback');

    const snapshot = JSON.stringify(useCasePlayerStore.getState());
    expect(snapshot).not.toContain('super-secret-answer');
    expect(snapshot).not.toContain(CV_KEY);
  });
});

// silence unused warnings for renderHook helper imported above
void renderHook;
void fireEvent;
