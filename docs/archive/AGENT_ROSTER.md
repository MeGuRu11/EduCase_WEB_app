# EpiCase — Agent Roster

> Компактный список «кто какой раздел задач выполняет».
> Полный per-stage разбор — в `AGENT_TASKS.md`.
> Последнее обновление: 2026-04-17, Claude Opus 4.7

---

## Две ведущие модели

| Модель | Инструмент | Primary role |
|---|---|---|
| **Claude Opus 4.7** | Claude Code | Backend, архитектура, безопасность, сложная бизнес-логика, код-ревью |
| **Codex GPT 5.5** | Codex CLI | Frontend, React-компоненты, vitest-тесты, UI-scaffolding |

Pairing: Opus 4.7 проектирует и пишет контракты (Pydantic-схемы, API) → Codex пишет клиент под эти контракты → Opus 4.7 ревьюит и блокирует коммит, если что-то красное или нарушена безопасность.

---

## Суб-агенты Claude Opus 4.7 (`.claude/agents/`)

| Имя | Зона ответственности | Когда активируется |
|---|---|---|
| **`orchestrator`** | Координация сессий, чтение MEMORY.md, определение следующей задачи, обновление MEMORY.md в конце | В начале каждой рабочей сессии |
| **`backend-architect`** | Все backend-файлы: модели, схемы, сервисы, роутеры, миграции, pytest-тесты. TDD обязателен (min 3 теста на endpoint). | Весь Stage 1–4; ревью Stage 5–9 в части интеграции |
| **`code-reviewer`** | Блокирует commit, если `pytest` red / `vitest` red / `ruff` warnings / `tsc --noEmit` errors. Проверяет утечки secrets, раздутие функций (>50 строк), `any` в TypeScript. | Перед каждым commit |
| **`database-optimizer`** | Схема БД (§8), индексы (включая GIN на JSONB), запросы аналитики (без N+1), connection pool, `pg_dump`/`pg_restore` wrappers. | Stage 2 (scenarios), Stage 4 (analytics/backup) |
| **`security-engineer`** | OWASP Top 10 applied to LAN: JWT, `require_role()` везде, SQL-injection (ORM only), XSS, file-upload validation, backup-endpoint access, password policy, actor_id, grep `correct_value` в client-коде. | Stage 1 (auth), Stage 4 (admin), Stage 10 (финальный audit) |

---

## Суб-агенты Codex GPT 5.5 (`.codex/agents/`)

| Имя | Зона ответственности | Когда активируется |
|---|---|---|
| **`frontend-developer`** | React-компоненты с полным циклом TDD. Stack: React 19 + TS strict + @xyflow/react 12 + Zustand 5 + TanStack Query 5 + Tailwind 4. Debounce 30 s на graph save. | Stage 5–9 полностью |
| **`ui-scaffolder`** | Быстрая генерация каркаса компонентов с test-файлами сразу. Loading/empty/error states. lucide-react для утилитарных иконок. | Stage 5–9, параллельно с `frontend-developer` |
| **`test-writer`** | Тесты через TDD: min 2 на компонент (render + interaction), min 3 на endpoint (happy / 401-403 / 422). Библиотеки: vitest + @testing-library/react + MSW, pytest + httpx + factory-boy. | Все stage'ы — тесты пишутся ДО кода |
| **`reviewer`** (Codex) | Читает diff, блокирует approval если: tests red / missing tests / `any` типы / hardcoded secrets / утечка `correct_value`. | Перед каждым commit на frontend |

---

## Кто владеет какими ФАЙЛАМИ

### Claude Opus 4.7 владеет (`.claude/agents/backend-architect` + `security-engineer` + `database-optimizer`):

**Backend целиком:**
```
server/
├── main.py, config.py, database.py, dependencies.py, seed.py
├── Dockerfile, requirements.txt, alembic.ini
├── models/      (все 6 файлов: user, scenario, node_content, attempt, media, system)
├── schemas/     (все 8 файлов: auth, user, group, scenario, attempt, analytics, system, common)
├── services/    (все 9: auth, user, group, scenario, graph_engine, grader, attempt, analytics, backup, media)
├── routers/     (все 9: auth, users, groups, scenarios, nodes, attempts, analytics, admin, media)
├── migrations/versions/  (4 файла: 001_initial → 002_scenario → 003_attempts → 004_system)
└── tests/       (критичные: test_graph_engine.py, test_grader.py, test_attempts.py, test_admin.py, test_edge_cases.py)
```

**Infra:**
```
docker-compose.yml, nginx/nginx.conf, .env.example
```

**Документация и память:**
```
docs/PROJECT_DESIGN_EPICASE_v1.md          — поддерживает актуальность
docs/PROJECT_DESIGN_ADDENDUM_v1.1.md       — автор, мерджит в v1.1
docs/AUDIT_REPORT.md, AGENT_TASKS.md, ERRATA_v1.1.3.md, AGENT_ROSTER.md
MEMORY.md                                  — обновляет в конце каждой сессии
.claude/agents/*.md, .claude/rules/*.md, .claude/commands/*.md
```

### Codex GPT 5.5 владеет (`.codex/agents/frontend-developer` + `ui-scaffolder` + `test-writer`):

