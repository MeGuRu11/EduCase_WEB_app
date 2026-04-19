# EpiCase — Аудит скиллов и конфигурации AI-агентов

> Результат анализа 58 скриншотов (3 пачки)
> Источники: @leadgenman, @okaashish, @mike.mozg, @dashi_eshiev
> Сравнение с: PROJECT_DESIGN_EPICASE_v1.md (§22–§26)

---

## ВЕРДИКТ

**§22 (30 скиллов)** — уже покрывает все скиллы из скриншотов. Добавлять новые скиллы не нужно.

**Что действительно НОВОЕ** — архитектурные концепции организации AI-агентов из третьей пачки (leadgenman/.claude folder setup), которых в PROJECT_DESIGN пока нет:

---

## 1. ДОБАВИТЬ: `.agent/agents/` — Специализированные суб-агенты

**Чего нет в PROJECT_DESIGN:** В §24 (AGENTS.md) есть общие правила, но нет **отдельных агентов-специалистов** с собственными инструкциями, набором инструментов и моделью.

**Что даёт:** Claude Code автоматически делегирует задачу нужному агенту. Вместо одного "общего" AGENTS.md — 6 специалистов.

### Адаптация под EpiCase (Antigravity/.agent):

```
.agent/
├── agents/
│   ├── code-reviewer.md       ← Ревью кода перед коммитом
│   ├── debugger.md            ← Отладка сложных багов
│   ├── test-writer.md         ← Генерация тестов (§21 TDD)
│   ├── refactorer.md          ← Рефакторинг без изменения поведения
│   ├── security-auditor.md    ← Аудит безопасности (JWT, SQL, XSS)
│   └── doc-writer.md          ← Документация, docstrings, README
```

### Пример: `.agent/agents/code-reviewer.md`

```yaml
---
name: code-reviewer
description: Reviews code for bugs, security issues, and performance problems before merge.
tools: Read, Glob, Grep, Bash
model: sonnet
memory: project
---

You are EpiCase's senior code reviewer.
You review every PR as if it ships to military medical academy on day one.

## Step 1: Understand the diff
Run `git diff HEAD~1` to see all changes.
Read every modified file top to bottom.
Map which components/APIs were touched.

## Step 2: Security scan
- Grep for hardcoded API keys, tokens, passwords
- Check .env files are in .gitignore
- Verify Pydantic validation on all API inputs (FastAPI)
- Verify Zod validation on all form inputs (React)
- Check for SQL injection in raw queries
- Ensure no `dangerouslySetInnerHTML`
- Check JWT token handling (httpOnly, expiry)

## Step 3: Performance check
- No unnecessary re-renders (memo, useCallback)
- No blocking calls in React components
- SQLAlchemy queries use proper joins (no N+1)
- Check bundle size impact of new deps
- React Flow: debounce graph saves (§17 antipattern)

## Step 4: Code quality
- TypeScript strict: no `any`, no `as` casts
- Python: mypy clean, no # type: ignore without reason
- Functions under 50 lines
- No duplicated logic (DRY)
- Descriptive variable names (Russian OK in UI strings)
- Error boundaries around async operations

## Step 5: Report
Format: CRITICAL / WARNING / SUGGESTION
Always run `pytest server/tests/` and `cd client && npx vitest run` before approving.
Block the commit if any CRITICAL found.
```

### Пример: `.agent/agents/security-auditor.md`

```yaml
---
name: security-auditor
description: Audits EpiCase for OWASP Top 10, JWT vulnerabilities, role bypass.
tools: Read, Glob, Grep, Bash
model: opus
memory: project
---

You audit EpiCase for security issues specific to a military medical LAN app.

## Focus areas:
1. JWT: verify httpOnly cookie, token expiry, refresh rotation
2. Role checks: every /api/ endpoint must have require_role() dependency
3. SQL injection: all queries through SQLAlchemy ORM, no raw SQL
4. XSS: React escapes by default, but check dangerouslySetInnerHTML
5. CSRF: verify SameSite cookie, Origin header checks
6. File upload: validate MIME type, size limit, no path traversal
7. Backup endpoint: admin-only, no student/teacher access
8. Password: bcrypt cost=12, min length=8 enforced server-side
9. No secrets in frontend code (grep for JWT_SECRET, POSTGRES_PASSWORD)
10. Actor_id: all write operations must log who did what

## Output format:
| File | Line | Severity | Issue | Suggested Fix |
Sort by severity: critical > high > medium > low
```

