# EpiCase — Agent Task Distribution

> Кто что делает: детальная раскладка по этапам и общий мастер-список.
> Базируется на `PROJECT_DESIGN §13` + `AUDIT_REPORT.md` (все пробелы закрыты в ADDENDUM).
>
> **Два агента в проекте:**
> - **Claude Opus 4.7** (Claude Code) — архитектура, backend, безопасность, сложная бизнес-логика, код-ревью
> - **Codex GPT 5.5** (Codex CLI) — быстрая генерация UI, React-компоненты, тесты фронтенда, UI-scaffolding
>
> **Суб-агенты Claude** (`.claude/agents/*.md`):
> `orchestrator`, `backend-architect`, `code-reviewer`, `database-optimizer`, `security-engineer`
>
> **Суб-агенты Codex** (`.codex/agents/*.toml`):
> `frontend-developer`, `ui-scaffolder`, `test-writer`, `reviewer`
>
> **Примечание:** в `PROJECT_DESIGN §20` упомянута связка Claude + Gemini — это **устарело**. Стартер, `AGENTS.md`, `CLAUDE.md`, `.codex/` единогласно используют связку **Claude + Codex**. §20 должен быть исправлен в `v1.1` (см. ADDENDUM §X).

---

## Принцип распределения

| Принадлежит Claude Opus 4.7 | Принадлежит Codex GPT 5.5 |
|---|---|
| Проектирование схем БД, миграции Alembic | Реализация React-компонентов |
| Pydantic-схемы request/response | TypeScript-типы, TanStack Query хуки |
| `graph_engine.py`, `grader_service.py` | React Flow nodes (StartNode, DataNode, …) |
| `attempt_service.py`, `scenario_service.py` | Плеер (CasePlayer, DataView, DecisionView, …) |
| Все FastAPI роутеры | Zustand stores (authStore, scenarioEditorStore) |
| `auth_service.py`, JWT, bcrypt, middleware | Axios client + interceptors |
| `backup_service.py`, оркестрация restore | vitest для компонентов (min 2 теста на компонент) |
| Fixtures (`conftest.py`), сложные pytest-тесты | pytest-тесты happy-path/auth/validation (шаблонные) |
| Seed data, начальные form_templates | Tailwind конфигурация, токены из DESIGN_SYSTEM |
| Ревью фронтенд-кода на security/correct_value leak | Интеграционные E2E smoke-тесты |
| Security audit всего проекта перед релизом | Loading/empty/error states |

---

## STAGE 0 — Инфраструктура (~1 день)

| Задача | Владелец | Суб-агент | Комментарий |
|---|---|---|---|
| Проверить `docker-compose.yml` (стартер готов) | Claude | backend-architect | Убедиться, что healthcheck PostgreSQL работает |
| Создать `.env` из `.env.example` | **Пользователь** | — | Claude не читает `.env` (deny в settings) |
| Запустить `docker compose up -d` | Пользователь + Claude | — | Проверить `GET /api/ping` → `{"status":"ok"}` |
| Зафиксировать CORS_ORIGINS в env | Claude | backend-architect | ADDENDUM §T.8 |
| **Фикс C-02: переписать §20 документа** | Claude | — | Убрать Gemini, прописать Codex |
| **Фикс C-01: интегрировать дизайн-систему** | Claude + Codex | frontend-developer | Скопировать SVG в `client/public/branding.svg`, создать `tokens.css` |
| Обновить MEMORY.md | Claude | — | Stage 0 complete |
| Первый коммит: `feat: Stage 0 — infrastructure verified + design system [no tests yet]` | Claude | code-reviewer | Тестов пока нет; проверки — `ruff check server/` + `cd client && npx tsc --noEmit` + `docker compose ps` все up |

**Итог Stage 0:** рабочий Docker стэк, готовая дизайн-система в репозитории, `.env`, `/api/ping` отвечает.

---

## STAGE 1 — Сервер: Scaffolding + Auth + Users + Groups (~2 дня)

