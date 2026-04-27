# EpiCase — CHANGELOG

## 1.1.0 — 2026-04-25 — Backend pre-Stage-4 hardening

### Added

- **Audit log** (`audit_logs` table, migration 005). Records significant
  mutations: `user.create / update / block / unblock / bulk_csv / logout`,
  `group.create / update / add_member / remove_member /
  assign_teacher / remove_teacher`, `scenario.create / save_graph /
  publish / unpublish / archive / duplicate / delete / assign`,
  `attempt.finish / abandon / auto_finish` (system attribution).
  `services.audit_service.log_action` writes inside the caller's
  transaction and never commits on its own.
- **JTI blacklist** (`token_blacklist` table, migration 006). Every
  access token now carries a `jti` (UUID4); `POST /api/auth/logout` adds
  it to the blacklist; `dependencies.get_current_user` rejects revoked
  tokens with 401 "Token revoked". Hourly APScheduler job
  `cleanup_expired_blacklist` purges entries older than 1 day past
  `expires_at`.
- **`models.user.RoleName`** centralised role-string constants
  (`ADMIN / TEACHER / STUDENT`) — replaces stringly-typed checks across
  `services/*` and `routers/*`.

### Changed

- `services/scenario_service.list_for` switched to `selectinload` for
  `author` + `assignments` and a single grouped count of nodes — fixed
  N+1 reported in `docs/RETRO_AUDIT_STAGE0-3.md` priority 3.
- `services/attempt_service.list_for_student` switched to
  `selectinload(Attempt.scenario)` — same fix.
- `Scenario.author` relationship added to support the eager-load above.
- `APP_VERSION` bumped from `1.0.0` to `1.1.0` to align with
  ADDENDUM v1.1.

### Deferred (still tracked)

- Refresh-token rotation. Current refresh flow does not rotate the
  refresh token on `POST /api/auth/refresh`. Owner: Stage 10.

### Tests

- `+test_audit_log.py` (6 tests).
- `+test_health.py` (1 test).
- `+test_auth.py` (4 tests for jti blacklist + cleanup).
- `+test_scenarios.py` (1 N+1 regression).
- `+test_attempts.py` (1 N+1 regression).
- Total backend suite: **152 / 152 green**.

## v1.1.5 — 2026-04-18

### Added

**Frontend 404 / not-found pattern (E-21):**
- `client/src/pages/NotFoundPage.tsx` — catch-all route для неизвестных URL.
  Icon="search", current URL display, 2 кнопки («Назад» + «На главную» по роли).
- `client/src/pages/ForbiddenPage.tsx` — роут `/forbidden` для explicit-навигации.
  Icon="lock", описание, кнопка «Назад».
- `client/src/components/ResourceNotFound.tsx` — обёртка над EmptyState для
  API 404 (в *DetailPage.tsx). Props: {resourceType, backUrl, backLabel}.
- `client/src/hooks/useResourceQuery.ts` — универсальная обёртка над useQuery:
  404 → `null`, остальные → throw. Все `*DetailPage` используют этот паттерн.

### Changed

**`docs/PROJECT_DESIGN_ADDENDUM_v1.1.md §U.8`:**
- Расширен полной спецификацией 404/not-found pattern
- Catch-all route `<Route path="*">` обязательно последним
- ResourceNotFound pattern для API 404
- `useResourceQuery` hook с полным примером
- 4 правила для code-reviewer

**`docs/AGENT_TASKS.md` Stage 5:**
- Добавлены 5 задач (NotFoundPage, ForbiddenPage, ResourceNotFound,
  useResourceQuery, catch-all route)
- Целевые тесты: 26 → **30**

**`docs/AGENT_PROMPTS.md` Stage 5:**
- Промпт расширен: пункты 13-15 с deployment-готовыми инструкциями
- Commit message: `feat: Stage 5 — Client scaffolding + Auth + UI kit + 404 handling`

**ERRATA:** переименовано `ERRATA_v1.1.2.md` → `ERRATA_v1.1.3.md`.
Новый раздел «Часть 4. UX-дополнение» с E-21.

### Metrics

- Технических ошибок исправлено: 20 → **21**
- Файлов в архиве: без изменений (**230**, содержание изменилось)
- Целевой Stage 5 test count: 26 → **30**

---

## v1.1.4 — 2026-04-18

### Added

