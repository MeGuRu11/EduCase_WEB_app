# EpiCase — Audit Report: Пробелы в документации

> Системный аудит `docs/PROJECT_DESIGN_EPICASE_v1.md` (2996 строк), стартера, `.claude/`, `.codex/`, `SKILLS_AUDIT_EPICASE.md`.
> Дата: 2026-04-16
> Аудитор: Claude Opus 4.7
>
> **Легенда:**
> - 🔴 **CRITICAL** — блокирует начало работы или ведёт к несовместимой реализации
> - 🟡 **IMPORTANT** — не блокирует старт, но приведёт к переделкам на поздних этапах
> - 🔵 **NICE-TO-HAVE** — полезное уточнение, но можно отложить до V2
>
> **Правило исправления:** все CRITICAL и IMPORTANT закрыты в `PROJECT_DESIGN_ADDENDUM_v1.1.md`. NICE-TO-HAVE — список открытых вопросов для будущих итераций.

---

## Сводка

| Приоритет | Количество | Статус |
|---|---|---|
| 🔴 CRITICAL | 8 | Закрыты в ADDENDUM |
| 🟡 IMPORTANT | 19 | Закрыты в ADDENDUM |
| 🔵 NICE-TO-HAVE | 13 | Вынесены в backlog |
| **Итого** | **40** | |

---

## 🔴 CRITICAL — блокирующие пробелы

### C-01. Полностью отсутствует дизайн-система
**Где:** Весь документ.
**Проблема:** Нет цветов, шрифтов, spacing, компонентов, UX-паттернов. В §17 сказано «НЕ hardcode цветов — Tailwind tokens», но сами токены не определены нигде. Агент, который начнёт писать клиент без этого, получит несогласованный UI.
**Исправление:** Создан `design/DESIGN_SYSTEM.md` + `design/epicase-design-system.svg`. В ADDENDUM добавлен §D, ссылающийся на эти файлы.
**Владелец фикса:** Claude Opus 4.7 (архитектурно), затем Codex GPT 5.4 (реализация `tokens.css` и `components/ui/`).

### C-02. Конфликт имён агентов между документами
**Где:** §20 (`Gemini 3.1 Pro`) vs `AGENTS.md`/`CLAUDE.md`/`.codex/*.toml` (`Codex GPT 5.4`).
**Проблема:** Документ `PROJECT_DESIGN §20.1–20.3` говорит о паре Claude Opus 4.7 + Gemini. Файлы стартера (`.codex/config.toml`, `.codex/agents/*.toml`, `AGENTS.md`) говорят о Claude + Codex. Два разных стека. Агент, который читает §20, будет искать Gemini; агент, который читает `AGENTS.md`, будет использовать Codex.
**Исправление:** §20 ADDENDUM переписывает распределение под **Claude Opus 4.7 + Codex GPT 5.4** (как в стартере). §20 дизайн-документа помечен как outdated.
**Владелец фикса:** Claude Opus 4.7.

### C-03. Pydantic-схемы ответов не определены
**Где:** §6 — упоминаются по имени `UserOut`, `ScenarioListOut`, `ScenarioFullOut`, `NodeOut`, `EdgeOut`, `AttemptStart`, `AttemptResultOut`, `StepResultOut`, `PathAnalysisOut`, `ScoreDistOut`, `SystemLogOut`, `AttemptSummaryOut`, `GroupOut` — но ни одно поле не описано.
**Проблема:** Бэкенд нельзя начать писать — не ясно, что возвращать. Фронтенд не может создать TypeScript-типы.
**Исправление:** В ADDENDUM §R даны полные определения всех 14 схем.
**Владелец:** Claude Opus 4.7.

### C-04. Поведение таймера попытки не определено
**Где:** §16.3 EC-ATTEMPT-04: «Время вышло → auto-finish при следующем step».
**Проблема:** Кто считает время — клиент или сервер? Что видит студент в момент истечения? Если клиент закрыл вкладку, auto-finish всё равно сработает? А если клиент перевёл компьютер в сон?
**Исправление:** В ADDENDUM §U.3 описана серверно-авторитетная модель таймера: сервер хранит `attempt.started_at + time_limit`, клиент опрашивает `GET /api/attempts/{id}/time-remaining` каждые 30 с, при `remaining ≤ 0` клиент получает `410 Gone` на следующий `step` и редиректится на result.
**Владелец:** Claude Opus 4.7.