### 1A. Модели и миграции (Claude Opus — backend-architect)

| Задача | Файл | Комментарий |
|---|---|---|
| SQLAlchemy модели `User`, `Role`, `Group`, `TeacherGroup` | `server/models/user.py` | По §8.1 полностью |
| Pydantic схемы Auth: `LoginRequest`, `TokenResponse`, `RefreshRequest` | `server/schemas/auth.py` | ADDENDUM §R.1 |
| Pydantic схемы User: `UserCreate`, `UserUpdate`, `UserOut`, `UserBulkCSVRow` | `server/schemas/user.py` | ADDENDUM §R.2 |
| Pydantic схемы Group: `GroupCreate`, `GroupOut`, `GroupMemberAdd` | `server/schemas/group.py` | ADDENDUM §R.3 |
| Migration 001 | `server/migrations/versions/001_initial.py` | `alembic revision --autogenerate` |
| Seed data | `server/seed.py` | ADDENDUM §S (роли, admin-пользователь, 2 дисциплины, 2 form_templates) |

### 1B. Сервисы (Claude Opus — backend-architect + security-engineer)

| Задача | Файл | Комментарий |
|---|---|---|
| `auth_service.py`: bcrypt hash/verify, JWT encode/decode, refresh rotation | `server/services/auth_service.py` | cost=12, access 8ч, refresh 7д |
| `user_service.py`: CRUD + toggle-active + reset-password + bulk CSV | `server/services/user_service.py` | CSV parser: UTF-8 BOM, `;` separator, 6 колонок |
| `group_service.py`: CRUD + members + teacher assignment | `server/services/group_service.py` | ADDENDUM §A.3 pagination |
| Password policy validator | `server/services/auth_service.py` | ADDENDUM §T.1 (regex) |
| Login rate-limiting через `users.login_attempts` | `server/services/auth_service.py` | 5 неудач → lock 30 мин |

### 1C. Роутеры (Claude Opus — backend-architect)

| Задача | Файл | Endpoints |
|---|---|---|
| Auth | `server/routers/auth.py` | login, refresh, logout, me |
| Users | `server/routers/users.py` | GET list, POST create, POST bulk-csv, PATCH, toggle-active, reset-password, change-password, avatar |
| Groups | `server/routers/groups.py` | GET, POST, members CRUD, assign-teacher |

Каждый endpoint: **`require_role()` зависимость** (security-engineer проверяет перед коммитом).

### 1D. Backend тесты (Claude + Codex совместно)

| Задача | Владелец | Файл | Тестов |
|---|---|---|---|
| `conftest.py` — фикстуры (test DB, test client, test users) | Claude | `server/tests/conftest.py` | — |
| **`test_migrations.py` — ADR-009** (from-scratch, downgrade, stairsteps) | Claude | `server/tests/test_migrations.py` | 3 |
| test_auth.py — login/refresh/logout/locked/expired | Claude | `server/tests/test_auth.py` | ≥8 |
| test_users.py — CRUD + bulk CSV | Codex (шаблонные) + Claude (ревью) | `server/tests/test_users.py` | ≥12 |
| test_groups.py — CRUD + members | Codex (шаблонные) + Claude (ревью) | `server/tests/test_groups.py` | ≥8 |
| test_edge_cases.py (§16.1) | Claude | `server/tests/test_edge_cases.py` | 4 кейса EC-AUTH-* |

**Правило:** Codex пишет шаблонные тесты (happy/auth-error/validation) по спецификации, Claude проверяет покрытие edge cases и безопасность.

### 1E. Коммит

`feat: Stage 1 — Auth + Users + Groups [all tests green]` (≥30 зелёных backend-тестов)

---

## STAGE 2 — Сервер: Сценарии + Граф (~3 дня)

### 2A. Модели (Claude — backend-architect + database-optimizer)