---

## 2. ДОБАВИТЬ: `.agent/rules/` — Контекстные правила по пути файла

**Чего нет в PROJECT_DESIGN:** Правила в §24 (AGENTS.md) загружаются всегда целиком. Нет **автоматической загрузки правил** в зависимости от того, какой файл редактируется.

**Что даёт:** Агент, редактируя `server/routers/auth.py`, автоматически получает правила API. Редактируя `client/src/components/`, получает правила фронтенда. Не нужно загружать всё сразу.

### Адаптация под EpiCase:

```
.agent/
├── rules/
│   ├── frontend.md    ← Правила для client/src/**/*.tsx
│   ├── backend.md     ← Правила для server/**/*.py
│   ├── database.md    ← Правила для server/models/**/*.py, migrations/
│   └── api.md         ← Правила для server/routers/**/*.py
```

### `.agent/rules/frontend.md`

```yaml
---
paths:
  - "client/src/**/*.tsx"
  - "client/src/**/*.ts"
---

# Frontend Rules — EpiCase

## Components
- Functional components + hooks only, no class components
- shadcn/ui patterns for primitives (Button, Card, Modal, etc.)
- Tailwind CSS v4, utility-first, no inline styles
- Zustand for global state, no prop drilling past 2 levels
- cn() from clsx/tailwind-merge for conditional classes
- lucide-react for all icons

## React Flow (Конструктор)
- @xyflow/react v12 imports (NOT old 'reactflow' package)
- Custom nodes extend NodeProps from @xyflow/react
- Debounce graph save: 30 seconds (§17 antipattern)
- Never store correct_value in node data on client

## State Management
- Zustand v5 with immer middleware for scenarioEditorStore
- TanStack Query v5 for all server data
- No localStorage for auth tokens — httpOnly cookies preferred

## Testing
- Vitest + @testing-library/react
- Minimum 2 tests per component (render + interaction)
- MSW for API mocks

## TypeScript
- strict mode, no `any` types
- No `as` casts without explicit reason in comment
- All API responses typed via types/ directory
```

### `.agent/rules/backend.md`

```yaml
---
paths:
  - "server/**/*.py"
---

# Backend Rules — EpiCase

## FastAPI
- All routes use Depends(get_db) for session
- All protected routes use Depends(require_role("teacher")) etc.
- Never trust client-sent user IDs — use get_current_user().id
- Pydantic v2 schemas for ALL request/response bodies
- Return appropriate HTTP codes: 400, 401, 403, 404, 422, 500

## SQLAlchemy 2
- Use Session, not AsyncSession (sync first for MVP)
- Always use ORM queries, NEVER raw SQL strings
- Explicit column selection for list endpoints (no SELECT *)
- Use joinedload/selectinload for relationships

## Error Handling
- Consistent format: { "error": str, "code?": str }
- Never expose stack traces or internal errors to client
- Log errors with context (route, user_id, input) via loguru

## Security
- bcrypt cost=12 for password hashing
- JWT access token: 30 min, refresh token: 7 days
- All write operations log actor_id
- File uploads: validate MIME, max 5MB, no path traversal
- Export/import endpoints: admin/teacher role checks

## Testing
- pytest + httpx TestClient
- Minimum 3 tests per endpoint (happy, auth error, validation error)
- factory-boy for test data fixtures
```

### `.agent/rules/api.md`

```yaml
---
paths:
  - "server/routers/**/*.py"
  - "server/schemas/**/*.py"
---

# API Route Rules — EpiCase

## Input validation
- Validate ALL inputs with Pydantic schemas
- Parse request body: schema.model_validate(await req.json())
- Validate URL params: UUID for IDs
- Return 422 with { "error": "..." } on validation failure

## Authentication
- All protected routes: const user = Depends(get_current_user)
- require_role() throws 403 if wrong role
- Never trust client-sent user IDs — use auth.user_id

## Response format
- Always return Pydantic response model
- Paginated lists: { items: [], total: int, page: int, per_page: int }
- Set Cache-Control headers where appropriate
```

---

## 3. ДОБАВИТЬ: `.agent/hooks/` — Принудительные проверки

**Чего нет в PROJECT_DESIGN:** В §24 нет механизма **блокировки коммитов** при провале проверок. Правило 5 в §21.5 говорит "запускать все тесты", но это рекомендация, а не enforcement.

