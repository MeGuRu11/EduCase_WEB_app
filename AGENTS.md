# EpiCase — Project Instructions
# Read by: Claude Code (claude) + Codex CLI (codex)

## Source of Truth
- `docs/PROJECT_DESIGN_EPICASE_v1.md` — base design (v1.0)
- `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md` — closes 27 critical/important gaps (v1.1)
- `design/DESIGN_SYSTEM.md` — visual identity, tokens, components (v1.0)
- `docs/AGENT_TASKS.md` — per-stage work distribution
- `docs/AGENT_ROSTER.md` — compact "who does what" master list

При конфликте между документами приоритет: ADDENDUM > base design.
Never invent APIs, models, or types outside these sources.

## Stack
- Backend: FastAPI + SQLAlchemy 2 + PostgreSQL 16 + Alembic + pytest
- Frontend: React 19 + TS + @xyflow/react 12 + Zustand 5 + TanStack Query 5 + Tailwind 4
- Infra: Docker Compose + Nginx
- Deploy: Docker images → tar → isolated VMedA server (NO internet!)

## Agent Roles
- **Claude Opus 4.7**: architecture, backend, security audit, code review, graph_engine, grader_service, backup_service
- **Codex GPT 5.4**: fast code generation, React components, tests, frontend, UI scaffolding

Full per-stage distribution: `docs/AGENT_TASKS.md`.
Compact roster: `docs/AGENT_ROSTER.md`.

## ⚠️ STRICT WORKFLOW: Test → Green → Code → Green → Commit

### Step 1: Write tests FIRST
- Backend: pytest test covering the feature (min 3 per endpoint)
- Frontend: vitest test covering the component (min 2 per component)
- Run tests → confirm they FAIL (red) — this proves the test is valid

### Step 2: Write implementation
- Write the minimum code to make tests pass
- Run tests → confirm they PASS (green)
- If any test fails → fix code, NOT the test

### Step 3: Verify EVERYTHING
- Run FULL test suite: `pytest server/tests/ -v && cd client && npx vitest run`
- Run linters: `ruff check server/` and `cd client && npx tsc --noEmit`
- ALL tests green + zero lint errors = ready

### Step 4: Commit ONLY when stage is complete
- Commit happens ONLY at the end of a completed stage (§13)
- NEVER commit mid-stage or with failing tests
- NEVER commit with known problems or TODO-later items
- Format: `feat|fix|test: Stage N — description [all tests green]`
- Stage 0 exception: `feat: Stage 0 — infrastructure verified + design system [no tests yet]`

### If tests are NOT green:
- DO NOT commit
- DO NOT move to next task
- Fix until ALL green, then commit the entire stage

## Three Roles (§14)
- Admin = users, groups, access, backups
- Teacher = scenarios + assign to groups + analytics
- Student = pass cases + own results

## Anti-patterns (§17 + ADDENDUM)
- DO NOT write code without a test first
- DO NOT commit with failing tests
- DO NOT commit mid-stage
- DO NOT store correct_value on client (enforced by pre-commit grep)
- DO NOT grade answers on client
- DO NOT make API calls without loading state
- DO NOT PUT /graph on every drag — debounce 30s
- DO NOT docker compose build on VMedA server
- DO NOT hardcode hex colors — use tokens from `client/src/styles/tokens.css`
- DO NOT set `temperature`, `top_p`, `top_k` in any Anthropic API call — Opus 4.7 rejects these (400)

## Commands
- `pytest server/tests/ -v` — backend tests
- `cd client && npx vitest run` — frontend tests
- `ruff check server/` — lint Python
- `cd client && npx tsc --noEmit` — check TypeScript

## Design System
- Tokens:      `client/src/styles/tokens.css`  (see ADDENDUM §D + DESIGN_SYSTEM §10)
- Sprite SVG:  `client/public/branding.svg`    (logo + 26 icons)
- Full spec:   `design/DESIGN_SYSTEM.md`       (12 sections, read before any UI work)

## Git Policy
- Commit = stage complete + ALL tests green + zero lint errors
- Format: `feat: Stage N — description [all tests green]`
- After each session: update MEMORY.md with results
- Commit MEMORY.md together with code changes