| Задача | Файл |
|---|---|
| `Scenario`, `ScenarioNode`, `ScenarioEdge`, `ScenarioGroup` | `server/models/scenario.py` |
| `FormTemplate`, `FormTemplateField` | `server/models/node_content.py` |
| GIN индекс на `node_data` (ADDENDUM §Q.1) | Migration 002 |
| Миграция `condition` JSONB помечена как reserved | Migration 002 |

### 2B. Pydantic схемы (Claude)

| Задача | Файл | Комментарий |
|---|---|---|
| `ScenarioCreate`, `ScenarioListOut`, `ScenarioFullOut` | `server/schemas/scenario.py` | ADDENDUM §R.4 |
| `NodeOut`, `EdgeOut`, `GraphIn`, `GraphOut` | `server/schemas/scenario.py` | React Flow format |
| Role-based сериализация: student view ≠ teacher view | `server/schemas/scenario.py` | **НЕТ `correct_value`, `is_correct` для студента** |

### 2C. `graph_engine.py` (Claude — самая сложная часть)

| Метод | Описание |
|---|---|
| `get_start_node(scenario_id)` | Поиск узла type=start, должен быть ровно 1 |
| `get_next_node(scenario_id, current, selected_edge)` | Детерминистский переход |
| `validate_transition(scenario_id, from_node, to_node)` | Проверка существования ребра |
| `validate_graph(scenario_id) → list[str]` | BFS: есть START, есть FINAL, все достижимы, у не-FINAL ≥1 out-edge, у decision ≥2 out-edges |
| `calculate_max_score(scenario_id)` | Сумма max_score оцениваемых узлов на correct path + score_delta correct edges |

**Тесты `test_graph_engine.py`** (Claude пишет лично): ≥12 тестов, покрытие всех ветвей валидации.

### 2D. `scenario_service.py` (Claude)

| Метод | Описание |
|---|---|
| `create`, `update`, `delete`, `duplicate`, `archive` | ADDENDUM §A.6 |
| `save_graph(scenario_id, graph_in)` | Полная замена: транзакция, удалить старые узлы/рёбра, вставить новые |
| `publish(scenario_id)` | `validate_graph` → если ошибок нет → status='published' |
| `unpublish(scenario_id)` | Проверить отсутствие активных попыток |
| `assign(scenario_id, group_id, deadline)` | INSERT в `scenario_groups` |

### 2E. Роутеры (Claude)

- `server/routers/scenarios.py` — все 9 endpoints (§6.4 + §A.6)
- `server/routers/nodes.py` — `PATCH /api/nodes/{id}` (точечное редактирование)
- `server/routers/media.py` — `POST /api/media/upload` (Pillow validate, ADDENDUM §A.5)

### 2F. Тесты (Claude + Codex)

| Файл | Владелец | Тестов |
|---|---|---|
| `test_scenarios.py` — CRUD + publish + assign | Codex (шаблонные) + Claude (ревью) | ≥20 |
| `test_graph_engine.py` | Claude | ≥12 |
| `test_edge_cases.py` (§16.2) | Claude | 5 кейсов EC-SCENARIO-* |

### 2G. Коммит

`feat: Stage 2 — Scenarios + Graph [all tests green]` (≥70 зелёных суммарно)

---

## STAGE 3 — Сервер: Попытки + Оценивание (~3 дня)

### 3A. Модели (Claude)

- `Attempt`, `AttemptStep` — по §8.1 + частичный UNIQUE индекс `idx_attempts_active`

### 3B. `grader_service.py` (Claude — главная логика)

| Метод | Правила |
|---|---|
| `grade_decision` | Бинарный или partial_credit (ADDENDUM §B.3) |
| `grade_form` | text → `strip().lower()` exact, date → exact, select → exact, checkbox → bool, regex → `re.fullmatch` |
| `grade_text_input` | case-insensitive substring, каждое keyword max 1 раз, синонимы учитываются |
| `GradeResult` dataclass | score, max_score, is_correct, feedback, details |

