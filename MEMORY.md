# EpiCase — Project Memory

## Last Updated
- Date: 2026-04-21
- Agent: Claude Opus 4.7
- Stage: STAGE 1 closed — Auth + Users + Groups (44 tests green)

## Workflow Rule
**Test → Green → Code → Green → Stage complete → Commit**
- NEVER commit with failing tests
- NEVER commit mid-stage
- Commit = stage boundary only

## Current Status
- [x] Starter archive unpacked
- [x] **Design system v1.0 integrated**
      (client/public/branding.svg + design/DESIGN_SYSTEM.md + client/src/styles/tokens.css)
- [x] **Audit completed** — 40 gaps identified, 27 (all CRITICAL + all IMPORTANT) closed
      in `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md`
- [x] **Errata v1.1.1** — 12 technical errors found in patch and fixed
      (see `docs/ERRATA_v1.1.3.md`)
- [x] **Lead model updated**: Claude Opus 4.6 → Claude Opus 4.7
      (`.claude/settings.json`, `CLAUDE.md`, `AGENTS.md`, all docs)
- [x] **Agent distribution documented** — `docs/AGENT_TASKS.md` + `docs/AGENT_ROSTER.md`
- [x] **Architecture Decision Records** — `docs/ARCHITECTURE_DECISIONS.md`
      (13 ADR: 8 отклонено — Redis/k8s/CDN/Celery/Prometheus/CI-cloud/sharding;
       4 принято — migration tests, health-check endpoint, in-app error alerts, deploy scripts;
       1 принятый risk — at-rest encryption deferred to V2)
- [x] **Best Practices** — `docs/BEST_PRACTICES.md`
      (5 областей из system-design-primer: REST sanity, OWASP security, ACID transactions,
       DB indexing, latency reference. 8 дополнительных исправлений E-13..E-20)
- [x] **Ruflo review** — ADR-014 фиксирует отказ от полной интеграции.
      Взяты 3 концептуальных паттерна: statusline (`.claude/statusline.sh`),
      post-stage hook (`.claude/hooks/post-stage.sh`), SPARC-TDD methodology в CLAUDE.md.
- [x] **Agent Prompts** — `docs/AGENT_PROMPTS.md` (1119 строк, 12 готовых промптов
      для Stage 0-10 + debug/review/deps/revert).
- [x] **Design System v1.1** — интеграция от Claude Design:
      `design/EpiCase_Design_System.html` (основной интерактивный референс),
      `branding.svg` 30 symbols (+3 arrow markers для ChoiceEdge),
      Teacher Dashboard wireframe в HTML.
- [x] **Frontend 404 / not-found pattern (E-21)** — спроектирован:
      NotFoundPage + ForbiddenPage + ResourceNotFound + useResourceQuery.
      Catch-all route в App.tsx. Правила code-reviewer зафиксированы.
      Реализация — в Stage 5 (обновлены AGENT_TASKS и AGENT_PROMPTS).
- [x] STAGE 0 — docker compose up, /api/ping → 200
- [x] STAGE 1 — Auth + Users + Groups (Claude Opus) — 44 tests green, ruff clean, mypy clean, security audit passed
- [ ] STAGE 2 — Scenarios + Graph (Claude Opus)
- [ ] STAGE 3 — Attempts + Grading (Claude Opus)
- [ ] STAGE 4 — Analytics + Admin (Claude Opus)
- [ ] STAGE 5 — Client: Auth + UI kit + Layout (Codex GPT 5.4)
- [ ] STAGE 6 — Client: Scenario Editor (Codex GPT 5.4)
- [ ] STAGE 7 — Client: Case Player (Codex GPT 5.4)
- [ ] STAGE 8 — Client: Dashboards (Codex GPT 5.4)
- [ ] STAGE 9 — Client: Admin panel (Codex GPT 5.4)
- [ ] STAGE 10 — Integration + deploy (Both)

## Test Status
- Backend: 44 tests / 44 passed  (Stage 1 target: ≥30 ✓)
  - test_auth.py: 15 (login, lockout, refresh, /me, bcrypt cost=12, password policy)
  - test_users.py: 13 (CRUD, self-block guard, bulk CSV all-or-nothing, teacher scoping)
  - test_groups.py: 9 (CRUD, teacher assign/remove, member rules, teacher visibility)
  - test_migrations.py: 3 (ADR-009: apply_from_scratch / downgrade_to_base / stairstep)
  - test_edge_cases.py: 4 (EC-AUTH-01 ≤7 chars / EC-AUTH-02 5-tries lock / EC-AUTH-03 expired refresh / EC-AUTH-04 two browsers)
- Frontend: 0 tests / 0 passed  (Stage 5 target: ≥26)

## Decisions (DO NOT CHANGE)
- JSONB for node_data (§9) + GIN index `idx_nodes_data_gin` (ADDENDUM §Q)
- React Flow v12 (@xyflow/react)
- Zustand v5 + immer
- PUT /graph — full replace, debounce 30s
- Tailwind CSS v4 via @theme tokens (DESIGN_SYSTEM §10.1)
- PostgreSQL 16
- Icons: SVG sprite `/branding.svg` + `<Icon/>` wrapper
- Palette: #5680E9 / #84CEEB / #5AB9EA / #C1C8E4 / #8860D0 + utility (#10B981 / #F59E0B / #EF4444)
- Timer: server-authoritative (`attempts.expires_at`), client polls every 30s (ADDENDUM §U.3)
- Migrations numbered: 001 users → 002 scenarios → 003 attempts → 004 system (ADDENDUM §MIG)

## Problems (UNRESOLVED)
(none — all CRITICAL/IMPORTANT closed in ADDENDUM v1.1)

## Problems (RESOLVED)
- §20 Gemini confusion → rewritten as Claude + Codex pair (ADDENDUM §X)
- Pydantic schemas were named but not defined → full definitions in ADDENDUM §R
- Password regex missing Ё/ё → fixed (ERRATA E-03)
- Division by zero in partial scoring → guarded (ERRATA E-02)
- Restore orchestration undefined → full procedure with version check (ADDENDUM §T.5 + ERRATA E-04)
- ProtectedRoute behavior undefined → 4-case spec (ADDENDUM §U.8)
- Server-authoritative timer → fully specified (ADDENDUM §U.3)
- Bulk CSV format undefined → UTF-8 BOM + `;` + 6 columns (ADDENDUM §T.6)
- Lead model: Opus 4.6 → Opus 4.7 (2026-04-16 release)

## Next Action
→ start **Stage 2**: Scenarios + Graph Editor (TDD, Claude Opus 4.7 owns).
  Scope: scenarios table + scenario_nodes + scenario_edges + ScenarioService
  (PUT /graph with full-replace + version lock), graph_engine.validate_graph
  (effort=xhigh), access rules for teacher/student roles, role-based
  sanitize_scenario_for_student (§T.2).

Deferred Stage 1 hardening (tracked but not blockers — audit: no Critical/High):
- Audit log table (actor_id on mutations) — needed before Stage 3 grading
- Refresh-token rotation + jti-based logout blacklist
- Stream bulk-CSV size check instead of post-buffer
- Read FIRST_ADMIN_PASSWORD from env; keep must_change_password=True