### `.agent/hooks/pre-commit.sh`

```bash
#!/bin/bash
# ─────────────────────────────────────────────
# Pre-commit hook for EpiCase
# Runs type checks + lint + tests before EVERY commit.
# If anything fails, the commit is BLOCKED.
# ─────────────────────────────────────────────

RED="\033[0;31m"
GREEN="\033[0;32m"
NC="\033[0m"

# Step 1: Python type check (mypy)
echo "Checking Python types..."
cd server
python -m mypy . --ignore-missing-imports --no-error-summary 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}mypy errors found. Fix before committing.${NC}"
    exit 2
fi
cd ..

# Step 2: Python lint (ruff)
echo "Linting Python..."
ruff check server/ --quiet
if [ $? -ne 0 ]; then
    echo -e "${RED}ruff lint errors. Run 'ruff check --fix' to auto-fix.${NC}"
    exit 2
fi

# Step 3: TypeScript type check
echo "Checking TypeScript types..."
cd client
npx tsc --noEmit 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}TypeScript type errors found. Fix before committing.${NC}"
    exit 2
fi

# Step 4: ESLint on staged files
STAGED=$(git diff --cached --name-only --diff-filter=d | grep -E "\.(ts|tsx)$")
if [ -n "$STAGED" ]; then
    npx eslint $STAGED --quiet
    if [ $? -ne 0 ]; then
        echo -e "${RED}ESLint errors. Run 'npm run lint' to see details.${NC}"
        exit 2
    fi
fi
cd ..

# Step 5: Run test suites
echo "Running tests..."
cd server && pytest tests/ --quiet 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Python tests failed. Commit blocked.${NC}"
    exit 2
fi
cd ../client && npx vitest run --silent 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Vitest tests failed. Commit blocked.${NC}"
    exit 2
fi
cd ..

echo -e "${GREEN}All checks passed!${NC}"
exit 0
```

### `.agent/hooks/lint-on-save.sh`

```bash
#!/bin/bash
# Auto-format after every file edit
FILE="$1"

if [[ "$FILE" == *.py ]]; then
    ruff format "$FILE" --quiet
    ruff check "$FILE" --fix --quiet
elif [[ "$FILE" == *.ts ]] || [[ "$FILE" == *.tsx ]]; then
    npx prettier --write "$FILE" 2>/dev/null
fi
```

---

## 4. ДОБАВИТЬ: Deny-правила в `.agent/config.json`

**Чего нет в PROJECT_DESIGN:** Текущий `.agent/config.json` (§24) не содержит **запретов**. Агент может случайно прочитать `.env` с JWT_SECRET или выполнить `rm -rf`.