### 3C. `attempt_service.py` (Claude)

| Метод | Описание |
|---|---|
| `start(user_id, scenario_id)` | Проверка active attempt → 409, проверка max_attempts → 422, создание attempt + первый step=START |
| `step(attempt_id, step_submit)` | grader → записать AttemptStep → вычислить next_node → вернуть StepResult |
| `finish(attempt_id)` | Подсчитать total_score, duration_sec, status='completed' |
| `abandon(attempt_id)` | status='abandoned' |
| `time_remaining(attempt_id)` | ADDENDUM §A.7 (серверно-авторитетный таймер) |
| Auto-finish по таймеру | Background задача APScheduler раз в 60 с |

### 3D. Роутеры (Claude)

- `server/routers/attempts.py` — start, step, finish, abandon, time-remaining, my, by-id

### 3E. Тесты (Claude)

Тесты этого этапа — **только Claude**, так как логика критичная:

- `test_grader.py` ≥15 тестов: все типы узлов + partial + edge cases
- `test_attempts.py` ≥20 тестов: полный цикл + concurrency (UNIQUE constraint) + F5-resume
- `test_edge_cases.py` (§16.3): 7 EC-ATTEMPT-*

### 3F. Коммит

`feat: Stage 3 — Attempts + Grading [all tests green]` (≥110 зелёных)

---

## STAGE 4 — Сервер: Аналитика + Админ (~2 дня)

### 4A. `analytics_service.py` (Claude — database-optimizer)

| Метод | Оптимизация |
|---|---|
| `student_dashboard(user_id)` | 1 запрос с joinedload |
| `teacher_scenario_stats(scenario_id, group_id)` | Агрегация через SQL GROUP BY |
| `teacher_path_heatmap(scenario_id, group_id)` | Собрать visit_count из attempt_steps, JOIN с nodes/edges |
| `admin_stats()` | COUNT(*) по users/scenarios/attempts + pg_database_size |
| Excel экспорт (ADDENDUM §E.1) | openpyxl — 3 эндпоинта `.xlsx` |
| PDF экспорт | reportlab — 1 эндпоинт `.pdf` (добавить в requirements.txt) |

### 4B. `backup_service.py` (Claude — **осторожно**)

| Метод | Описание |
|---|---|
| `create_backup()` | `pg_dump -U epicase epicase | gzip > backup_YYYYMMDD_HHMM.sql.gz` |
| `list_backups()` | Листинг BACKUP_DIR с size + mtime |
| `delete_backup(filename)` | Проверка, что filename в BACKUP_DIR (no path traversal!) |
| `restore_backup(filename)` | ADDENDUM §T.5 — maintenance_mode flag + drop schema + restore |
| Авто-бэкап APScheduler | Раз в сутки в 03:00 |
| Rate limit (ADDENDUM §T.7) | In-memory throttle 1 per 5 min |

### 4C. Модели + роутеры

- `server/models/system.py` — SystemSetting, SystemLog + Migration 004
- `server/routers/analytics.py`
- `server/routers/admin.py` — sysinfo, backups CRUD, logs, settings, **`GET /health` (ADR-010)**
- `server/services/scheduler.py` — **APScheduler registration (ADR-004)**: daily backup 03:00, auto-finish expired (60 s), cleanup old logs 04:00

### 4D. Тесты

- `test_analytics.py` ≥12 тестов — Claude
- `test_admin.py` ≥15 тестов — Claude (backup/restore — критично)

### 4E. Коммит

`feat: Stage 4 — Analytics + Admin [all tests green]` (≥140 зелёных, весь backend готов)

---

## STAGE 5 — Клиент: Scaffolding + Auth (~2 дня)

**Владелец всего этапа: Codex GPT 5.5** (frontend-developer + ui-scaffolder)
**Ревью перед коммитом: Claude (code-reviewer, security-engineer)**