### C-05. Оркестрация restore из бэкапа не описана
**Где:** §6.8 `POST /api/admin/backups/{filename}/restore` — одна строка: «pg_restore из файла».
**Проблема:** Без правильной последовательности (остановить writer-сессии, закрыть пул соединений SQLAlchemy, сделать `DROP SCHEMA CASCADE; CREATE SCHEMA`, восстановить, пересоздать пул) получаем corrupted state.
**Исправление:** В ADDENDUM §T.5 описана полная процедура + флаг `SystemSetting.maintenance_mode` + UI-баннер для студентов.
**Владелец:** Claude Opus 4.7 (реализация `backup_service.py`).

### C-06. Seed data для первого запуска не описана
**Где:** §18.6 упоминает «admin / Admin1234», но больше ничего.
**Проблема:** Какие 3 роли (точные display_name), какие дисциплины, какие темы, какие form_templates (для обязательных форм «Экстренное извещение ф.23» и «Направление на лабораторное исследование»)? Без этого при первом `docker compose up` учителя не смогут создавать form-узлы.
**Исправление:** В ADDENDUM §S — полный seed-файл с 3 ролями, 2 дисциплинами, 5 темами, 2 form_templates с полями.
**Владелец:** Claude Opus 4.7.

### C-07. Формат `POST /api/users/bulk` не описан
**Где:** §6.2 — есть JSON-формат в теле, но в статье упоминается массовая загрузка студентов.
**Проблема:** JSON не удобен для ручной подготовки списка группы на 30 студентов. Нужен CSV/Excel.
**Исправление:** В ADDENDUM §T.6 — спецификация CSV (UTF-8 BOM, разделитель `;`, 6 колонок), принимается как `multipart/form-data` на `POST /api/users/bulk-csv`, валидация с построчными ошибками.
**Владелец:** Claude Opus 4.7.

### C-08. ProtectedRoute и role-based redirect
**Где:** §12.1 — используется `<ProtectedRoute>` в роутинге, но ни поведение, ни логика редиректа нигде не описаны.
**Проблема:** Что происходит, когда student заходит на `/admin/*`? Редирект на свою главную? 403? Флаг «Нет доступа»? А при истекшем токене?
**Исправление:** В ADDENDUM §U.8 — полная спецификация: не авторизован → `/login` с `returnTo`; роль не соответствует → toast «Нет прав» + редирект на главную своей роли; 401 из API → автоматический refresh → при неудаче logout.
**Владелец:** Codex GPT 5.4 (реализация), Claude Opus 4.7 (ревью).

---

## 🟡 IMPORTANT — важные уточнения

### I-01. Password policy
**Где:** §19 — «bcrypt cost=12», §16.1 — «Минимум 8 символов». Больше ничего.
**Проблема:** Complexity (наличие цифры, буквы в разных регистрах) не определена. Для военно-медицинского заведения это важно.
**Фикс:** ADDENDUM §T.1 — Policy: min 8, ≥1 цифра, ≥1 буква, ≥1 символ из `!@#$%^&*-_=+`. Regex + сообщения об ошибках.

### I-02. GIN индекс на `node_data` JSONB
**Где:** §8.1 SQL-схема. Упомянут в `.claude/agents/database-optimizer.md`, но в схеме отсутствует.
**Проблема:** Аналитика по keywords или полям формы будет сканировать все записи.
**Фикс:** ADDENDUM §Q.1 — `CREATE INDEX idx_nodes_data_gin ON scenario_nodes USING GIN (node_data);` в миграции 002.

### I-03. Partial scoring для decision-узла
**Где:** §9.3 — есть `allow_multiple`, но в §11 grader считает только бинарно (верно/неверно).
**Проблема:** Если студент выбрал 2 из 3 правильных вариантов — сколько баллов? Статья упоминает этот режим.
**Фикс:** ADDENDUM §B.3 — добавить поле `partial_credit: bool` в node_data. Логика: `score = max_score × (correct_selected / total_correct)` если partial_credit.