**Frontend целиком:**
```
client/
├── package.json, tsconfig.json, vite.config.ts, Dockerfile
├── public/branding.svg  (копирует из design/)
└── src/
    ├── main.tsx, App.tsx
    ├── styles/tokens.css                     (реализует по DESIGN_SYSTEM §10.1)
    ├── api/         (все 7 модулей: client, auth, users, groups, scenarios, attempts, analytics, admin)
    ├── types/       (все 4 файла: user, scenario, attempt, analytics — зеркало Pydantic-схем)
    ├── stores/      (authStore, scenarioEditorStore — Zustand + immer)
    ├── hooks/       (useAuth, useScenarios, useAttempts, useAnalytics, useIdleTimeout)
    ├── utils/       (constants, validators, formatters)
    ├── components/
    │   ├── ui/         (все 12: Button, Card, Badge, Input, Modal, Toast, ConfirmDialog, EmptyState, LoadingSpinner, Table, Icon, Skeleton)
    │   ├── layout/     (AppLayout, Sidebar, TopBar)
    │   ├── scenario/   (ScenarioCanvas, NodePalette, NodeInspector + 6 nodes + 1 edge)
    │   └── player/     (CasePlayer + 5 views + ProgressBar + PathVisualization)
    ├── pages/
    │   ├── auth/       (LoginPage, ChangePasswordPage)
    │   ├── student/    (5 страниц)
    │   ├── teacher/    (6 страниц)
    │   └── admin/      (4 страницы)
    ├── ProtectedRoute.tsx
    └── __tests__/setup.ts + ≥230 vitest-тестов
```

**Backend тесты шаблонные** (happy / auth-error / validation) для простых CRUD эндпоинтов: `test_users.py`, `test_groups.py`, `test_scenarios.py` CRUD — под последующее ревью Claude.

### Пользователь

```
.env                       — секреты (Claude не читает)
```

Развилки, финальная приёмка UI, перенос Docker-образов на изолированный сервер ВМедА.

---

## Кто в каком Stage главный

| Stage | Длительность | Владелец | Суб-агенты в работе | Артефакты на выходе |
|---|---|---|---|---|
| **0** Infra | 1 день | Claude + User | backend-architect | Docker up, /api/ping OK, design system в repo |
| **1** Auth + Users + Groups | 2 дня | **Claude Opus 4.7** | backend-architect, security-engineer, test-writer (backend) | ≥30 pytest-тестов, seed работает, login flow |
| **2** Scenarios + Graph | 3 дня | **Claude Opus 4.7** | backend-architect, database-optimizer | `graph_engine` полный, PUT /graph, publish/unpublish |
| **3** Attempts + Grading | 3 дня | **Claude Opus 4.7** | backend-architect, security-engineer | `grader_service` 3 типа, server-таймер, F5-resume |
| **4** Analytics + Admin | 2 дня | **Claude Opus 4.7** | database-optimizer, security-engineer | heatmap, XLSX/PDF export, backup/restore |
| **5** Client scaffolding + Auth + UI kit | 2 дня | **Codex GPT 5.5** | ui-scaffolder, frontend-developer, test-writer | 12 UI-компонентов, LoginPage, ProtectedRoute |
| **6** Scenario Editor | 5 дней | **Codex GPT 5.5** | frontend-developer, test-writer | React Flow editor, 6 nodes, debounce save |
| **7** Case Player | 4 дня | **Codex GPT 5.5** | frontend-developer, test-writer | CasePlayer + 5 views, server-timer UI |
| **8** Dashboards | 3 дня | **Codex GPT 5.5** | frontend-developer, test-writer | Heatmap chart, Recharts, XLSX/PDF buttons |
| **9** Admin Panel | 2 дня | **Codex GPT 5.5** | frontend-developer, security-engineer (review) | Users CRUD, bulk CSV, triple-confirm restore |
| **10** Integration | 3 дня | **Оба** | security-engineer, reviewer, code-reviewer | Smoke test, Docker tars, README deploy, v1.0 tag |

**Итого: ≈30 рабочих дней | ≈16 600 строк кода | ≥230 тестов.**

---

## Быстрый ответ на частые вопросы

**«Кто пишет `graph_engine.py`?»**
Claude Opus 4.7 (`backend-architect`), уровень reasoning — `xhigh`. Stage 2.

**«Кто пишет компонент `<Button>`?»**
Codex GPT 5.5 (`ui-scaffolder`). Stage 5. Claude ревьюит на соответствие DESIGN_SYSTEM §6.1.

**«Кто отвечает за backup/restore?»**
Claude Opus 4.7 (`backend-architect` + `database-optimizer` + `security-engineer`). Stage 4. Это самая опасная операция в проекте — `xhigh` reasoning обязателен.

**«Кто пишет test_grader.py?»**
Claude Opus 4.7 лично. Codex не трогает тесты для `graph_engine` / `grader` / `backup`.

**«Кто обновляет MEMORY.md?»**
Любой агент, совершивший коммит. Формат — см. `MEMORY.md` шаблон.

**«Кто утверждает изменения в дизайн-системе?»**
Claude Opus 4.7. Изменения только через PR с обновлением `design/DESIGN_SYSTEM.md` + визуальным diff SVG.

**«Что делать, если я не знаю, кто за это отвечает?»**
Проверить эту таблицу → `docs/AGENT_TASKS.md` → `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md`. Если всё равно не ясно — это открытый вопрос, добавить в `MEMORY.md → Problems (UNRESOLVED)`.