| Задача | Файл | Суб-агент |
|---|---|---|
| Vite + React 19 + TS strict + Tailwind 4 setup | `client/vite.config.ts`, `tsconfig.json` | ui-scaffolder |
| Копировать `tokens.css` из DESIGN_SYSTEM §10.1 | `client/src/styles/tokens.css` | frontend-developer |
| Копировать `branding.svg` в `client/public/` | — | frontend-developer |
| Компоненты `components/ui/` (Button, Card, Badge, Input, Modal, Toast, ConfirmDialog, EmptyState, LoadingSpinner, Table, Icon, Skeleton) | `components/ui/*.tsx` | ui-scaffolder (+ test-writer для каждого) |
| Axios client + interceptors (JWT refresh) | `src/api/client.ts` | frontend-developer |
| API модули: `api/auth.ts`, `api/users.ts`, `api/groups.ts` | frontend-developer |
| TypeScript типы из Pydantic схем | `src/types/user.ts`, `src/types/scenario.ts`, `src/types/attempt.ts`, `src/types/analytics.ts` | frontend-developer |
| `stores/authStore.ts` — Zustand + immer | frontend-developer |
| `hooks/useAuth.ts` | frontend-developer |
| `components/layout/AppLayout.tsx`, `Sidebar.tsx`, `TopBar.tsx` | ui-scaffolder |
| **`ProtectedRoute.tsx`** (ADDENDUM §U.8) | `components/ProtectedRoute.tsx` | frontend-developer |
| `pages/auth/LoginPage.tsx` | ui-scaffolder |
| **`NotFoundPage.tsx`** (E-21 — catch-all route) | `pages/NotFoundPage.tsx` | ui-scaffolder |
| **`ForbiddenPage.tsx`** (E-21 — `/forbidden`) | `pages/ForbiddenPage.tsx` | ui-scaffolder |
| **`ResourceNotFound.tsx`** (E-21 — для API 404) | `components/ResourceNotFound.tsx` | frontend-developer |
| **`useResourceQuery.ts`** (E-21 — 404 → null hook) | `hooks/useResourceQuery.ts` | frontend-developer |
| Catch-all `<Route path="*">` в App.tsx (E-21) | `App.tsx` | frontend-developer |
| vitest setup + MSW mocks | `src/__tests__/setup.ts` | test-writer |
| Тесты: все 12 UI-компонентов (≥2 теста каждый), LoginPage, ProtectedRoute, AppLayout, NotFoundPage, ForbiddenPage, ResourceNotFound, useResourceQuery (≥30 тестов суммарно) | test-writer |

**Коммит:** `feat: Stage 5 — Client scaffolding + Auth + UI kit [all tests green]`

---

## STAGE 6 — Клиент: Конструктор сценариев (~5 дней, самый сложный клиентский этап)

**Владелец: Codex GPT 5.5** (frontend-developer) | **Ревью: Claude (архитектура + code-reviewer)**

| Задача | Файл | Сложность |
|---|---|---|
| `stores/scenarioEditorStore.ts` — Zustand + immer (nodes, edges, selectedNode) | | ⭐⭐⭐ |
| `api/scenarios.ts` — CRUD + PUT /graph | | ⭐ |
| `hooks/useScenarios.ts` — TanStack Query | | ⭐ |
| React Flow кастомные узлы (6 шт.) с иконками из `branding.svg` и цветами из DESIGN_SYSTEM §2.3 | `components/scenario/nodes/*.tsx` | ⭐⭐ |
| `ChoiceEdge.tsx` — ребро с label + цвет is_correct/partial | `components/scenario/edges/ChoiceEdge.tsx` | ⭐⭐ |
| `ScenarioCanvas.tsx` — React Flow wrapper | ⭐⭐⭐ |
| `NodePalette.tsx` — drag source | ⭐⭐ |
| `NodeInspector.tsx` — панель редактирования (6 режимов по типу узла) | ⭐⭐⭐ |
| Автосохранение (debounce 30s) с индикатором в топ-баре | | ⭐⭐ |
| `beforeunload` warning | | ⭐ |
| `pages/teacher/ScenarioEditorPage.tsx` — 3 панели | ⭐⭐ |
| `pages/teacher/MyScenarios.tsx` — список + создание + дублирование + удаление | ⭐⭐ |
| `pages/teacher/ScenarioPreview.tsx` — Preview mode (ADDENDUM §UI.1) | ⭐⭐ |
| Тесты: ScenarioCanvas, NodeInspector, NodePalette, ScenarioEditorPage (≥20) | test-writer | — |
| E2E smoke: создать → перетащить → соединить → сохранить → опубликовать | test-writer + Playwright (если подключим) | ⭐⭐⭐ |