**Интерактивный визуальный референс от Claude Design:**
- `design/EpiCase_Design_System.html` (83 KB, 1531 строка) — полноценная HTML-страница:
  hero-секция с градиентом, 10 разделов (бренд, палитра, роли, типографика,
  spacing/radius/shadow, иконография, 6 типов узлов, компоненты, граф-мок,
  **Teacher Dashboard wireframe**). Открывается в любом браузере, показывает
  компоненты в действии (btn/badge/card/input с состояниями).
- Теперь основной UI-референс для разработки — живая веб-страница, не статический SVG.

**Обновлённый `branding.svg` (30 symbols вместо 26):**
- 3 варианта логотипа (было 4 — убран lockup, он теперь в HTML-референсе):
  `logo-mark` (primary gradient), `logo-mark-mono`, `logo-mark-outline`
- 6 иконок типов узлов (start, data, decision, form, text_input, final)
- 12 иконок разделов (dashboard, cases, groups, users, analytics, attempts,
  editor, player, admin, system, settings, login)
- 9 статусных иконок (heatmap, check, cross, warn, info, download, search, lock, clock)
- **Новое:** 3 стрелочных маркера (`arrow-green`, `arrow-red`, `arrow-amber`)
  для ChoiceEdge в React Flow
- **Новое:** 3 градиента (`brand-gradient`, `brand-gradient-v`, `bg-soft`)

**AGENT_PROMPTS.md в `docs/`:**
- 1119 строк готовых промптов для копирования в Claude Code / Codex CLI
- По одному промпту на каждый Stage 0-10 + 4 дополнительных
  (debug, ad-hoc review, deps update, revert)
- Каждый промпт самодостаточен: контекст → порядок TDD → критерии приёмки →
  commit message → post-stage hook

### Changed

**`design/DESIGN_SYSTEM.md`:**
- Обновлён заголовочный блок: теперь 3 референса (HTML основной + SVG sprite + tokens.css)
- Обновлена схема директории пакета

**Совместимость:**
- Все CSS токены сохранены (`--color-royal`, `--color-sky` и др.)
- Все символы SVG по именам совместимы с тем, что уже используется в коде
  (`<Icon name="node-decision" />` продолжает работать)
- Никаких breaking changes — апгрейд визуального референса.

### Metrics

- Файлов в архиве: **229** (+1: AGENT_PROMPTS.md, заменены svg и html)
- Новых документов: **1** (AGENT_PROMPTS.md)
- SVG symbols: **30** (было 26, +3 arrow markers +3 gradients +3 logo vs 4 old)

---

## v1.1.3 — 2026-04-17

### Added

**Новый ADR:**
- **ADR-014** — Ruflo (Claude-Flow) не устанавливается как runtime-зависимость.
  Взяты 3 концептуальных паттерна без самого инструмента.

**Statusline для Claude Code** (inspired by Ruflo):
- `.claude/statusline.sh` — показывает `branch │ model │ context% │ Stage │ tests`
  в статусбаре Claude Code. Читает JSON из stdin, gracefully fallback.
- `settings.json → statusLine` — конфигурация.

**Post-stage hook** (inspired by Ruflo hooks system):
- `.claude/hooks/post-stage.sh` — после stage commit:
  - меняет `[ ]` на `[x]` в MEMORY.md
  - обновляет `Last Updated`
  - пересчитывает тесты
  - напоминает обновить `Next Action`
- Использование: `bash .claude/hooks/post-stage.sh N` (auto-detect из commit message).

**SPARC-TDD methodology** (inspired by SPARC methodology от Ruflo):
- Добавлен раздел `Methodology: SPARC-TDD` в `CLAUDE.md`
- S → P → A → R → C цикл, адаптированный под нашу модель one-agent-per-stage
- Это НЕ hive-mind SPARC от Ruflo — это простая последовательность без swarm'ов

### Changed

**CLAUDE.md:**
- Добавлен раздел `Methodology: SPARC-TDD`
- Добавлен раздел `Hooks` со списком pre/post hooks

**.claude/settings.json:**
- Добавлен `statusLine` config
- Добавлены permissions для `.claude/hooks/*.sh`, `.claude/statusline.sh`, `scripts/*.sh`

### Metrics

- ADR: **14** (было 13 + ADR-014)
- Файлов в пакете: **178** (было 176 + statusline.sh + post-stage.sh)

---

## v1.1.2 — 2026-04-17

### Added