### Добавить в существующий `.agent/config.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(pytest *)",
      "Bash(npx vitest *)",
      "Bash(ruff *)",
      "Bash(npx tsc *)",
      "Bash(npx eslint *)",
      "Bash(alembic *)",
      "Bash(docker compose *)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git status)"
    ],
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(secrets/**)",
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(docker compose down -v)"
    ]
  }
}
```

---

## 5. ДОБАВИТЬ: Новые команды в `.agent/commands/`

**Уже есть:** review.md, test.md, status.md (§26)

**Добавить:**

### `.agent/commands/fix-issue.md`

```yaml
---
name: fix-issue
argument-hint: [issue-description]
---

Fix issue: $ARGUMENTS

1. Understand the issue — read relevant files
2. Find the root cause (grep, read logs)
3. Implement the minimal fix
4. Write a regression test covering the fix
5. Run ALL tests: `pytest server/tests/` && `cd client && npx vitest run`
6. Commit: "fix: description [tests]"
```

### `.agent/commands/deploy.md`

```yaml
---
name: deploy
description: Build Docker images for isolated VMedA server
disable-model-invocation: true
---

Deploy EpiCase to production (isolated LAN server):

## Pre-flight checks
1. `git status` — no uncommitted changes
2. `ruff check server/` — zero warnings
3. `cd client && npx tsc --noEmit` — zero errors
4. `pytest server/tests/` — all tests green
5. `cd client && npx vitest run` — all tests green

## Build
6. `docker compose build` — clean production build
7. `docker save epicase-server epicase-client > epicase-images.tar`

## Transfer (manual)
8. Copy epicase-images.tar to USB/network share
9. On VMedA server: `docker load < epicase-images.tar`
10. `docker compose up -d`

## Post-deploy verification
11. Hit http://epicase.vmeda.local — check login page loads
12. Login as admin — verify dashboard
13. Verify /api/health returns 200

## If anything fails
- Do NOT force push or skip checks
- Fix the issue, re-run all checks
```

---

## 6. ДОБАВИТЬ: Ресурсы-источники (справочно)

Добавить в §22.6 или отдельный раздел:

| Ресурс | URL | Что даёт |
|---|---|---|
| **Маркетплейсы скиллов** | | |
| BehiSecc/awesome-claude-skills | github.com/BehiSecc/awesome-claude-skills | Каталог скиллов |
| Jeffallan skills guide | jeffallan.github.io/claude-skills/skills-guide/ | Каталог с описаниями |
| Smithery.ai | smithery.ai | MCP + скиллы с поиском |
| github.com/wondelai/skills | github.com/wondelai/skills | Ещё один каталог |
| **Компоненты** | | |
| 21st.dev | 21st.dev | Open-source React + Tailwind + Radix UI компоненты |
| **Шаблоны .claude/** | | |
| everything-claude-code | github.com/affaan-m/everything-claude-code | Полная структура .claude/ |
| LeadGenMan guide | resources.leadgenman.com | Гайд по .claude/ setup |

---

## 7. ЧТО УЖЕ ПОКРЫТО (дублирование — НЕ добавлять)

| Из скриншотов | Уже есть в PROJECT_DESIGN |
|---|---|
| CLAUDE.md | AGENTS.md (§24) |
| MEMORY.md | MEMORY.md (§25) |
| settings.json (allow/model) | .agent/config.json (§24) |
| commands/ (review, test) | .agent/commands/ (§26) |
| Secure Code Guardian (скилл) | §22 #9 |
| UI/UX Pro Max (скилл) | §22 #12 |
| Code Reviewer (скилл) | §22 #18 |
| Feature Forge (скилл) | §22 #19 |
| Debugging Skill (скилл) | §22 #20 |
| The Fool (скилл) | §22 #22 |
| Playwright Skill (скилл) | §22 #10 |
| UX Heuristics (скилл) | §22 #13 |
| Refactoring UI (скилл) | §22 #14 |
| Frontend Design (скилл) | §22 #11 |
| Spec Miner (скилл) | Не нужен — PROJECT_DESIGN уже полная спека |
| Git Worktrees | Не критично для проекта |
| RAG Architect | Не нужен — нет RAG в EpiCase |
| iOS HIG Design | Не нужен — веб-приложение |
| Hooked UX | Не нужен — не consumer product |
| Design Sprint | Не нужен — планирование завершено |
| Stitch MCP | Не нужен — сервер изолирован |
| pandoc | Утилита, не скилл |

---

## ИТОГО: Что добавить в PROJECT_DESIGN v1.1

| # | Что | Куда | Приоритет |
|---|---|---|---|
| 1 | Суб-агенты (6 файлов) | Новый §27 или в §24 | Высокий |
| 2 | Rules (3 файла: frontend, backend, api) | Новый §28 или в §24 | Высокий |
| 3 | Hooks (pre-commit.sh, lint-on-save.sh) | Новый §29 или в §26 | Высокий |
| 4 | Deny-правила в config.json | Обновить §24 | Высокий |
| 5 | Новые commands (fix-issue, deploy) | Обновить §26 | Средний |
| 6 | Ресурсы-источники | Обновить §22.6 | Низкий |

### Обновлённая структура .agent/:

```
.agent/
├── config.json               ← + deny rules (§4 этого документа)
├── agents/                   ← НОВОЕ
│   ├── code-reviewer.md
│   ├── debugger.md
│   ├── test-writer.md
│   ├── refactorer.md
│   ├── security-auditor.md
│   └── doc-writer.md
├── commands/
│   ├── review.md             ← уже есть
│   ├── test.md               ← уже есть
│   ├── status.md             ← уже есть
│   ├── fix-issue.md          ← НОВОЕ
│   └── deploy.md             ← НОВОЕ
├── hooks/                    ← НОВОЕ
│   ├── pre-commit.sh
│   └── lint-on-save.sh
├── rules/                    ← НОВОЕ
│   ├── frontend.md
│   ├── backend.md
│   └── api.md
├── skills/                   ← уже 30 скиллов (§22)
│   └── ... (без изменений)
└── mcp/
    └── context7.json         ← уже есть
```