**Ревью Claude:**
- Нет ли утечки `correct_value` в клиентский код?
- Debounce точно 30 с?
- React.memo на кастомных узлах?

**Коммит:** `feat: Stage 6 — Scenario editor with 6 node types [all tests green]`

---

## STAGE 7 — Клиент: Плеер кейса (~4 дня)

**Владелец: Codex GPT 5.5** | **Ревью: Claude (UX + безопасность)**

| Задача | Файл |
|---|---|
| `api/attempts.ts` — start, step, finish, abandon, my, time-remaining | |
| `hooks/useAttempts.ts` — TanStack Query с optimistic updates | |
| `components/player/CasePlayer.tsx` — контейнер + серверный таймер (ADDENDUM §U.3) | |
| `DataView.tsx` — HTML content + attachments (images, tables) | |
| `DecisionView.tsx` — radio group (или checkbox при allow_multiple) + submit | |
| `FormView.tsx` — react-hook-form + zod + все типы полей (text, textarea, select, date, number, checkbox) |
| `TextInputView.tsx` — textarea + min_length validator на клиенте (для UX, не для security) |
| `FinalView.tsx` — результат + корректный path визуализация |
| `ProgressBar.tsx` — прогресс по графу |
| `PathVisualization.tsx` — React Flow readonly, подсветка пройденного пути |
| `pages/student/CasePlayerPage.tsx` |
| `pages/student/CaseResultPage.tsx` — экспорт в PDF (ADDENDUM §E.1) |
| Инлайн-фидбек после ответа (DESIGN_SYSTEM §7.2) |
| Тесты компонентов Player (≥15) |

**Ревью Claude:**
- Корректное поведение при `410 Gone` от сервера (время истекло)
- Никакого хранения `correct_value` в Redux/Zustand
- F5 в середине кейса → resume работает

**Коммит:** `feat: Stage 7 — Case player [all tests green]`

---

## STAGE 8 — Клиент: Дашборды и аналитика (~3 дня)

**Владелец: Codex GPT 5.5**

| Задача | Файл |
|---|---|
| `pages/student/StudentDashboard.tsx` — Recharts: прогресс, последние попытки |
| `pages/student/MyCases.tsx` |
| `pages/student/MyResults.tsx` — таблица + фильтры по дате/баллу (ADDENDUM §UI.4) |
| `pages/teacher/TeacherDashboard.tsx` — активность за неделю, слабые задания |
| `pages/teacher/AnalyticsPage.tsx` — **тепловая карта + распределение баллов + рейтинг студентов** (ADDENDUM §UI.3) |
| `pages/teacher/GroupsPage.tsx` (ADDENDUM §UI.5) |
| Компонент HeatmapChart на основе нативного SVG (иконка `ico-heatmap` как источник вдохновения) |
| Кнопки экспорта XLSX/PDF |
| Тесты (≥12) |

**Коммит:** `feat: Stage 8 — Dashboards and analytics [all tests green]`

---

## STAGE 9 — Клиент: Админ-панель (~2 дня)

**Владелец: Codex GPT 5.5** | **Ревью: Claude (security-engineer) — критично**

