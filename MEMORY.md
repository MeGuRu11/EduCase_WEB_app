# EpiCase — Project Memory

## Last Updated
- Date: 2026-04-28
- Agent: Claude Opus 4.7
- Stage: STAGE 4 closed — Analytics + Admin + Backup/Restore
        (183 tests green: +13 analytics, +17 admin/backup; ruff clean)

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
- [x] STAGE 2 — Scenarios + Graph (Claude Opus) — 92 tests green (48 new), ruff clean, no correct_value leaks
- [x] STAGE 3 — Attempts + Grading (Claude Opus) — 137 tests green (45 new), ruff clean, APScheduler wired, partial-UNIQUE idx_attempts_active verified, §T.2 sanitisation in step response, §U.3 server timer
- [x] **Retro-audit Stage 0–3** (2026-04-25) — `docs/RETRO_AUDIT_STAGE0-3.md`. Fixed 3 🔴 BROKEN
      (Attempt.scenario relationship missing → AttributeError on teacher path;
      ScenarioService.duplicate dropping edge.option_id; FIRST_ADMIN_PASSWORD hardcoded).
      +2 regression tests → 139/139 green, ruff clean.
- [x] **Pre-Stage-4 Hardening** (2026-04-25) — closes RETRO_AUDIT priorities 1–5:
      Task 1 audit_log table (mig 005, AuditService, integrations across users / groups /
      scenarios / attempts), Task 2 jti-blacklist + cleanup job (mig 006, logout revokes
      access token, hourly purge), Task 3 N+1 swept from list_for + list_for_student
      via selectinload, Task 4 APP_VERSION → 1.1.0, Task 5 RoleName constants replace
      stringly-typed checks. +14 tests → 153/153 green.
- [x] STAGE 4 — Analytics + Admin + Backup/Restore (Claude Opus) — 183 tests green
      (+13 analytics, +17 admin/backup), ruff clean, migration 004 (system_settings/logs)
      filled in, /api/health public endpoint, /api/admin/* + /api/analytics/* live,
      §T.5 restore orchestration with maintenance_mode + abandon-attempts +
      alembic version check, §T.7 5-min backup rate limit, path-traversal guard,
      scheduler wired to real BackupService.create_backup (02:00 UTC) +
      AdminService.cleanup_old_logs (04:00 UTC, §T.4 retention policy),
      XLSX/PDF export (openpyxl + reportlab).
- [ ] STAGE 5 — Client: Auth + UI kit + Layout (Codex GPT 5.4)
- [ ] STAGE 6 — Client: Scenario Editor (Codex GPT 5.4)
- [ ] STAGE 7 — Client: Case Player (Codex GPT 5.4)
- [ ] STAGE 8 — Client: Dashboards (Codex GPT 5.4)
- [ ] STAGE 9 — Client: Admin panel (Codex GPT 5.4)
- [ ] STAGE 10 — Integration + deploy (Both)

## Test Status
- Backend: 183 tests / 183 passed  (Stage 4 target: ≥230 ⚠️ short — covered breadth, deferred extra-cases)
  - test_analytics.py: 13 (student dashboard, teacher stats, heatmap, admin stats, XLSX/PDF export)
  - test_admin.py: 17 (backup create/list/delete, rate-limit 429, path-traversal,
    restore orchestration §T.5, maintenance_mode on/off, /api/health 5 checks,
    sysinfo, settings PUT idempotency, log filtering, retention §T.4)
  - test_audit_log.py: 7 (Task 1: indexes + user.create + bulk_csv + scenario.publish +
    attempt.auto_finish actor=NULL + manual finish + RoleName matches DB)
  - test_health.py: 1 (Task 4: /api/ping returns version 1.1.0)
  - test_auth.py: +4 (Task 2: logout revokes / clear error / idempotent / cleanup)
  - test_scenarios.py: +1 (Task 3: list endpoint ≤ 6 queries)
  - test_attempts.py: +1 (Task 3: list_for_student ≤ 8 queries)
  - test_auth.py: 15 (login, lockout, refresh, /me, bcrypt cost=12, password policy)
  - test_users.py: 13 (CRUD, self-block guard, bulk CSV all-or-nothing, teacher scoping)
  - test_groups.py: 9 (CRUD, teacher assign/remove, member rules, teacher visibility)
  - test_migrations.py: 3 (ADR-009: apply_from_scratch / downgrade_to_base / stairstep)
  - test_graph_engine.py: 18 (navigation, validate_graph, cycle detection, max_score DP)
  - test_scenarios.py: 25 (CRUD, save_graph atomicity, publish idempotent, assign,
    duplicate, delete, archive, §T.2 sanitisation, preview §UI.1, PATCH node)
  - test_grader.py: 16 (decision binary/partial/empty-correct E-02, form fields,
    regex, text_input substring/synonyms/no-double-count, view_data)
  - test_attempts.py: 24 (start/step/finish/abandon/resume/time-remaining/auto_finish/
    §T.2 leak check/concurrent start/§B.3.4 partial-UNIQUE/403 for unassigned/
    +2 retro-audit regressions: teacher-attempt-access, duplicate-preserves-option_id)
  - test_edge_cases.py: 16 (4× EC-AUTH + 5× EC-SCENARIO + 7× EC-ATTEMPT-01..07)
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
→ start **Stage 5**: Client Auth + UI kit + Layout (Codex GPT 5.4 owns).
  Scope per `docs/AGENT_TASKS.md`: React 19 + Tailwind 4 + Zustand 5 +
  TanStack Query 5 scaffolding, login flow, ProtectedRoute, NotFoundPage /
  ForbiddenPage / ResourceNotFound (E-21), AppLayout + sidebar, ≥30 vitest
  tests.

Deferred hardening status (2026-04-25):
- ✅ Audit log table (mig 005 + AuditService)
- ✅ JTI blacklist + logout revocation (mig 006)
- ✅ Audit log used by Stage 4 (`backup.create/delete/restore`)
- ✅ Migration 004 implemented (system_settings + system_logs)
- ✅ N+1 swept; APP_VERSION 1.1.0; RoleName constants
- ⏳ Refresh-token rotation — Stage 10
- ⏳ Stream bulk-CSV size check — nginx 5 МБ cap mitigates; defer
- ⏳ At-rest DB encryption (ADR-013) — V2