### I-04. Экспорт аналитики в PDF/Excel
**Где:** Статья упоминает экспорт одним нажатием, но в §6.7 эндпоинтов нет.
**Проблема:** Без этого преподаватель не сможет готовить отчётность кафедре.
**Фикс:** ADDENDUM §E.1 — 3 новых эндпоинта: `GET /api/analytics/teacher/scenario-stats.xlsx`, `.pdf`, `path-heatmap.xlsx`. Используем `openpyxl` (уже есть) + `reportlab` для PDF.

### I-05. UI-экраны T-4/T-5/T-6/S-5/A-2/A-3 не описаны
**Где:** §12 — описаны только T-3 (конструктор) и S-3 (плеер).
**Проблема:** Codex GPT 5.4 при реализации этих страниц будет импровизировать, получим несогласованный UI.
**Фикс:** ADDENDUM §UI.1–UI.6 — детальные спеки экранов с wireframe-описанием, списком секций, компонентами.

### I-06. Rate limiting для `/admin/backup`
**Где:** Только для login (§19).
**Проблема:** Backup — тяжёлая операция (pg_dump на 100 МБ — это 10+ секунд I/O). Если admin случайно кликнет «Создать бэкап» 5 раз подряд — падение системы.
**Фикс:** ADDENDUM §T.7 — в-памяти throttle: `POST /api/admin/backup` — не чаще 1 раза в 5 минут. Ответ 429 с `Retry-After`.

### I-07. Логирование — уровни, что именно пишется, ретенция
**Где:** §8.1 `system_logs` — таблица есть, но никаких правил.
**Проблема:** Без политики логов таблица забьётся за неделю или, наоборот, ничего не будет записано при инциденте.
**Фикс:** ADDENDUM §T.4:
- Уровни: DEBUG (только dev), INFO (login, scenarios CRUD, publish), WARNING (failed login, deprecated API), ERROR (5xx, неожиданные исключения)
- Обязательный `actor_id` при записи write-операций (семантически — «кто совершил действие»; в SQL это колонка `system_logs.user_id`)
- Retention: автоочистка DEBUG+INFO старше 30 дней, WARNING+ERROR — 365 дней (фоновая задача APScheduler)

### I-08. MCP config `context7.json` отсутствует в стартере
**Где:** Упоминается в §20.4 и §23, но в стартере нет.
**Проблема:** Codex CLI настроен через `.codex/config.toml` (уже включает `[mcp_servers.context7]`). Для Claude Code аналогичной настройки нет.
**Фикс:** ADDENDUM §M.1 — добавить `.claude/mcp/context7.json` + указание в `.claude/settings.json`.

### I-09. Idle timeout — поведение не описано
**Где:** §6.8 — `idle_timeout_min` в settings. Больше нигде.
**Проблема:** Что это значит? Logout? Lock экран? Клиент или сервер отслеживают?
**Фикс:** ADDENDUM §U.6 — клиент отслеживает активность (click/keydown), при бездействии `idle_timeout_min` минут показывает модал «Вы всё ещё здесь?» (60 с countdown), затем logout. Серверная часть: JWT остаётся валидным до своего истечения (stateless), logout — только клиент.

### I-10. Session behaviour после logout
**Где:** `POST /api/auth/logout` возвращает `{status: "ok"}` без деталей.
**Проблема:** JWT stateless — сервер не может «отозвать» токен. Что делает logout на сервере? На клиенте?
**Фикс:** ADDENDUM §A.2 — logout:
- Сервер: записывает в `system_logs` факт логаута, больше ничего (токен истечёт сам)
- Клиент: очищает `authStore`, стирает `localStorage`, редирект на `/login`
- Опционально V2: blacklist-таблица для немедленной инвалидации

### I-11. Dockerfile содержит `postgresql-client` — зачем?
**Где:** `server/Dockerfile`.
**Проблема:** Не явно, но необходим для `pg_dump` из `backup_service.py`. Без комментария выглядит как раздутие образа.
**Фикс:** Добавить комментарий в Dockerfile + упомянуть в §T.5 (backup).