| Задача | Файл |
|---|---|
| `pages/admin/AdminDashboard.tsx` |
| **`components/admin/HealthWidget.tsx` — ADR-011** (опрос health каждые 60 с, звуковой alert при смене статуса, последние 5 ERROR-логов) | `components/admin/HealthWidget.tsx` |
| `pages/admin/UsersPage.tsx` — CRUD + bulk CSV upload + toggle-active + reset-password |
| `pages/admin/SystemPage.tsx` — backups list/create/restore/delete + logs + sysinfo (ADDENDUM §UI.6) |
| `pages/admin/SettingsPage.tsx` |
| **ConfirmDialog** перед: удаление пользователя, restore бэкап, delete бэкап |
| **Maintenance mode баннер** во время restore |
| Тесты (≥10) |

**Ревью Claude:** restore workflow — если что-то пойдёт не так, можно потерять все данные попыток. Проверить triple-confirm.

**Коммит:** `feat: Stage 9 — Admin panel [all tests green]`

---

## STAGE 10 — Интеграция и тестирование (~3 дня)

**Владельцы: оба агента**

| Задача | Владелец |
|---|---|
| **`scripts/verify.sh`, `build-images.sh`, `package-release.sh`, `deploy-on-server.sh` — ADR-012** | Claude |
| Smoke-test §15 полный | Оба |
| Docker-образы: build + save в tar (через `scripts/package-release.sh`) | Claude (знает инфру) |
| `docs/README.md` — инструкция деплоя + `scripts/README.md` | Claude |
| Финальный security audit | Claude (security-engineer) |
| UX-аудит (axe DevTools, контрасты, keyboard nav) | Codex (reviewer) |
| Тест на целевом разрешении 1024×768 | Codex |
| Исправление найденных багов | Соответствующий агент |

**Финальный коммит:** `feat: Stage 10 — Ready for VMedA deploy [all tests green]` + tag `v1.0`

---

## Мастер-список: кто что делает

### Claude Opus 4.7 (Claude Code)

**Архитектура и проектирование:**
- Schema дизайн-документа (ADDENDUM), ревизии API
- Решения об индексах БД, миграциях
- Выбор подходов к аутентификации, transaction boundaries
- Декомпозиция сервисов

**Backend (весь):**
- SQLAlchemy модели (все 8+)
- Все Pydantic схемы
- Все FastAPI роутеры (8 штук)
- Все сервисы (9 штук, включая `graph_engine`, `grader_service`, `backup_service`)
- Все миграции Alembic
- Seed data
- Фикстуры pytest (`conftest.py`)
- Критичные тесты: `test_graph_engine.py`, `test_grader.py`, `test_attempts.py` (концурренси), `test_admin.py` (backup), `test_edge_cases.py` (все EC-*)

**Security:**
- Валидация password policy
- JWT flow
- `require_role()` везде
- Ревью клиентского кода на утечки `correct_value`, `is_correct`
- Rate limiting
- Backup/restore безопасность (path traversal, actor_id)
- Финальный security audit перед релизом

**Code review:**
- Каждый PR от Codex
- Перед каждым коммитом — проверка всех тестов зелёных, `ruff check`, `tsc --noEmit`
- Блокировать коммит, если что-то красное

**Инфраструктура:**
- Docker Compose, Dockerfile'ы ревизия
- `docker save` / `docker load` для изолированного сервера
- Nginx конфиг
- Финальная сборка образов для ВМедА

**Документация:**
- Поддержание `PROJECT_DESIGN_EPICASE_v1.md` в актуальности
- Обновление `MEMORY.md` после каждой сессии (вместе с кодом)
- `docs/README.md` для деплоя

### Codex GPT 5.5 (Codex CLI)

