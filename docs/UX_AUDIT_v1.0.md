# UX Audit v1.0 — Stage 10

Дата: 2026-05-18  
Область: `client/` EpiCase, все маршруты из `client/src/App.tsx` после Stage 9.

## Методика

- Production build: `npm run build`.
- Import audit: TypeScript/Vite resolution + custom internal import graph check for missing imports and circular dependencies.
- Accessibility audit: ручная проверка WCAG AA по токенам, компонентам, keyboard-only сценариям и layout rules.
- Viewport target: 1024×768. Browser plugin runtime в текущей Codex-сессии не exposed; Chrome/Edge headless запускались как fallback, но не вернули screenshot artifact. Поэтому визуальная часть зафиксирована ручным аудитом кода, responsive classes и тестовых render paths.

## Проверенные страницы

Public/auth:

- `/login` — LoginPage.
- `/change-password` — ChangePasswordPage.
- `/forbidden` — ForbiddenPage.
- `*` — NotFoundPage.

Student:

- `/student` — StudentDashboard.
- `/student/cases` — MyCases.
- `/student/cases/:id/play` — CasePlayerPage.
- `/student/attempts/:id/result` — CaseResultPage.
- `/student/results` — MyResults.

Teacher:

- `/teacher` — TeacherDashboard.
- `/teacher/scenarios` — MyScenarios.
- `/teacher/scenarios/:id/edit` — ScenarioEditorPage.
- `/teacher/scenarios/:id/preview` — ScenarioPreview.
- `/teacher/scenarios/:id/analytics` — AnalyticsPage.
- `/teacher/analytics` — AnalyticsPage.
- `/teacher/groups` — GroupsPage.

Admin:

- `/admin` — AdminDashboard.
- `/admin/users` — UsersPage.
- `/admin/system` — SystemPage.
- `/admin/settings` — SettingsPage.

## Critical Findings Fixed

### UX-10-01 — Semantic text colors failed WCAG AA

Status: fixed.

Problem: original brand/semantic tokens used directly for text on light surfaces failed 4.5:1 contrast. Measured ratios on `#FFFFFF` / `#F8FAFC` included: `royal` 3.71 / 3.55, `cyan` 2.20 / 2.10, `success` 2.54 / 2.42, `warning` 2.15 / 2.05, `danger` 3.76 / 3.60. Primary action `bg-royal text-white` was also below AA.

Fix:

- Added AA text/action tokens in `client/src/styles/tokens.css`: `royal-ink`, `cyan-ink`, `purple-ink`, `success-ink`, `warning-ink`, `danger-ink`.
- Replaced text/status/action classes across UI kit, player, scenario editor, dashboards and admin pages.
- Kept base design-system colors for fills, charts, graph semantics and tinted backgrounds.

### UX-10-02 — Scenario Editor node creation was mouse-only

Status: fixed.

Problem: `NodePalette` supported drag-and-drop, but keyboard-only users could not add nodes.

Fix:

- Palette buttons now keep drag support and also add a node on normal button activation, so Enter/Space works.
- Added helper text: “Drag to canvas or press Enter to add a node.”

### UX-10-03 — Wide tables could clip content at 1024×768

Status: fixed.

Problem: shared `Table` wrapper used `overflow-hidden`, which could clip admin/user/result tables with many columns in the fixed-sidebar layout.

Fix:

- Changed table wrapper to `overflow-x-auto` and table to `min-w-full`, preserving layout while allowing horizontal access instead of clipping.

### UX-10-04 — Admin System KPI grid was too dense at 1024×768

Status: fixed.

Problem: `SystemPage` used `md:grid-cols-5`; with the 256px sidebar, content width at 1024 was too narrow for five KPI cards.

Fix:

- Changed to `md:grid-cols-2 xl:grid-cols-5`.

### UX-10-05 — Scenario Editor height could overflow 768px viewport

Status: fixed.

Problem: editor used `h-[calc(100vh-5rem)]` inside `AppLayout` that already has topbar + main padding, risking vertical overflow at 768px height.

Fix:

- Changed editor root to `h-[calc(100vh-8rem)]`.

### UX-10-06 — Circular dependency in auth stack

Status: fixed.

Problem: import audit found `api/client.ts -> stores/authStore.ts -> api/auth.ts -> api/client.ts`.

Fix:

- Added `api/authSession.ts` with a minimal no-interceptor axios client for login/refresh.
- `authStore` now depends on `authSessionApi`, while `api/auth.ts` can keep full authenticated `logout/me` calls.

## Passed Manual Checks

- Inputs have visible labels through `Input` or explicit `<label>` wrappers on filters/forms.
- Modal and ConfirmDialog retain focus trap / Escape close / cancel-first behavior from Stage 5 tests.
- ProtectedRoute and catch-all NotFound route still preserve navigation fallbacks.
- Player feedback, timer states and admin health/maintenance states no longer rely on low-contrast text tokens.
- React Flow heavy screens keep min-width guarded by `minmax(0,1fr)` and now have a keyboard add-node fallback.
- Tables and card grids use wrapping/flex/scroll behavior instead of fixed-width clipping for 1024×768.

## Backlog V2

- Add real automated axe coverage with Playwright/Browser plugin once browser automation is available in CI/local environment.
- Split the main Vite bundle with dynamic imports/manual chunks; current large chunk is allowed for Stage 10 but should be optimized before wider rollout.
- Add a collapsible/mobile sidebar for widths below 1024px. Stage 10 target was 1024×768, not phone layouts.
- Add more non-color redundancy to chart legends and React Flow heatmaps for users with color-vision deficiencies.
- Add scripted keyboard traversal smoke tests for core routes after stable seeded e2e data is available.

## Verification Checklist

- `npm run build` — required final gate.
- Internal import graph — required final gate: missing imports = 0, circular dependencies = 0.
- `npm run typecheck` — required final gate.
- `npm run test` — required final gate.
- `bash scripts/verify.sh` — required final gate.