**Новый документ:**
- `docs/BEST_PRACTICES.md` (~500 строк) — интеграция 5 паттернов из
  [system-design-primer](https://github.com/donnemartin/system-design-primer):
  REST sanity check, OWASP security checklist, ACID transaction boundaries,
  database indexing deep-dive, latency reference.

**Новый ADR:**
- **ADR-013** — At-rest БД encryption отложено до V2 (принятый risk для MVP)

**Новая зависимость client:**
- `dompurify^3.2.3` + `@types/dompurify^3.2.0` — XSS защита для `content_html` в data-узлах

**Новая env-переменная:**
- `ENV=dev|prod` в `.env.example` — управляет доступностью `/api/docs`

**Новая проверка в scripts/verify.sh:**
- Grep на f-strings внутри `text()` → защита от SQL injection (E-20)

### Fixed (ERRATA v1.1.2 — 8 новых исправлений от E-13 до E-20)

- **E-13:** `POST /toggle-active` неидемпотентен → `PUT /api/users/{id}/status` с телом
- **E-14:** publish/unpublish некорректно ведут себя при повторном вызове → добавлено «re-call в target state возвращает 200»
- **E-15:** `PATCH /api/admin/settings` → `PUT /api/admin/settings` (форма всегда отправляет всё)
- **E-16:** расширения `.xlsx`/`.pdf` в URL path → `?format=xlsx|pdf` query parameter
- **E-17:** `/api/docs` публично доступен → `docs_url=None` в prod через env
- **E-18:** JWT secret rotation не описана → процедура в SCALE.5 + BEST_PRACTICES
- **E-19:** At-rest encryption не решено → **ADR-013** (осознанный отказ до V2)
- **E-20:** Potential SQL injection через f-strings в `text()` → grep-защита в verify.sh

### Changed

**Обновления ADDENDUM:**
- §A.6: `PUT /api/users/{id}/status` заменяет `POST /toggle-active`
- §6.4 publish: добавлено правило идемпотентности для повторных вызовов
- §6.8 settings: `PUT` вместо `PATCH`
- §E.1 export: `?format=...` вместо расширения в URL
- §Q: добавлены 2 partial index (`idx_scenarios_published`, `idx_logs_errors`)

**Обновления агентов:**
- `.claude/agents/backend-architect.md`: REST checklist (B.1.4)
- `.claude/agents/security-engineer.md`: OWASP-aligned checklist (B.2.3)
- `.claude/agents/database-optimizer.md`: правила индексации (B.4.1–B.4.4)

**Новые задачи в AGENT_TASKS.md:**
- Stage 4: `test_save_graph_is_atomic_on_failure`, `test_start_attempt_concurrent`
- Stage 9: санитизация `content_html` через DOMPurify в `DataView.tsx`

### Metrics

- Итого технических ошибок найдено и исправлено: **20** (было 12 в v1.1.1 + 8 в v1.1.2)
- Итого ADR: **13** (было 12 + ADR-013)
- Итого строк документации: **~4800** (было ~4200)

---

## v1.1.0 — 2026-04-17

### Added

**Дизайн-система (C-01):**
- `design/epicase-design-system.svg` — визуальный референс (лого + палитра + 26 иконок)
- `design/DESIGN_SYSTEM.md` — полная спецификация (12 разделов, ~540 строк)
- `client/public/branding.svg` — SVG-sprite для компонентов
- `client/src/styles/tokens.css` — Tailwind v4 `@theme` токены

**Документация:**
- `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md` — закрытия 27 пробелов + §SCALE (operational patterns)
- `docs/AUDIT_REPORT.md` — полный аудит: 40 пробелов с приоритетами
- `docs/AGENT_TASKS.md` — per-stage распределение работ
- `docs/AGENT_ROSTER.md` — компактный список «кто что делает»
- `docs/ARCHITECTURE_DECISIONS.md` — 12 ADR (защита от overengineering)
- `docs/ERRATA_v1.1.1.md` — 12 исправленных технических ошибок

**Инфраструктура (ADR-012):**
- `scripts/verify.sh` — проверка перед commit (ruff + pytest + tsc + vitest + grep-защита)
- `scripts/build-images.sh` — сборка Docker-образов
- `scripts/package-release.sh` — упаковка релиза в tar.gz
- `scripts/deploy-on-server.sh` — деплой на изолированный сервер ВМедА
- `scripts/README.md` — инструкция по полному workflow

**MCP config:**
- `.claude/mcp/context7.json` — настройка Context7 MCP для Claude Code (dev-only)

**API (ADR-009, ADR-010):**
- Требование тестов миграций Alembic (3 обязательных теста: from-scratch, downgrade, stairsteps)
- Эндпоинт `GET /api/admin/health` с 5 проверками (db, disk, backup, scheduler, errors)

**UI (ADR-011):**
- Компонент `HealthWidget` на AdminDashboard (опрос каждые 60 с + звуковой alert)

### Changed

**Lead model:** Claude Opus 4.6 → **Claude Opus 4.7** (релиз 2026-04-16)
- `.claude/settings.json`: `"model": "claude-opus-4-7"`
- `CLAUDE.md`: добавлена секция **Effort Levels** (medium/high/xhigh)
- `AGENTS.md`: обновлены источники правды + запрет на `temperature`/`top_p`/`top_k` в API

**Зависимости:**
- `server/requirements.txt`: добавлен `reportlab==4.2.5` (PDF export)
- `server/requirements-dev.txt`: добавлены `testcontainers[postgres]==4.8.2`, `ruff==0.8.4`, `mypy==1.13.0`
- `client/package.json`: добавлены `sonner^1.7.0` (toast), `immer^10.1.0` (Zustand middleware), версия → 1.1.0

**Конфигурация:**
- `.env.example`: добавлен `CORS_ORIGINS` (ADDENDUM §T.8)
- `APP_VERSION`: 1.0.0 → 1.1.0

**Архитектура (ADR явный отказ):**
- НЕ добавлено: Redis, Celery/RabbitMQ, Kubernetes, CDN, Prometheus/Grafana, внешний CI/CD, шардирование
- Обоснование: см. `docs/ARCHITECTURE_DECISIONS.md` ADR-001..008

### Fixed (ERRATA v1.1.1)

- **E-01:** forward reference в Pydantic `AttemptStartOut` → явный импорт `NodeOut`
- **E-02:** деление на ноль в partial scoring при пустом `correct_ids` → защита + валидация graph
- **E-03:** regex password policy пропускал `Ё/ё` → `[A-Za-zА-ЯЁа-яё]`
- **E-04:** `run_migrations()` после restore мог упасть на newer migrations → проверка `alembic current`
- **E-05:** SERIAL sequence не сбрасывался после seed → `setval()` для всех seed-таблиц
- **E-06:** путаница с номерами миграций → новый §MIG с раскладкой 001–004
- **E-07:** `user_id` vs `actor_id` → унифицировано
- **E-08:** `postgresql-client` в Dockerfile без объяснения → добавлено в §T.5
- **E-09:** занижено число тестов для Stage 5 (≥8 → ≥26)
- **E-10:** misleading `[all tests green]` в Stage 0 (нет тестов ещё) → `[no tests yet]`
- **E-11:** неидиоматичный `PasswordValidator` → `Annotated[str, AfterValidator(...)]`
- **E-12:** в CLAUDE.md не было правил Effort Levels для Opus 4.7 → добавлены

### Migration guide (for existing installations)

Если у вас уже развёрнут EpiCase v1.0.x:

1. Обновить `.claude/settings.json`: `"model": "claude-opus-4-7"`
2. Добавить в `.env`: `CORS_ORIGINS=http://<your-server>`
3. `pip install -r server/requirements.txt -r server/requirements-dev.txt` (в dev)
4. `npm install` (в client/)
5. Запустить `scripts/verify.sh` — проверить, что всё работает
6. Пересобрать Docker-образы через `scripts/build-images.sh`
7. Новый релиз через `scripts/package-release.sh`

---

## v1.0.0 — 2026-04-01

Initial public release based on `docs/PROJECT_DESIGN_EPICASE_v1.md`:

- FastAPI + SQLAlchemy 2 + PostgreSQL 16 backend scaffolding
- React 19 + TypeScript + @xyflow/react 12 frontend scaffolding
- Docker Compose для 3 сервисов (db, server, client)
- Nginx reverse proxy
- Структура `.claude/` и `.codex/` для двух агентских стеков
- Заглушки для всех будущих модулей (TODO-комментарии)
- `PROJECT_DESIGN_EPICASE_v1.md` — 2996 строк спецификации
- `SKILLS_AUDIT_EPICASE.md`, `INSTALL_SKILLS_GUIDE.md`