**Frontend (весь):**
- Vite + React + TS + Tailwind 4 setup
- Все компоненты `components/ui/` (12 штук)
- Все компоненты `components/layout/` (3 штуки)
- Все компоненты `components/scenario/` (6 nodes + 1 edge + Canvas + Palette + Inspector)
- Все компоненты `components/player/` (8 штук)
- Все 16 страниц в `pages/` (Student ×5, Teacher ×6, Admin ×4, Auth ×1)
- Zustand stores (authStore, scenarioEditorStore)
- TanStack Query hooks
- Axios client + interceptors
- TypeScript типы по Pydantic-схемам
- Recharts графики, HeatmapChart кастомный
- Форматтеры, валидаторы (zod schemas)

**Tests (фронтенд полностью):**
- vitest + MSW setup
- Минимум 2 теста на каждый компонент: render + interaction
- ≥80 vitest-тестов за весь проект
- E2E smoke-тест (если подключим Playwright)

**Tests (бэкенд — шаблонные):**
- Генерация happy-path/auth-error/validation-error тестов для простых эндпоинтов (users, groups, scenarios CRUD)
- Под ревью Claude — Codex не трогает тесты для graph_engine, grader, attempts

**UX:**
- Loading/empty/error состояния на всех экранах
- Accessibility baseline (label'ы, ARIA, keyboard nav)
- Адаптация под разрешение ≥1024×768
- Skip link, focus rings

**Интеграция дизайн-системы:**
- `tokens.css` из `DESIGN_SYSTEM.md §10.1`
- Все иконки через `<Icon/>` из `branding.svg`
- Нет хардкода цветов — проверяется grep'ом в code-review

### Пользователь (ты)

- Настройка `.env` (Claude не читает)
- Ручное развёртывание `docker compose up` на dev-машине
- Перенос tar-архивов на сервер ВМедА
- Подтверждение деструктивных действий, выбор архитектурных развилок
- Финальная приёмка UI

---

## Потоки взаимодействия агентов

### Pattern 1: Backend-first feature (90% случаев)

```
Claude Opus:       [write test] → [write schema] → [write service] → [write router] → [green tests]
                                                                     ↓
Codex GPT:                                                          [write TS types from schemas]
                                                                     ↓
                                                                    [write API module]
                                                                     ↓
                                                                    [write page/component]
                                                                     ↓
                                                                    [vitest tests]
                                                                     ↓
Claude Opus (review): [code-review] → [security check] → [all tests green] → [COMMIT]
```

### Pattern 2: UI scaffolding (components/ui)

```
Codex GPT (ui-scaffolder): [component + test file] → [vitest green]
                                                      ↓
Claude Opus (code-reviewer): [check design system compliance, no hardcoded colors]
```

### Pattern 3: Design/infra change

```
Claude Opus: [update design doc / schema / seed] → [migration if needed] → [update MEMORY.md]
                                                                             ↓
Codex GPT: [pull] → [update TS types + API modules]
```

### Антипаттерн — НЕ делаем

- Codex пишет тесты для `graph_engine` / `grader` / `backup` без ревью Claude
- Claude пишет React-компоненты без согласования с Codex
- Кто-либо коммитит при красных тестах
- Кто-либо делает `docker compose down -v` (стёрт в deny в `.claude/settings.json`)
- Кто-либо хардкодит цвет в `.tsx` (запрещено DESIGN_SYSTEM §12)

---

## Ориентировочные метрики готовности

| Компонент | К концу Stage | Строк кода (≈) | Тестов (≈) |
|---|---|---|---|
| Backend models + schemas | 2 | 900 | — |
| Backend services | 4 | 2000 | — |
| Backend routers | 4 | 1200 | — |
| Backend tests | 4 | 3500 | **140** |
| Frontend UI kit + auth | 5 | 1500 | ≥30 |
| Frontend editor | 6 | 2500 | ≥20 |
| Frontend player | 7 | 2000 | ≥15 |
| Frontend dashboards | 8 | 1800 | ≥12 |
| Frontend admin | 9 | 1200 | ≥10 |
| **Итого** | **10** | **≈16 600** | **≥230** |

Целевой срок по PROJECT_DESIGN: **~30 рабочих дней** (сумма по этапам).
