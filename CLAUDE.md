# EpiCase — Claude Code Instructions
@AGENTS.md

## Your Role (Claude Opus 4.7)
Architecture, backend (FastAPI + SQLAlchemy), security, code review,
graph_engine (§10), grader_service (§11), database schema (§8).

## Effort levels (Opus 4.7)
Opus 4.7 introduces the `xhigh` effort level between `high` and `max`.
Calibrate effort to task complexity:

- `medium` → simple CRUD routers, Pydantic schemas, models, migrations
- `high`   → business logic in services, integration tests, grader edge cases
- `xhigh`  → `graph_engine.validate_graph`, `grader_service` full suite,
            `backup_service.restore_backup`, security audits, any task
            touching auth/authz or data integrity

When unsure — default to `high`. Never use `medium` for code that touches
security, concurrency, or the grader.

## ⚠️ MANDATORY WORKFLOW — every task, no exceptions:
1. Write TEST first → run → confirm RED (test fails, proving it's valid)
2. Write CODE → run → confirm GREEN (test passes)
3. Run FULL suite → ALL green? → proceed
4. Stage complete? → ALL tests green + zero lint? → COMMIT
5. Update MEMORY.md → include in commit

If anything is red → FIX. Do not skip. Do not commit.

## Context7 MCP
BEFORE writing code with ANY library: use context7
Libraries: fastapi, sqlalchemy, alembic, pydantic, bcrypt, python-jose, pytest

MCP config: `.claude/mcp/context7.json` (see ADDENDUM §M.1).

## Skills (.claude/skills/)
Read relevant skill BEFORE writing code.

## Design system
Before any UI-adjacent decision or task involving `client/`:
read `design/DESIGN_SYSTEM.md` and reference `client/public/branding.svg`.
Never hardcode colors — use tokens from `client/src/styles/tokens.css`.

## Methodology: SPARC-TDD

EpiCase follows an adapted SPARC methodology (from the agentic engineering community)
combined with strict test-driven development. For each Stage (§13 in PROJECT_DESIGN):

- **S — Specification**: read `docs/PROJECT_DESIGN_EPICASE_v1.md`
  + `PROJECT_DESIGN_ADDENDUM_v1.1.md`. Do NOT invent APIs or schemas not defined there.
- **P — Pseudocode via tests**: write failing pytest/vitest tests first (TDD RED).
  Tests encode the specification in executable form.
- **A — Architecture**: consult `docs/ARCHITECTURE_DECISIONS.md` before introducing
  new dependencies. If a decision isn't covered by an existing ADR, pause and write one.
- **R — Refinement**: implement → run tests → iterate until GREEN. For complex code
  (graph_engine, grader_service, backup_service) use effort=`xhigh`.
- **C — Completion**: full suite green + ruff clean + tsc clean → commit with
  `[all tests green]` marker on the stage boundary. Then run:
  `bash .claude/hooks/post-stage.sh <N>` to auto-update MEMORY.md.

This is NOT Ruflo's SPARC (which includes hive-mind swarm coordination — see ADR-014).
It's the simpler Specification → Pseudocode → Architecture → Refinement → Completion loop,
adapted to our one-agent-per-stage ownership model.

## Hooks

Available pre/post hooks in `.claude/hooks/`:
- `pre-commit.sh` — BLOCKS commit unless all checks pass
- `lint-on-save.sh` — auto-format .py/.tsx on save
- `post-stage.sh` — after stage commit, updates MEMORY.md ([ ]→[x], Last Updated, test counts)

Statusline is configured via `statusLine` in `settings.json` and rendered by
`.claude/statusline.sh`. Shows: branch, model, context usage, current stage, test counts.

## Addendum v1.1
This project's source of truth is `docs/PROJECT_DESIGN_EPICASE_v1.md`
**plus** `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md` (closes 27 gaps from the
original design doc). When in conflict, ADDENDUM wins.