### I-12. Нет описания pagination defaults
**Где:** §6 — `?page=1&per_page=20` в одном месте, больше нигде.
**Проблема:** Какой дефолт, макс per_page? Как возвращать total_pages?
**Фикс:** ADDENDUM §A.3 — `page` default 1, `per_page` default 20, max 100. В `schemas/common.py` уже есть `PaginatedResponse` — добавить validator'ы.

### I-13. Сортировка по умолчанию
**Где:** Списки (scenarios, users, attempts) — ничего про дефолтный order.
**Фикс:** ADDENDUM §A.4:
- scenarios: `ORDER BY updated_at DESC`
- users: `ORDER BY full_name ASC`
- attempts: `ORDER BY started_at DESC`
- logs: `ORDER BY created_at DESC`

### I-14. CORS — чёткая конфигурация
**Где:** В `main.py` стартера — `allow_origins=["*"]`.
**Проблема:** В § 19 сказано, что это безопасно в LAN. Но когда dev работает с `http://localhost:5173` (Vite) и API на `http://localhost:8000` — нужно явно. Для продакшна — только IP сервера.
**Фикс:** ADDENDUM §T.8 — `CORS_ORIGINS` из env: `["http://localhost:5173"]` в dev, `["http://epicase.vmeda.local"]` в prod. Wildcard — запрещён.

### I-15. Avatar upload flow
**Где:** `avatar_path` в таблице `users`, но эндпоинта загрузки нет в §6.
**Фикс:** ADDENDUM §A.5 — `POST /api/users/me/avatar` (multipart), проверка Pillow + size (2 MB), запись `media_files` + update `users.avatar_path`.

### I-16. Удаление / архивация сценария
**Где:** §6.4 — нет `DELETE /api/scenarios/{id}`.
**Проблема:** Teacher должен иметь возможность удалить черновик. Опубликованный — архивировать.
**Фикс:** ADDENDUM §A.6 — `DELETE /api/scenarios/{id}` (только draft, только автор), `POST /api/scenarios/{id}/archive` (любой статус, ставит status=archived). Физически не удаляем данные (история попыток сохраняется).

### I-17. `condition` JSONB в `scenario_edges` — не описано
**Где:** §8.1 — поле есть, но нигде не использовано.
**Проблема:** Мёртвое поле в схеме.
**Фикс:** ADDENDUM §B.5 — отметить как reserved для V2 (условные переходы на основе предыдущих ответов). В MVP всегда `NULL`, в comment миграции отметить.

### I-18. Scenario Preview (T-4) — как работает
**Где:** §12.1 — есть роут, но не ясно, что это.
**Проблема:** Teacher нажимает «Preview» — это создание fake-попытки? Просмотр графа? Реальный CasePlayer?
**Фикс:** ADDENDUM §UI.1 — Preview = полноценный CasePlayer с флагом `preview=true`: попытка НЕ пишется в БД (in-memory), но вся механика работает (grader, next_node). Кнопка «Выйти из предпросмотра» в топ-баре.

### I-19. Нет описания `GET /api/attempts/{id}/time-remaining`
**Где:** Связано с C-04.
**Фикс:** В ADDENDUM §A.7 — `GET /api/attempts/{id}/time-remaining → {remaining_sec: int, expires_at: ISO}`. Если попытка без лимита — `{remaining_sec: null}`.

---

## 🔵 NICE-TO-HAVE — открытые вопросы (backlog)

### N-01. Import/Export сценариев между учреждениями
- Статья упоминает в «Заключении» как V2.
- **Ответственный:** future sprint, Claude Opus 4.7 архитектура, Codex реализация.

### N-02. WebSocket для real-time teacher monitoring
- Преподаватель в реальном времени видит прогресс группы во время занятия.
- **Ответственный:** V2, требует `python-socketio` или `fastapi-websockets`.

### N-03. Accessibility — полное покрытие WCAG 2.1 AA
- Базовый минимум в `DESIGN_SYSTEM.md §8`, но полный аудит нужен отдельно.
- **Ответственный:** отдельный этап перед публичным релизом, `axe-core` + ручной аудит с NVDA.

