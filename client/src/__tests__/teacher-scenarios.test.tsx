import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import MyScenarios from '@/pages/teacher/MyScenarios';
import type { ScenarioFullOut, ScenarioListOut } from '@/types/scenario';
import { server } from './setup';
import { renderWithProviders } from './testUtils';

const now = '2026-05-02T09:00:00Z';

function listScenario(patch: Partial<ScenarioListOut> = {}): ScenarioListOut {
  return {
    id: 7,
    title: 'Draft case',
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

function fullScenario(patch: Partial<ScenarioFullOut> = {}): ScenarioFullOut {
  return { ...listScenario(), nodes: [], edges: [], published_at: null, ...patch };
}

function installHandlers() {
  server.use(
    http.get('/api/scenarios/', () => HttpResponse.json([listScenario()])),
    http.post('/api/scenarios/:id/publish', () => HttpResponse.json({ status: 'published', errors: [] })),
    http.post('/api/scenarios/:id/archive', () => HttpResponse.json(listScenario({ status: 'archived' }))),
  );
}

function renderWithEditorRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/teacher/scenarios" element={<MyScenarios />} />
      <Route path="/teacher/scenarios/:id/edit" element={<div>EDITOR PAGE</div>} />
    </Routes>,
    { route: '/teacher/scenarios' },
  );
}

describe('MyScenarios create / publish actions', () => {
  beforeEach(() => {
    installHandlers();
  });

  it('opens the create scenario modal when the button is clicked', async () => {
    const user = userEvent.setup();
    renderWithEditorRoute();
    await screen.findByText('Draft case');

    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Создать сценарий' }));

    expect(await screen.findByLabelText('Название')).toBeInTheDocument();
    expect(screen.getByLabelText('Описание')).toBeInTheDocument();
  });

  it('submits the form, posts the scenario, and redirects to the editor', async () => {
    const user = userEvent.setup();
    let posted: { title?: string; description?: string } | null = null;
    server.use(
      http.post('/api/scenarios/', async ({ request }) => {
        posted = (await request.json()) as { title?: string; description?: string };
        return HttpResponse.json(fullScenario({ id: 99, title: posted.title ?? '' }), { status: 201 });
      }),
    );

    renderWithEditorRoute();
    await screen.findByText('Draft case');
    await user.click(screen.getByRole('button', { name: 'Создать сценарий' }));

    await user.type(await screen.findByLabelText('Название'), 'Новый кейс');
    await user.type(screen.getByLabelText('Описание'), 'Описание кейса');
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(screen.getByText('EDITOR PAGE')).toBeInTheDocument());
    expect(posted).toEqual({ title: 'Новый кейс', description: 'Описание кейса' });
  });

  it('publishes a draft scenario from the row actions', async () => {
    const user = userEvent.setup();
    let publishedId: string | null = null;
    server.use(
      http.post('/api/scenarios/:id/publish', ({ params }) => {
        publishedId = String(params.id);
        return HttpResponse.json({ status: 'published', errors: [] });
      }),
    );

    renderWithEditorRoute();
    await screen.findByText('Draft case');

    await user.click(screen.getAllByRole('button', { name: 'Опубликовать' })[0]);

    await waitFor(() => expect(publishedId).toBe('7'));
  });
});
