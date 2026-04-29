# EpiCase — Agent Prompts

> Конкретные промпты для каждой задачи проекта. Копируй и вставляй в Claude Code / Codex CLI.
>
> Дополняет `AGENT_TASKS.md` (*что* делать) готовыми промптами (*как* запустить).
>
> Принцип: один промпт = один commit на границе Stage. Промпт содержит: контекст, цели, ссылки на документы, критерии приёмки.
>
> **Дата:** 2026-04-17 · **Модель:** Claude Opus 4.7 + Codex GPT 5.5

---

## Как пользоваться

1. Перейди в корень репозитория `epicase/`
2. Запусти нужный агент:
   - `claude` — для Claude Code (backend-задачи, Stage 1–4, code review, Stage 10)
   - `codex` — для Codex CLI (frontend-задачи, Stage 5–9)
3. Скопируй соответствующий промпт из этого файла
4. Отправь агенту, дождись выполнения
5. Проверь результат: `bash scripts/verify.sh`
6. Если всё зелёное — `git commit` с указанным в промпте сообщением
7. Запусти `bash .claude/hooks/post-stage.sh N` (автообновление MEMORY.md)
8. Переходи к следующему Stage

**Критично:** никогда не коммить если `verify.sh` red. Никогда не запускай следующий Stage если предыдущий не завершён.

---

## STAGE 0 — Infrastructure

### Владелец: Claude Opus 4.7 + пользователь
### Длительность: ~1 день

### Промпт для Claude Code

```
Привет. Это первый запуск на проекте EpiCase — интерактивная образовательная
платформа для ВМедА им. С.М. Кирова (30 пользователей, изолированная LAN,
Docker Compose, stack: FastAPI + PostgreSQL + React).

Прочитай в указанном порядке:
1. CLAUDE.md (твои инструкции + Effort Levels для Opus 4.7)
2. AGENTS.md (общие правила)
3. MEMORY.md (где мы сейчас)
4. docs/PROJECT_DESIGN_EPICASE_v1.md §1-5, §18 (инфраструктура и деплой)
5. docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.8 (CORS)
6. docs/ARCHITECTURE_DECISIONS.md (ADR-001..014)

Затем Stage 0 включает проверку инфраструктуры. Выполни:

1. Проверь наличие .env файла. Если нет — скажи пользователю создать через
   `cp .env.example .env` и отредактировать POSTGRES_PASSWORD, JWT_SECRET
   (openssl rand -hex 32), CORS_ORIGINS. Остановись до подтверждения.

2. После подтверждения запуска `docker compose up -d` проверь:
   - `docker compose ps` — все 3 сервиса (db, server, client) в состоянии `running`
   - `curl -sf http://localhost/api/ping` возвращает {"status":"ok"}
   - `docker compose exec server alembic current` — есть текущая ревизия

3. Если `/api/ping` не отвечает, смотри логи: `docker compose logs --tail=50 server`

4. Обнови MEMORY.md: отметь `[x] STAGE 0 — docker compose up`, обнови Last Updated.

5. Commit: `feat: Stage 0 — infrastructure verified + design system [no tests yet]`

Effort level: medium. Stage 0 — простая проверка без бизнес-логики.
```

### Что делает пользователь сам

```bash
cp .env.example .env
# Редактируем .env (POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGINS)
docker compose up -d
curl http://localhost/api/ping  # → {"status":"ok"}
```

### Критерии приёмки

- [ ] `docker compose ps` все 3 сервиса up
- [ ] `/api/ping` возвращает 200
- [ ] MEMORY.md обновлён: `[x] STAGE 0`
- [ ] Commit сделан

---

## STAGE 1 — Auth + Users + Groups

### Владелец: Claude Opus 4.7 (`backend-architect` + `security-engineer`)
### Длительность: ~2 дня
### Целевые тесты: ≥30 pytest-тестов

### Промпт для Claude Code

```
Приступаем к Stage 1: Auth + Users + Groups. Это самый критичный backend-stage,
закладывающий фундамент безопасности. Effort level: xhigh (ты касаешься auth и
authorization — никаких компромиссов).

Контекст (читать перед работой):
- docs/PROJECT_DESIGN_EPICASE_v1.md §6.1, §6.2, §6.3 (auth + users + groups API)
- docs/PROJECT_DESIGN_EPICASE_v1.md §8.1 (модели БД)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §R.1, §R.2, §R.3 (Pydantic схемы — полные определения)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §S (seed data — реальные формы ВМедА)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.1, §T.6 (password policy + bulk CSV)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §MIG (миграции 001)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §U.8 (auth flow клиент-сервер)
- docs/BEST_PRACTICES.md §B.1 (REST rules — E-13 уже учтён: PUT /users/{id}/status)
- docs/BEST_PRACTICES.md §B.2 (OWASP checklist, в том числе E-17 docs_url, E-20 text())
- docs/BEST_PRACTICES.md §B.3 (ACID boundaries: bulk_csv_upload обязан быть атомарным)
- docs/ARCHITECTURE_DECISIONS.md ADR-009 (migration tests — обязательны)
- .claude/agents/backend-architect.md (твоя роль)
- .claude/agents/security-engineer.md (OWASP checklist — прогнать в конце)

Строгий TDD-цикл. Все тесты пишешь ДО кода. Порядок:

1. conftest.py — фикстуры (postgres_test_url через testcontainers, test_client,
   test_users разных ролей). Это Stage 1 базис для всех последующих.

2. test_migrations.py (ADR-009, ≥3 теста):
   - test_all_migrations_apply_from_scratch
   - test_all_migrations_downgrade_cleanly
   - test_migration_stairsteps
   Запусти — RED (миграций ещё нет). Затем:

3. Миграция 001 — users/roles/groups/teacher_groups/disciplines/topics/
   form_templates/form_template_fields. Включая users.must_change_password
   (для seed admin). Запусти тесты миграций — должны стать GREEN.

4. Models: server/models/user.py (User, Role, Group, TeacherGroup,
   Discipline, Topic), server/models/node_content.py (FormTemplate,
   FormTemplateField).