### N-04. Responsive для мобильных (< 768 px)
- В MVP минимум iPad (≥ 768). Телефон — отдельная задача.
- **Ответственный:** V2 или по запросу кафедры.

### N-05. Dark mode
- CSS-переменные готовы (`DESIGN_SYSTEM.md §9`), но переключатель и тестирование — V2.

### N-06. i18n (английская версия интерфейса)
- Сейчас все строки по-русски в JSX. Если потребуется — вынести в `i18next` через `react-i18next`.

### N-07. Дополнительные типы узлов из статьи (MVP-scope)
- Статья упоминает 12 типов, MVP — 6. Остальные (calculation, image_annotation, timeline, matching, ordering, table) — отдельные узлы в V2.

### N-08. Print styles для отчётов
- Аналитика печатается на принтер — нужны `@media print` правила. Сейчас PDF-экспорт (I-04) закрывает кейс.

### N-09. Логика `max_visits per node` для циклических графов
- Упоминается в §17 как правило, но не реализовано в engine.
- **Ответственный:** если решим разрешать циклы.

### N-10. Performance tuning PostgreSQL (`shared_buffers`, `work_mem`)
- Для 30 одновременных пользователей дефолты подходят. Тюнинг — при росте.

### N-11. Nginx rate limiting
- Внутри LAN, изолированной от интернета, критично только для login-эндпоинта (уже есть на уровне приложения). Для production с публичным доступом — потребуется.

### N-12. Monitoring (Prometheus metrics)
- В изолированной LAN без мониторинговой инфры — избыточно. Добавить при необходимости.

### N-13. Полная типизация form fields (`validation_regex` для диагнозов МКБ-10 и т.п.)
- Сейчас произвольные regex. Библиотека готовых шаблонов (ICD-10, ФИО, даты, телефоны) — улучшение.

---

## Приоритизация по этапам

Следующая таблица показывает, какие пробелы должны быть закрыты **до начала** соответствующего этапа:

| Этап | Обязательные фиксы перед стартом | Источник |
|---|---|---|
| **Stage 0** (инфра) | C-02 (агенты), I-14 (CORS) | ADDENDUM §X, §T.8 |
| **Stage 1** (Auth, Users, Groups) | C-03 (схемы), C-06 (seed), C-07 (bulk CSV), C-08 (ProtectedRoute), I-01 (password), I-07 (logs) | ADDENDUM §R, §S, §T.1, §T.4, §T.6, §U.8 |
| **Stage 2** (Scenarios, Graph) | I-02 (GIN), I-16 (DELETE/archive), I-17 (condition→reserved), I-18 (Preview) | ADDENDUM §Q.1, §A.6, §B.5, §UI.1 |
| **Stage 3** (Attempts, Grading) | C-04 (таймер), I-03 (partial decision), I-19 (time-remaining) | ADDENDUM §U.3, §B.3, §A.7 |
| **Stage 4** (Analytics, Admin) | C-05 (restore), I-04 (export), I-06 (rate limit backup) | ADDENDUM §T.5, §E.1, §T.7 |
| **Stage 5–9** (клиент) | **C-01 (дизайн-система)** — обязательно до старта | `DESIGN_SYSTEM.md`, `epicase-design-system.svg` |

---

## Что сделано прямо сейчас

1. ✅ `design/epicase-design-system.svg` — визуальный референс с логотипом, палитрой, 6 типами узлов, 12 разделами, 8 статусами
2. ✅ `design/DESIGN_SYSTEM.md` — полная спецификация (цвета, типографика, spacing, компоненты, accessibility, Tailwind v4 config)
3. ✅ `docs/AUDIT_REPORT.md` — этот файл
4. ✅ `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md` — все 27 фиксов (8 CRITICAL + 19 IMPORTANT)
5. ✅ `docs/AGENT_TASKS.md` — детальное распределение задач между Claude Opus 4.7 и Codex GPT 5.4 для каждого из 10 этапов + общий список «кто что делает»

Перед началом Stage 1 эти документы должны быть замёржены в основной `PROJECT_DESIGN_EPICASE_v1.md` как `v1.1`, и это должно быть отражено в `MEMORY.md`.