5. Schemas: server/schemas/auth.py (§R.1), user.py (§R.2), group.py (§R.3).
   Обязательно использовать паттерн Annotated[str, AfterValidator(...)] для
   Password (E-11). Regex: ^(?=.*[A-Za-zА-ЯЁа-яё])(?=.*\d)(?=.*[!@#$%^&*\-_=+]).{8,128}$
   (E-03).

6. test_auth.py — ≥8 тестов (login happy, wrong password, locked account,
   expired token, refresh happy, refresh with revoked, logout, /me without token).

7. services/auth_service.py — bcrypt cost=12, JWT encode/decode, refresh
   rotation, rate-limit login (5 попыток → 30 мин lock через users.login_attempts).

8. test_users.py — ≥12 тестов для CRUD + bulk_csv (happy, duplicates,
   invalid role, group_name не существует, транзакционность — всё или ничего).

9. services/user_service.py — CRUD + bulk_csv (атомарная транзакция согласно
   §B.3 — либо все, либо откат!), toggle через PUT /status (E-13).

10. test_groups.py — ≥8 тестов.
11. services/group_service.py.

12. Routers: auth.py, users.py, groups.py. ВЕЗДЕ require_role() зависимость.

13. Seed data: server/seed.py полностью по §S (3 роли, 2 дисциплины, 2
    form_templates с реальными полями ф.058/у и направления на лаб.
    исследование). ВКЛЮЧАЯ reset_serial_sequences() после explicit INSERT
    с id (E-05).

14. test_edge_cases.py §16.1 — 4 EC-AUTH-* кейса.

15. server/main.py: настройка docs_url=None в prod (E-17), CORS из ENV (§T.8).

Критерии завершения:
- `ruff check server/` — 0 issues
- `pytest server/tests/ -v` — ≥30 tests passed, 0 failed
- `bash scripts/verify.sh` — green
- OWASP checklist (BEST_PRACTICES §B.2.3) прогнан security-engineer агентом

Когда всё зелёное:
- `git add -A && git commit -m "feat: Stage 1 — Auth + Users + Groups [all tests green]"`
- `bash .claude/hooks/post-stage.sh 1`
- Обнови Next Action в MEMORY.md на Stage 2
```

### Критерии приёмки

- [ ] ≥30 pytest тестов зелёных
- [ ] Migration тесты зелёные
- [ ] OWASP checklist прогнан
- [ ] `require_role()` на каждом protected endpoint
- [ ] Seed создаёт admin + 2 дисциплины + 2 form templates
- [ ] Commit `feat: Stage 1 — ... [all tests green]`
- [ ] MEMORY.md обновлён через post-stage.sh

---

## STAGE 2 — Scenarios + Graph Engine

### Владелец: Claude Opus 4.7 (`backend-architect` + `database-optimizer`)
### Длительность: ~3 дня
### Целевые тесты: ≥40 новых (общий счёт ≥70)

### Промпт для Claude Code

```
Stage 2: Scenarios + Graph Engine. Это ядро проекта — redактор ветвящихся
сценариев. Effort level: xhigh для graph_engine.py, high для остальных частей.

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §6.4 (scenarios API), §8.1 (scenarios/nodes/
  edges schema), §9 (типы узлов и node_data), §10 (graph_engine logic)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §R.4 (Pydantic схемы ScenarioFullOut,
  NodeOut, EdgeOut, GraphIn, PublishResult)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §A.6 (DELETE / archive семантика,
  E-14 идемпотентность publish/unpublish)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.2 (role-based serialization —
  sanitize correct_value для student!)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §B.5 (condition JSONB reserved)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §Q (индекс idx_nodes_data_gin + partial
  idx_scenarios_published)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §MIG (миграция 002)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §UI.1 (Preview mode — in-memory attempts)
- docs/BEST_PRACTICES.md §B.3.2 (паттерн save_graph с транзакцией)
- docs/BEST_PRACTICES.md §B.4 (indexing)

Порядок работы (TDD):

1. Миграция 002:
   - scenarios, scenario_nodes, scenario_edges, scenario_groups, media_files
   - GIN индекс idx_nodes_data_gin на scenario_nodes.node_data
   - Partial индекс idx_scenarios_published
   - Поле scenario_edges.condition как reserved (комментарий "RESERVED for V2")

2. Models: server/models/scenario.py

3. Schemas: server/schemas/scenario.py (ScenarioCreate, ScenarioListOut,
   ScenarioFullOut, NodeOut, EdgeOut, GraphIn, PublishResult). Включая
   sanitize_scenario_for_student() функцию.

4. test_graph_engine.py — ≥12 тестов ДО реализации:
   - test_get_start_node_exactly_one
   - test_get_next_node_by_edge
   - test_validate_transition_edge_exists
   - test_validate_graph_requires_start (E-02: нет start → ошибка)
   - test_validate_graph_requires_final
   - test_validate_graph_all_nodes_reachable_from_start
   - test_validate_graph_no_dead_ends_except_final
   - test_validate_graph_decision_requires_at_least_one_correct_edge (E-02)
   - test_calculate_max_score_sums_correct_path
   - test_cycle_detection (пока запрещаем циклы в MVP)
   - и др.

5. services/graph_engine.py — реализация.

6. test_scenarios.py — ≥20 тестов:
   - CRUD (create, update, delete draft, archive published)
   - save_graph + атомарность (§B.3.3 test_save_graph_is_atomic_on_failure)
   - publish + validate
   - unpublish + re-call идемпотентность (E-14)
   - assign к группе
   - duplicate
   - preview mode (in-memory, не пишется в БД)
   - test_student_does_not_see_correct_values (§T.2 — СКРЫТИЕ correct_value
     из node_data и is_correct из edge.data!)

7. services/scenario_service.py — CRUD + save_graph (транзакция по §B.3.2!)
   + publish + unpublish + assign + duplicate + archive.

8. Routers: server/routers/scenarios.py (9 endpoints), server/routers/nodes.py
   (PATCH /api/nodes/{id}), server/routers/media.py (POST /api/media/upload
   с Pillow validation).

9. test_edge_cases.py §16.2 — EC-SCENARIO-* (5 кейсов).

Критерии:
- `pytest server/tests/ -v` — ≥70 тестов суммарно green
- `ruff check server/` clean
- Никаких утечек correct_value в ответах с role=student (тест обязателен!)
- Все save_graph падения → полный rollback (test доказывает)
- `bash scripts/verify.sh` — green

Commit: `feat: Stage 2 — Scenarios + Graph Engine [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 2`
```

### Критерии приёмки

- [ ] `graph_engine.validate_graph()` с 5 правилами валидации
- [ ] `save_graph` атомарный (доказано тестом)
- [ ] Student НЕ видит `correct_value` / `is_correct` (доказано тестом)
- [ ] GIN индекс создан
- [ ] ≥70 тестов зелёных

---

## STAGE 3 — Attempts + Grading

### Владелец: Claude Opus 4.7 (`backend-architect` + `security-engineer`)
### Длительность: ~3 дня
### Целевые тесты: ≥40 новых (общий счёт ≥110)

### Промпт для Claude Code

```
Stage 3: Attempts + Grading. Это механика прохождения кейса. Effort level:
xhigh для grader_service (ошибки = неверные оценки студентов) и
attempt_service (concurrency).

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §6.5 (attempts API), §11 (grader logic)
- docs/PROJECT_DESIGN_EPICASE_v1.md §8.1 (attempts/attempt_steps) + partial
  UNIQUE idx_attempts_active
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §R.5 (схемы AttemptStartOut, StepSubmit,
  StepResult, StepOut — с явным импортом NodeOut, E-01)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §B.3 (partial scoring decision с
  защитой от пустого correct_ids — E-02)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §U.3 (server-authoritative timer —
  expires_at в таблице, auto-finish APScheduler раз в 60 с)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §A.7 (GET /time-remaining endpoint)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §MIG (миграция 003)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.2 (role-based sanitize в step response тоже!)
- docs/BEST_PRACTICES.md §B.3.1 (start_attempt / step / finish — всё под транзакцией)
- docs/BEST_PRACTICES.md §B.3.4 (concurrent start_attempt защищён UNIQUE)

Порядок (TDD):

1. Миграция 003:
   - attempts (с expires_at сразу — E-06!)
   - attempt_steps
   - Partial UNIQUE idx_attempts_active WHERE status='in_progress'
   - idx_attempts_completed (composite)
   - idx_steps_attempt_node

2. Models: server/models/attempt.py (Attempt, AttemptStep)

3. Schemas: server/schemas/attempt.py с явным импортом NodeOut
   (ТОЧНО прямой импорт, не forward reference — E-01).

4. test_grader.py — ≥15 тестов ДО grader_service:
   - grade_decision single (verdict)
   - grade_decision all_or_nothing (allow_multiple=true)
   - grade_decision partial_credit (with true_positives / false_positives)
   - grade_decision empty_correct_ids → 0, is_correct=false (E-02)
   - grade_form exact match text/select/date/number/checkbox
   - grade_form validation_regex
   - grade_text_input case-insensitive substring, keyword не 2 раза, синонимы
   - grade_view_data (data/start/final — is_correct=None)
   - всё-или-ничего vs partial для form с missing required field

5. services/grader_service.py

6. test_attempts.py — ≥20 тестов:
   - start_attempt happy + concurrent (test_start_attempt_concurrent — §B.3.4)
   - start_attempt при max_attempts превышено → 422
   - start_attempt при активной попытке того же сценария → 409
   - step happy + проверка next_node
   - step returns 410 Gone если время истекло
   - finish happy + total_score расчёт
   - abandon
   - F5-resume (повторный start → возвращает существующую in_progress)
   - time_remaining для попытки с time_limit и без
   - auto_finish_expired_attempts (APScheduler job)
   - role-based sanitize в step.next_node для student (не должен видеть correct_value)

7. services/attempt_service.py — start / step / finish / abandon /
   time_remaining / auto_finish_expired. ВСЁ В ТРАНЗАКЦИЯХ (§B.3).

8. services/scheduler.py — APScheduler с SQLAlchemyJobStore.
   Jobs: daily_backup (03:00), auto_finish_expired (60s), cleanup_old_logs (04:00).

9. Routers: server/routers/attempts.py (7 endpoints по §6.5 + §A.7 time-remaining).

10. test_edge_cases.py §16.3 — 7 EC-ATTEMPT-* кейсов (включая "закрыл вкладку
    в момент истечения", "concurrent Submit от одного юзера", "F5-resume").

Критерии:
- ≥110 тестов зелёных суммарно
- Никаких race conditions при concurrent start (UNIQUE INDEX защищает)
- Никаких утечек correct_value в step response для role=student
- APScheduler jobs зарегистрированы и запускаются
- `bash scripts/verify.sh` — green

Commit: `feat: Stage 3 — Attempts + Grading [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 3`
```

### Критерии приёмки

- [ ] Grader для 4 типов узлов + partial credit с защитой от /0
- [ ] Server-authoritative timer работает
- [ ] Concurrent start_attempt защищён UNIQUE index (доказано тестом)
- [ ] APScheduler запущен
- [ ] ≥110 тестов зелёных

---

## STAGE 4 — Analytics + Admin

### Владелец: Claude Opus 4.7 (`database-optimizer` + `security-engineer`)
### Длительность: ~2 дня
### Целевые тесты: ≥30 новых (общий счёт ≥140)

### Промпт для Claude Code

```
Stage 4: Analytics + Admin. Завершающий backend-stage. Особое внимание к
backup/restore — это самая опасная операция в системе (может потерять данные).
Effort level: xhigh для backup_service, high для остальных.

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §6.6 (analytics), §6.7 (admin), §6.8 (settings)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §R.6 (analytics schemas),
  §R.7 (system schemas: HealthCheckOut, BackupInfo, SysInfoOut)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §E.1 (export endpoints с ?format=xlsx|pdf — E-16)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.5 (RESTORE ОРКЕСТРАЦИЯ — внимательно!
  maintenance_mode flag, abandon attempts, engine.dispose, pg_restore,
  проверка alembic current до/после — E-04!)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.7 (rate-limit backup 5 мин)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §SCALE.1 (уже сделано в Stage 1)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §SCALE.2 (GET /health endpoint — ADR-010)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §MIG (миграция 004)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.4 (логирование, actor_id, cleanup)
- docs/ARCHITECTURE_DECISIONS.md ADR-013 (at-rest encryption отложено — НЕ внедрять)

Порядок (TDD):

1. Миграция 004: system_settings, system_logs, apscheduler_jobs.
   Partial idx_logs_errors (partial — только WARNING+ERROR).

2. Models: server/models/system.py (SystemSetting, SystemLog, MediaFile).

3. test_analytics.py — ≥12 тестов:
   - student_dashboard: agg-queries + joinedload
   - teacher_scenario_stats: group by scenario + student
   - path_heatmap: aggregation по путям всех попыток
   - admin_stats: COUNT + pg_database_size
   - export xlsx / pdf: правильный Content-Type и Content-Disposition

4. services/analytics_service.py — без N+1 запросов, joinedload/selectinload
   везде где нужно. Если запрос медленнее 500 ms — добавить индекс.

5. test_admin.py — ≥15 тестов:
   - backup create + rate-limit (E-07 / §T.7)
   - backup list + size / age
   - backup delete + path traversal защита
   - RESTORE: maintenance_mode on → abandon attempts → dispose → restore →
     alembic check → migrations up if older → maintenance_mode off
   - restore при backup с newer migrations → WARNING, не upgrade (E-04)
   - sysinfo endpoint
   - health endpoint (ADR-010 — 5 проверок: db / disk / backup / scheduler / errors_24h)
   - logs pagination + filter by level
   - settings PUT (E-15 — не PATCH) — идемпотентно
   - user must be admin для всех /admin/* endpoints

6. services/backup_service.py — КРИТИЧЕСКАЯ СЕКЦИЯ. Следуй §T.5 процедуре
   буквально. Валидация filename (no path traversal). subprocess.run с
   timeout=600. Rate limit через in-memory timestamp.

7. Routers: server/routers/analytics.py, server/routers/admin.py.
   /admin/health endpoint с 5 проверками.

8. Добавить XLSX+PDF generation в analytics (reportlab уже в requirements).

Критерии:
- ≥140 тестов зелёных суммарно (весь backend готов)
- RESTORE протестирован на happy-path + all edge cases
- Rate-limit backup работает (test делает 2 подряд → второй 429)
- Path traversal в filename → 400 (test делает "../../etc/passwd" → 400)
- `bash scripts/verify.sh` — green (включая OWASP checklist!)

Commit: `feat: Stage 4 — Analytics + Admin + Backup/Restore [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 4`

После Stage 4 — весь backend полностью готов. Переходим на frontend.
```

### Критерии приёмки

- [ ] Backup/restore процедура полная и безопасная
- [ ] Rate-limit backup работает
- [ ] Health endpoint возвращает 5 проверок
- [ ] XLSX + PDF export работают
- [ ] ≥140 backend-тестов зелёных

---

## STAGE 5 — Client: Auth + UI kit + Layout

### Владелец: Codex GPT 5.5 (`ui-scaffolder` + `frontend-developer` + `test-writer`)
### Длительность: ~2 дня
### Целевые тесты: ≥30 vitest-тестов

### Промпт для Codex CLI

```
Привет. Это первый frontend-stage EpiCase (платформа для ВМедА, 30 пользователей).
Backend полностью готов (Stage 1-4). Теперь делаем клиент.

Обязательно прочитай ДО работы:
- AGENTS.md (правила для обоих агентов)
- design/DESIGN_SYSTEM.md (ВСЕ 12 разделов — особенно §2 цвета, §5 иконки,
  §6 компоненты, §7 UX-паттерны, §10 tokens.css)
- docs/PROJECT_DESIGN_EPICASE_v1.md §12 (клиентская архитектура + экраны)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §R (схемы — используй для TS типов)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §U.6 (idle timeout) + §U.8 (ProtectedRoute)
- docs/BEST_PRACTICES.md §B.2.3 (security checklist для client)

Stage 5 — scaffolding всего клиента: UI kit, auth, layout, API client, types.

Порядок (TDD):

1. Vite + React 19 + TypeScript strict + Tailwind 4 setup.
   Конфигурация уже в client/package.json и tsconfig.json.

2. client/src/main.tsx: import "./styles/tokens.css" (файл уже есть).

3. vitest setup + MSW mocks: client/src/__tests__/setup.ts.

4. TypeScript типы (зеркала Pydantic схем из §R):
   - client/src/types/user.ts (UserOut, UserCreate, UserUpdate, ...)
   - client/src/types/scenario.ts
   - client/src/types/attempt.ts
   - client/src/types/analytics.ts
   НИКОГДА не добавляй correct_value / is_correct в TS types! (§T.3)

5. Axios client: client/src/api/client.ts с interceptors:
   - Prepend JWT access_token to Authorization header
   - On 401 → попытка refresh через /api/auth/refresh
   - Если refresh тоже 401 → authStore.logout() + redirect /login?reason=session_expired
   - On 410 (попытка завершена таймером) → redirect /student/attempts/{id}/result

6. API модули: api/auth.ts, users.ts, groups.ts (под существующие роутеры бэка).

7. Zustand + immer store: client/src/stores/authStore.ts
   (user, accessToken, refreshToken, isAuthenticated, login, logout, refresh).
   Токены в localStorage. При logout — clear всё.

8. Hooks: client/src/hooks/useAuth.ts (обёртка над authStore + useNavigate).
   client/src/hooks/useIdleTimeout.ts по §U.6 (30 мин default, countdown 60с
   в модале "Вы всё ещё здесь?").

9. UI Kit (12 компонентов в client/src/components/ui/) — СТРОГО по
   DESIGN_SYSTEM §6 — никаких хардкод-цветов:
   - Icon.tsx (обёртка над branding.svg sprite)
   - Button.tsx (primary/accent/secondary/ghost/danger × sm/md/lg)
   - Card.tsx
   - Badge.tsx (success/warning/danger/info/neutral/accent)
   - Input.tsx (обязательно <label>, focus-ring, invalid state)
   - Modal.tsx (focus trap, Esc close, body scroll lock)
   - Toast.tsx (обёртка над sonner — success/error/warning/info)
   - ConfirmDialog.tsx (focus на Cancel по умолчанию!)
   - EmptyState.tsx
   - LoadingSpinner.tsx + Skeleton.tsx
   - Table.tsx

   Для каждого — минимум 2 vitest теста (render + interaction).
   Итого ≥24 теста для UI kit.

10. Layout компоненты (client/src/components/layout/):
    - AppLayout.tsx (sidebar + topbar + outlet)
    - Sidebar.tsx (role-based items: student/teacher/admin, иконки из sprite)
    - TopBar.tsx (user avatar + logout + idle countdown если активен)

11. Компоненты роутинга:
    - client/src/components/ProtectedRoute.tsx — по §U.8 ЧЕТЫРЕ случая
      (не auth → login, must_change_password → change-password,
       role не подходит → home role, всё ок → Outlet)

12. Страницы auth:
    - client/src/pages/auth/LoginPage.tsx
    - client/src/pages/auth/ChangePasswordPage.tsx (для must_change_password)

13. ОБЯЗАТЕЛЬНО (E-21 — 404/not-found pattern):
    - client/src/pages/NotFoundPage.tsx — catch-all route. Icon="search",
      показывает current URL, 2 кнопки «Назад» и «На главную» (URL зависит от
      роли из authStore).
    - client/src/pages/ForbiddenPage.tsx — роут /forbidden. Icon="lock".
    - client/src/components/ResourceNotFound.tsx — обёртка над EmptyState
      для API 404: props {resourceType, backUrl, backLabel}.
    - client/src/hooks/useResourceQuery.ts — обёртка над useQuery (TanStack):
      ловит 404 → return null; остальные ошибки → throw. Compilation-safety:
      generic <T>, return UseQueryResult<T | null>.

14. Тесты: LoginPage, ChangePasswordPage, ProtectedRoute, NotFoundPage,
    ForbiddenPage, ResourceNotFound, useResourceQuery (≥10 тестов).
    Для useResourceQuery — mock axios: 404 → data=null, 500 → isError=true.

15. client/src/App.tsx с роутингом:
    - ProtectedRoute для protected areas
    - /forbidden → ForbiddenPage (без ProtectedRoute)
    - ОБЯЗАТЕЛЬНО ПОСЛЕДНИМ: `<Route path="*" element={<NotFoundPage />} />`

КРИТИЧНО:
- Нет hardcoded hex цветов (grep найдёт — блокирует verify.sh)
- Никаких correct_value в TS-типах (grep найдёт)
- Все компоненты покрывают Loading/Empty/Error (§B.1.3)
- Все <input> с <label>
- Keyboard navigation (Tab) работает везде
- Catch-all `<Route path="*">` ОБЯЗАТЕЛЬНО последним в Routes!
- Tests — минимум 30 (12 UI × 2 + layout + 5 pages + 1 hook + 1 component)

Критерии:
- `cd client && npx tsc --noEmit` — 0 errors
- `cd client && npx vitest run` — ≥30 tests passed
- `bash scripts/verify.sh` — green
- Переход на `/unknown-path` → видим NotFoundPage (не пустая страница!)

Commit: `feat: Stage 5 — Client scaffolding + Auth + UI kit + 404 handling [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 5`

После commit'а Claude Opus 4.7 проведёт code review на security (утечки
correct_value, XSS, no hardcoded colors).
```

### Критерии приёмки

- [ ] 12 UI компонентов + тесты
- [ ] ProtectedRoute 4 случая работают
- [ ] Axios interceptors обрабатывают 401/410
- [ ] `NotFoundPage` / `ForbiddenPage` / `ResourceNotFound` / `useResourceQuery` (E-21)
- [ ] Catch-all `<Route path="*">` последним в роутинге
- [ ] ≥30 vitest тестов зелёных

---

## STAGE 6 — Client: Scenario Editor

### Владелец: Codex GPT 5.5 (`frontend-developer` + `test-writer`)
### Ревью: Claude Opus 4.7 (`security-engineer` + `code-reviewer`)
### Длительность: ~5 дней (самый сложный клиентский stage)
### Целевые тесты: ≥20 новых

### Промпт для Codex CLI

```
Stage 6: Scenario Editor с React Flow. Это самый сложный клиентский stage.

Контекст:
- docs/DESIGN_SYSTEM.md §2.3 (раскраска nodes), §6 (ChoiceEdge)
- docs/PROJECT_DESIGN_EPICASE_v1.md §12.3 (T-3 конструктор сценариев)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §UI.1 (Preview mode — in-memory)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §B.5 (condition reserved)
- Readme по @xyflow/react 12 (через Context7 MCP если доступен)

Компоненты (client/src/components/scenario/):

1. stores/scenarioEditorStore.ts — Zustand + immer:
   - nodes, edges, selectedNodeId, isDirty, lastSaveAt
   - Методы: addNode, updateNode, deleteNode, addEdge, deleteEdge,
     selectNode, markSaved

2. api/scenarios.ts + hooks/useScenarios.ts (TanStack Query).

3. 6 React Flow кастомных узлов (client/src/components/scenario/nodes/):
   - StartNode, DataNode, DecisionNode, FormNode, TextInputNode, FinalNode
   Каждый раскрашен по DESIGN_SYSTEM §2.3 (через tokens!).
   Handle-точки (input/output) с явным type='source'/target.

4. ChoiceEdge.tsx (client/src/components/scenario/edges/):
   - Цвет: зелёный is_correct=true, красный is_correct=false, жёлтый partial
   - Label в центре: "+10" / "−0" для score_delta
   - Custom edge path с smooth bezier

5. ScenarioCanvas.tsx — React Flow wrapper:
   - onNodeClick → selectNode
   - onConnect → addEdge (с дефолтами)
   - onNodesChange, onEdgesChange
   - Background grid, Controls, MiniMap

6. NodePalette.tsx — слева:
   - 6 кнопок drag-источников с иконками из sprite
   - При drag → onDrop создаёт новый узел в canvas

7. NodeInspector.tsx — справа, 6 режимов по типу узла:
   - Для start/final — только title + result_type
   - Для data — HTML editor (textarea + preview) + attachments
   - Для decision — options[] с add/remove + allow_multiple + partial_credit checkboxes
   - Для form — form_template selector + score_value per field
   - Для text_input — keywords[] + synonyms{} + min_length

8. Автосохранение: hooks/useAutoSave.ts с debounce 30s.
   Индикатор в топбаре: "● Сохранение..." → "✓ Сохранено HH:MM"
   beforeunload warning если isDirty=true.

9. pages/teacher/ScenarioEditorPage.tsx — 3 панели (palette / canvas / inspector).

10. pages/teacher/MyScenarios.tsx — список сценариев с фильтрами по
    status (draft/published/archived). Actions: edit / duplicate / archive / delete.

11. pages/teacher/ScenarioPreview.tsx — §UI.1 полный CasePlayer с флагом
    preview=true (in-memory attempts). Оранжевый баннер "🔍 Режим предпросмотра".
    Правая панель "Инсайты" (показывает correct_value только здесь для teacher!).

12. Тесты (≥20):
    - ScenarioCanvas: add node, connect nodes, delete selected
    - NodeInspector: все 6 режимов рендерятся
    - NodePalette: drag срабатывает
    - Auto-save debounce 30s (fake timers)
    - beforeunload при isDirty
    - ScenarioEditorPage integration smoke

КРИТИЧНО:
- Compile-time защита: TS types не содержат correct_value на уровне
  публичного интерфейса ScenarioFullOut. Только teacher-only расширенный
  тип TeacherScenarioFullOut в страницах teacher/ показывает эти поля.
- React.memo на 6 типах узлов (React Flow ререндерит много)
- Debounce 30s строго проверяется в тесте

После коммита Claude Opus 4.7 ревьюит:
1. Нет ли correct_value в axios request bodies к non-student endpoints
2. Нет ли утечек в Zustand persist
3. Автосохранение не может DDoS backend

Commit: `feat: Stage 6 — Scenario Editor with 6 node types [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 6`
```

### Критерии приёмки

- [ ] 6 типов узлов + ChoiceEdge
- [ ] Auto-save 30s debounce
- [ ] Preview mode (in-memory)
- [ ] ≥20 новых тестов

---

## STAGE 7 — Client: Case Player

### Владелец: Codex GPT 5.5 (`frontend-developer`)
### Ревью: Claude Opus 4.7 (UX + security)
### Длительность: ~4 дня
### Целевые тесты: ≥15 новых

### Промпт для Codex CLI

```
Stage 7: Case Player — плеер кейса для студента (и preview для teacher).

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §12.2 (S-3 плеер)
- docs/DESIGN_SYSTEM.md §7.2 (inline feedback) + §7.3 (таймер)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §U.3 (server-authoritative timer)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §A.7 (time-remaining polling)
- docs/BEST_PRACTICES.md §B.2.4 (DOMPurify для content_html)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §E.1 (PDF export)

Компоненты (client/src/components/player/):

1. api/attempts.ts + hooks/useAttempts.ts.

2. CasePlayer.tsx — корневой контейнер:
   - Слева: NavigationPanel (прогресс по этапам)
   - В центре: ActiveView (data/decision/form/text_input/final зависит от типа)
   - Сверху: TimerWidget (серверный таймер, polling каждые 30с)
   - Снизу: ProgressBar
   
3. ServerTimer.tsx по §U.3:
   - Получает expires_at от API
   - Локальный countdown раз в секунду (UI)
   - Polling /api/attempts/{id}/time-remaining раз в 30 с (синхронизация)
   - >5 мин: text-fg-muted; 1-5 мин: text-warning pulse 2s; <1 мин: text-danger pulse 1s
   - При remaining=0 → auto-finish + redirect на result
   - Toast предупреждения на 5 мин и 1 мин

4. DataView.tsx:
   - content_html через DOMPurify.sanitize (!!!) согласно §B.2.4
   - attachments (images + tables)
   - Кнопка "Далее" активна только через 1 с после рендера

5. DecisionView.tsx:
   - radio group (allow_multiple=false) или checkboxes (true)
   - Submit button disabled пока не выбрано
   - После ответа — inline-баннер success/danger + баллы анимированно
   - "Далее" активна после ≥1 с показа баннера

6. FormView.tsx с react-hook-form + zod:
   - 7 типов полей по form_template (text, textarea, select, date, number, checkbox)
   - validation_regex из template
   - client-side валидация ТОЛЬКО для UX (не security — backend всегда проверяет!)

7. TextInputView.tsx:
   - textarea с min_length indicator
   - Submit при ≥min_length
   - После ответа — feedback + keywords matched (из response)

8. FinalView.tsx:
   - Показ итога (passed/failed)
   - Path visualization (React Flow readonly)
   - PDF export кнопка

9. ProgressBar.tsx + PathVisualization.tsx.

10. pages/student/CasePlayerPage.tsx — обёртка над CasePlayer.

11. pages/student/CaseResultPage.tsx — результат попытки:
    - Score + passed/failed бейдж
    - Duration
    - Таблица шагов с is_correct / feedback
    - Path visualization
    - Кнопки: "Попытка X/Y" (re-start если разрешено) и "Export PDF"

12. Тесты (≥15):
    - ServerTimer: правильные цвета по remaining
    - ServerTimer: polling с fake timers
    - DataView: DOMPurify вызывается (mock)
    - DecisionView: submit flow + feedback baner
    - FormView: validation через zod
    - CasePlayer: F5-resume (API возвращает текущий step)
    - 410 Gone handling: redirect на result

КРИТИЧНО:
- DOMPurify ALLOWED_URI_REGEXP: /^\/media\// (не пропускать external URLs)
- Никакого correct_value в client Redux/Zustand
- Feedback (is_correct, баллы, комментарий) берутся ТОЛЬКО из response step endpoint,
  никогда не вычисляются на клиенте
- framer-motion для анимации счётчика баллов (но не блокирующей)

Commit: `feat: Stage 7 — Case Player [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 7`
```

### Критерии приёмки

- [ ] 5 views (data/decision/form/text_input/final) работают
- [ ] Server timer с 3 визуальными состояниями
- [ ] DOMPurify sanitize content_html
- [ ] F5-resume работает
- [ ] ≥15 vitest-тестов

---

## STAGE 8 — Client: Dashboards

### Владелец: Codex GPT 5.5 (`frontend-developer`)
### Длительность: ~3 дня
### Целевые тесты: ≥12 новых

### Промпт для Codex CLI

```
Stage 8: дашборды для student, teacher + analytics страница.

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §12.1 (S-1 student dashboard)
  + §12.4 (T-1 teacher), §12.5 (T-5 analytics)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §UI.2-UI.5
- docs/DESIGN_SYSTEM.md §2 (цвета для графиков)
- Readme по recharts 2.15

Страницы:

1. pages/student/StudentDashboard.tsx (S-1):
   - KPI tiles: total scenarios, completed, avg_score, total_time
   - Chart: прогресс последних 5 попыток (line)
   - Recent attempts list (link на CaseResultPage)

2. pages/student/MyCases.tsx (S-2):
   - Grid карточек: cover image, title, disease_category, status бейдж
   - Filter: по дисциплине / теме / статусу
   - Actions: "Начать" / "Продолжить" / "Результат"

3. pages/student/MyResults.tsx (S-5) по §UI.4:
   - Table всех попыток с sort + filter
   - Columns: scenario, date, attempt#, score, duration, status

4. pages/teacher/TeacherDashboard.tsx (T-1):
   - KPI tiles: total scenarios, students in groups, attempts today, avg_score
   - Chart: активность за 7 дней (bar)
   - Weak nodes list (топ-5 сложных заданий)

5. pages/teacher/AnalyticsPage.tsx (T-5) по §UI.2 — САМАЯ СЛОЖНАЯ страница:
   - KPI tiles: Passed X/Y, avg, avg duration, correct path count
   - Tab bar: Тепловая карта / Распределение / Рейтинг / Слабые узлы
   
   Вкладка "Тепловая карта":
   - React Flow readonly граф сценария
   - Узлы окрашены по avg_score_pct: зелёный>80, жёлтый>50, красный<50
   - Click на узел → модал с детальной статистикой
   
   Вкладка "Распределение": bar chart по бинам 0-20/20-40/.../80-100
   Вкладка "Рейтинг": table студентов с sort по score/duration
   Вкладка "Слабые узлы": список узлов с avg_score<50%

   Кнопки экспорта: "Скачать XLSX" / "Скачать PDF" (через ?format=...)

6. pages/teacher/GroupsPage.tsx (T-6) по §UI.3.

7. Тесты (≥12):
   - StudentDashboard rendering
   - MyResults filters
   - AnalyticsPage heatmap renders
   - Export button triggers download

Commit: `feat: Stage 8 — Dashboards and analytics [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 8`
```

---

## STAGE 9 — Client: Admin panel

### Владелец: Codex GPT 5.5
### Ревью: Claude Opus 4.7 (`security-engineer` — критично для restore)
### Длительность: ~2 дня
### Целевые тесты: ≥10 новых

### Промпт для Codex CLI

```
Stage 9: админ-панель. Критичный stage — admin может удалить базу через
restore. Нужен triple-confirm.

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §12.6-12.9 (admin экраны)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §UI.5 (UsersPage) + §UI.6 (SystemPage)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §T.5 (restore orchestration)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §SCALE.3 (HealthWidget — ADR-011)

Страницы:

1. pages/admin/AdminDashboard.tsx (A-1):
   - KPI tiles: users total, scenarios, attempts, DB size
   - components/admin/HealthWidget.tsx по §SCALE.3 (ADR-011):
     * Polling GET /api/admin/health каждые 60с
     * Зелёная/жёлтая/красная плашка по overall status
     * Последние 5 ERROR-логов
     * Звуковой alert при смене ok → warning/error
     * Звук не чаще 1/5мин
   - Graphs: new users / new attempts за 7 дней

2. pages/admin/UsersPage.tsx (A-2):
   - Search + filters (role, status, group)
   - Table с actions menu: Edit / Reset password / Block-Unblock / Delete
   - "Создать пользователя" modal
   - "Импорт из CSV" modal:
     * Drop zone для file
     * Preview первых 10 строк
     * Error list с номерами строк
     * "Скачать шаблон CSV" link

3. pages/admin/SystemPage.tsx (A-3) по §UI.6 — критично!
   - Sysinfo: DB size, version, uptime, maintenance_mode indicator
   - Backups table: Download / Restore / Delete (+ "Создать бэкап" btn)
   - Restore TRIPLE-CONFIRM:
     * Step 1: ConfirmDialog "Это заменит все данные..."
     * Step 2: Modal с textbox "Введите имя бэкапа для подтверждения: {filename}"
     * Step 3: ConfirmDialog danger variant "ПОДТВЕРДИТЕ восстановление"
     * После confirm → POST /restore (202 Accepted)
     * Polling /admin/sysinfo каждые 5с пока maintenance_mode=true
     * Toast "Восстановление завершено" когда maintenance_mode=false
   - При maintenance_mode=true ВЕЗДЕ в приложении показывается красный
     баннер "⚠ Идёт восстановление системы" (через global state)
   - System logs table с filter + pagination + export CSV

4. pages/admin/SettingsPage.tsx (A-4):
   - Form со всеми settings (institution_name, idle_timeout, max_file_upload,
     backup_retention_days)
   - PUT /api/admin/settings (E-15)
   - Save button + unsaved changes warning

5. Maintenance banner (global):
   - components/admin/MaintenanceBanner.tsx
   - Показывается когда authStore.maintenanceMode=true
   - Polling каждые 5с в фоне (hook)

6. Тесты (≥10):
   - AdminDashboard рендерит HealthWidget
   - HealthWidget показывает right color для each status
   - UsersPage: CSV upload flow
   - SystemPage: triple-confirm restore (3 steps)
   - MaintenanceBanner показывается при flag

КРИТИЧНО:
- Restore БЕЗ triple-confirm = блокер. Claude Opus 4.7 в ревью проверит.
- После restore → logout ВСЕХ пользователей (JWT secret может быть новый)
- HealthWidget НЕ может пропустить status=error — обязателен звук

Commit: `feat: Stage 9 — Admin panel [all tests green]`
Затем: `bash .claude/hooks/post-stage.sh 9`

После коммита обязательное security review от Claude Opus 4.7 для restore flow.
```

---

## STAGE 10 — Integration + Deploy

### Владелец: Оба агента
### Длительность: ~3 дня
### Финальный commit → tag v1.0

### Промпт для Claude Opus 4.7 (главная часть)

```
Финальный Stage 10. Все компоненты готовы. Нужно:
1. Smoke-test полного flow
2. Security audit
3. Сборка Docker-образов и tar.gz для ВМедА
4. Финальная документация

Контекст:
- docs/PROJECT_DESIGN_EPICASE_v1.md §15 (smoke test список)
- docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §SCALE.4 (deploy scripts)
- docs/BEST_PRACTICES.md §B.2.3 (security checklist — финальный прогон)

Задачи:

1. Smoke-test §15 — вручную пройди весь flow:
   - Admin создаёт teacher + student + группу
   - Teacher создаёт scenario с 3 типами узлов + publishes
   - Teacher assigns группе
   - Student делает попытку (правильный и неправильный пути)
   - Teacher смотрит analytics — heatmap показывает попытку
   - Admin создаёт backup → удаляет тестовые данные → restore → данные назад

2. Security audit — прогон всего OWASP checklist из §B.2.3:
   - require_role везде (grep)
   - нет f-strings в text() (verify.sh)
   - нет correct_value в client (verify.sh)
   - /api/docs закрыт в prod
   - JWT rotation procedure documented
   - Rate-limit login работает (test)
   - Backup path traversal защита
   - bcrypt cost=12 подтверждён

3. Performance audit:
   - `EXPLAIN ANALYZE` на heavy queries (analytics)
   - p95 latency для каждого endpoint < target из §B.5.2

4. Документация:
   - Обнови README.md с финальными командами
   - docs/DEPLOY.md — пошаговая инструкция для ВМедА IT
   - docs/ADMIN_GUIDE.md — как создавать юзеров, делать backup, смотреть логи
   - docs/TEACHER_GUIDE.md — как создавать сценарии
   - docs/STUDENT_GUIDE.md — как пройти кейс

5. Сборка релиза:
   - bash scripts/verify.sh → green
   - bash scripts/build-images.sh
   - bash scripts/package-release.sh → dist/epicase-v1.0.0.tar.gz
   - sha256 checksum проверен

6. Финальный git tag:
   - git tag -a v1.0.0 -m "EpiCase v1.0.0 — initial release for VMedA"
   - git push --tags (если remote настроен)

Commit: `chore: Stage 10 — Release v1.0.0 ready for VMedA deploy [all tests green]`
```

### Промпт для Codex (UX-аудит)

```
Stage 10 UX-аудит. Прогони:

1. axe DevTools на всех страницах — 0 violations.
2. Контраст всех текст/фон пар ≥ 4.5:1 (WCAG AA).
3. Keyboard-only navigation (Tab) — все действия доступны.
4. Screen reader support (VoiceOver/NVDA) — смысл не теряется.
5. Разрешение 1024×768 — layout не ломается.
6. Dark mode preview (если заработает) — токены корректно перекрашиваются.

Создай docs/UX_AUDIT_v1.0.md со всеми найденными проблемами. Исправь
critical, yellow — в backlog для V2.
```

---

## Дополнительные промпты

### Если что-то сломалось: debug-промпт

```
Что-то сломалось. Прошу:

1. Запусти bash scripts/verify.sh, покажи вывод.
2. Если тесты красные — покажи полный traceback первой failing test.
3. Не ХАКАЙ тест чтобы стал зелёным. НИКАКИХ pytest.skip, xfail или
   комментирования assert-ов. Исправь код или исправь understanding.
4. Предложи минимальный fix + тест, который это воспроизводит.
5. После исправления — full suite green → commit с фиксом:
   "fix: <описание> [all tests green]"
```

### Ad-hoc ревью кода

```
Прошу code review последнего commit'а. Проверь по BEST_PRACTICES §B.2.3
OWASP checklist + § T.3 no answer leaks. Не предлагай реструктуризацию —
только точечные fixes. Формат: Issue / Severity / File:line / Fix.
```

### Обновление зависимостей

```
Проверь, есть ли minor/patch updates для наших зависимостей:
- server/requirements.txt
- client/package.json

НЕ обновляй major версии без отдельного ADR.

Для каждого minor/patch update:
1. Обнови версию
2. Запусти тесты
3. Если зелёные — OK, включи в batch commit
4. Если красные — rollback + вынеси в issue

Commit: "chore: dep updates (minor/patch only) [all tests green]"
```

### Откат stage

```
Этот stage оказался спроектирован неправильно. Нужно откатить и
переделать. Прошу:

1. Проверь git log — покажи последний stage commit
2. git revert <commit> (не reset! reset опасен в shared repo)
3. Удали тесты, которые относятся к этому stage
4. Обнови MEMORY.md: сними [x] с этого stage
5. Обнови Next Action
6. Commit: "revert: Stage N — reason [all tests green]"

После — обсуди со мной что именно нужно переделать, затем делаем
переработанный stage с новым подходом.
```

---

## Быстрая справка

| Stage | Агент | Effort | Промпт выше | Целевые тесты |
|---|---|---|---|---|
| 0 | Claude + User | medium | Stage 0 | 0 (заглушки) |
| 1 | Claude Opus 4.7 | xhigh | Stage 1 | ≥30 |
| 2 | Claude Opus 4.7 | xhigh (graph_engine) | Stage 2 | ≥40 |
| 3 | Claude Opus 4.7 | xhigh (grader) | Stage 3 | ≥40 |
| 4 | Claude Opus 4.7 | xhigh (backup) | Stage 4 | ≥30 |
| 5 | Codex GPT 5.5 | medium | Stage 5 | ≥30 |
| 6 | Codex GPT 5.5 | high | Stage 6 | ≥20 |
| 7 | Codex GPT 5.5 | high | Stage 7 | ≥15 |
| 8 | Codex GPT 5.5 | medium | Stage 8 | ≥12 |
| 9 | Codex GPT 5.5 | high | Stage 9 | ≥10 |
| 10 | Оба | high | Stage 10 | все ≥230 |

**Каждый промпт самодостаточен:** контекст → порядок работы → критерии приёмки →
commit message → post-stage hook. Можно копировать дословно.
