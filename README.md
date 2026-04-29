# EpiCase

**Платформа интерактивных эпидемиологических кейсов** для подготовки врачей-эпидемиологов Военно-медицинской академии им. С.М. Кирова.

Преподаватель в браузере рисует ветвящийся граф эпидкейса (данные пациента → решение → форма документа → финал), студенты из своих браузеров в изолированной LAN проходят сценарий, сервер автоматически проверяет ответы и строит аналитику.

Версия: **1.1.0** · Дата: 2026-04-17 · Лицензия: внутреннее использование ВМедА

---

## Для кого этот README

- **Разработчик/агент, открывший репозиторий впервые** — начните отсюда
- Полная техническая документация — в `docs/`
- Дизайн-система — в `design/`
- Agent instructions — в `CLAUDE.md` + `AGENTS.md`

---

## Стек

| Слой | Технологии |
|---|---|
| Backend | FastAPI 0.115 · SQLAlchemy 2 · Alembic · PostgreSQL 16 · Pydantic 2 · bcrypt · python-jose (JWT) · APScheduler · reportlab · openpyxl |
| Frontend | React 19 · TypeScript 5.7 (strict) · @xyflow/react 12 · Zustand 5 + immer · TanStack Query 5 · Tailwind CSS 4 · React Hook Form + Zod · Recharts · framer-motion · sonner |
| Infra | Docker Compose · Nginx reverse proxy · pg_dump/pg_restore для бэкапов |
| Tests | pytest + httpx + factory-boy + testcontainers · vitest + @testing-library/react + MSW |
| Agents | Claude Opus 4.7 (Claude Code) + Codex GPT 5.5 (Codex CLI) |

---

## Быстрый старт (dev)

### Требования
- Docker + Docker Compose plugin
- Python 3.12 (для локальной разработки без Docker)
- Node.js 22 (для локальной разработки без Docker)

### Запуск

```bash
# 1. Настроить секреты
cp .env.example .env
# Отредактировать .env: POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32)

# 2. Запустить всё через Docker
docker compose up -d

# 3. Проверить
curl http://localhost/api/ping
# → {"status":"ok","version":"1.1.0"}

# 4. Открыть в браузере
open http://localhost
```

### Первый вход

После первого запуска seed.py создаёт админа:
- Логин: `admin`
- Пароль: `Admin1234!`

**Обязательно сменить пароль при первом входе** (система сама попросит).

---

## Структура репозитория

```
epicase/
├── CLAUDE.md                    ← инструкции для Claude Opus 4.7
├── AGENTS.md                    ← общие правила (читают оба агента)
├── MEMORY.md                    ← память между сессиями агентов
├── CHANGELOG.md                 ← история версий
├── README.md                    ← этот файл
├── docker-compose.yml           ← инфраструктура (db + server + client)
├── .env.example                 ← шаблон секретов
├── .gitignore
│
├── design/                      ← дизайн-система
│   ├── EpiCase_Design_System.html  — 🆕 интерактивный референс (открой в браузере)
│   ├── epicase-design-system.svg  — SVG sprite (30 symbols + arrow markers)
│   └── DESIGN_SYSTEM.md         — полная спецификация (12 разделов)
│
├── docs/                        ← документация
│   ├── PROJECT_DESIGN_EPICASE_v1.md          — базовый дизайн (2996 строк)
│   ├── PROJECT_DESIGN_ADDENDUM_v1.1.md       — 27 закрытий + §SCALE (1700+ строк)
│   ├── AUDIT_REPORT.md                       — 40 пробелов с приоритетами
│   ├── AGENT_TASKS.md                        — per-stage распределение работ
│   ├── AGENT_ROSTER.md                       — компактный список «кто что делает»
│   ├── AGENT_PROMPTS.md                      — 🆕 готовые промпты для каждого Stage
│   ├── ARCHITECTURE_DECISIONS.md             — 14 ADR (защита от overengineering + risks)
│   ├── BEST_PRACTICES.md                     — 5 практик из system-design-primer
│   ├── ERRATA_v1.1.3.md                      — 20 исправленных ошибок
│   ├── SKILLS_AUDIT_EPICASE.md               — аудит скиллов для агентов
│   └── INSTALL_SKILLS_GUIDE.md               — как установить скиллы
│
├── scripts/                     ← dev → prod workflow (ADR-012)
│   ├── verify.sh                — lint + tests + грепы безопасности
│   ├── build-images.sh          — сборка Docker-образов
│   ├── package-release.sh       — упаковка в tar.gz для флешки
│   ├── deploy-on-server.sh      — деплой на изолированном сервере ВМедА
│   └── README.md                — полный workflow
│
├── nginx/
│   └── nginx.conf               — reverse proxy configuration
│
├── .claude/                     ← конфигурация Claude Code
│   ├── settings.json            — model: claude-opus-4-7, permissions
│   ├── agents/                  — 5 суб-агентов (orchestrator, backend-architect, ...)
│   ├── commands/                — slash-команды (/review, /test, /status, /deploy)
│   ├── hooks/                   — pre-commit, lint-on-save
│   ├── rules/                   — контекстные правила по путям файлов
│   ├── mcp/                     — Context7 MCP (dev-only)
│   └── skills/                  — skills README (см. docs/INSTALL_SKILLS_GUIDE.md)
│
├── .codex/                      ← конфигурация Codex CLI
│   ├── config.toml              — model: gpt-5.5-codex
│   ├── agents/                  — 4 суб-агента (frontend-developer, ui-scaffolder, ...)
│   └── skills/                  — skills README
│
├── server/                      ← FastAPI backend
│   ├── Dockerfile               — Python 3.12 + postgresql-client
│   ├── requirements.txt         — prod dependencies
│   ├── requirements-dev.txt     — test + lint dependencies
│   ├── alembic.ini
│   ├── main.py                  — uvicorn entry point
│   ├── config.py, database.py, dependencies.py
│   ├── models/                  — SQLAlchemy ORM (user, scenario, attempt, ...)
│   ├── schemas/                 — Pydantic (auth, user, scenario, attempt, analytics, ...)
│   ├── routers/                 — FastAPI routes (auth, users, scenarios, attempts, ...)
│   ├── services/                — business logic (graph_engine, grader, backup, ...)
│   ├── migrations/versions/     — Alembic (001 users → 002 scenarios → 003 attempts → 004 system)
│   ├── tests/                   — pytest (conftest, test_auth, test_graph_engine, ...)
│   ├── seed.py                  — roles, disciplines, form templates, first admin
│   └── data/                    — runtime: media/ + backups/
│
└── client/                      ← React SPA
    ├── Dockerfile               — Node 22 + build + nginx
    ├── package.json             — v1.1.0
    ├── public/
    │   └── branding.svg         — SVG sprite (лого + иконки)
    └── src/
        ├── main.tsx, App.tsx
        ├── styles/tokens.css    — Tailwind v4 @theme tokens
        ├── api/                 — Axios client + API modules
        ├── stores/              — Zustand (authStore, scenarioEditorStore)
        ├── hooks/               — TanStack Query wrappers, useAuth, useIdleTimeout
        ├── types/               — TS types (mirror Pydantic schemas)
        ├── utils/               — constants, validators, formatters
        ├── components/
        │   ├── ui/              — 12 UI-компонентов (Button, Card, Modal, ...)
        │   ├── layout/          — AppLayout + Sidebar + TopBar
        │   ├── scenario/        — React Flow editor (nodes + edges + canvas + inspector)
        │   └── player/          — CasePlayer + 5 views
        └── pages/
            ├── auth/            — LoginPage + ChangePasswordPage
            ├── student/         — 5 страниц
            ├── teacher/         — 6 страниц
            └── admin/           — 4 страницы
```

---

## Что сейчас готово (состояние Stage 0.5)

- ✅ **Инфраструктура:** Docker Compose, Dockerfile'ы, Nginx, PostgreSQL 16
- ✅ **Дизайн-система:** полная спецификация + SVG-sprite + tokens.css
- ✅ **Документация:** базовый дизайн + 6 документов аддендума + ADR + план работ
- ✅ **Агенты:** `.claude/` + `.codex/` конфигурации, правила, суб-агенты
- ✅ **Deploy workflow:** 4 bash-скрипта
- ✅ **Зависимости:** все проверены, версии зафиксированы
- ⏳ **Backend код:** заглушки с `# TODO` (Stage 1–4 ещё не выполнены)
- ⏳ **Frontend код:** заглушки (Stage 5–9 ещё не выполнены)
- ⏳ **Тесты:** 0 / 230 (цель v1.0)

Полный план — `docs/AGENT_TASKS.md` и `MEMORY.md`.

---

## Работа с агентами

### Claude Opus 4.7 (Claude Code)

```bash
# Из корня проекта
claude
# Claude прочитает CLAUDE.md → AGENTS.md → MEMORY.md автоматически
```

Выполняет: backend, архитектуру, безопасность, `graph_engine`, `grader_service`, `backup_service`, code review.

### Codex GPT 5.5 (Codex CLI)

```bash
# Из корня проекта
codex
# Codex прочитает AGENTS.md через fallback filenames
```

Выполняет: frontend, React-компоненты, vitest-тесты, UI-scaffolding.

### Распределение задач

Подробно: `docs/AGENT_ROSTER.md` (компактно) или `docs/AGENT_TASKS.md` (детально).

---

## Деплой на изолированный сервер ВМедА

```bash
# На dev-машине
./scripts/verify.sh
./scripts/build-images.sh
./scripts/package-release.sh
# → dist/epicase-v1.1.0.tar.gz (~800 MB)

# Записать на флешку, перенести на сервер

# На сервере
tar -xzf epicase-v1.1.0.tar.gz
cd epicase-v1.1.0/
./deploy-on-server.sh
```

Подробно — `scripts/README.md`.

---

## Команды

```bash
# Backend
pytest server/tests/ -v          # все тесты
ruff check server/               # lint
alembic upgrade head             # миграции

# Frontend
cd client
npm install
npx vitest run                   # все тесты
npx tsc --noEmit                 # type check
npm run dev                      # dev server http://localhost:5173

# Infra
docker compose up -d             # старт
docker compose ps                # статус
docker compose logs -f server    # логи
docker compose down              # стоп (данные сохраняются)
# НИКОГДА: docker compose down -v  (удалит БД!)

# Скрипты
./scripts/verify.sh              # проверки перед коммитом
./scripts/build-images.sh        # сборка
./scripts/package-release.sh     # упаковка релиза
```

---

## Правила разработки

Из `AGENTS.md` (краткая сводка):

1. **Test first** — тест пишется ДО кода
2. **Never commit red** — все тесты зелёные или не коммитим
3. **Stage boundary commits** — коммит только на границе завершённого этапа
4. **Source of truth:** `PROJECT_DESIGN_EPICASE_v1.md` + `PROJECT_DESIGN_ADDENDUM_v1.1.md`
5. **No hardcoded colors** — только токены из `tokens.css`
6. **No answer leaks** — `correct_value`, `is_correct` не должны попадать в client-код
7. **No Opus 4.7 API breaking params** — не использовать `temperature`, `top_p`, `top_k`

Pre-commit hook (`scripts/verify.sh`) автоматически блокирует нарушения 5 и 6.

---

## Ссылки

- Дизайн-система: [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md)
- Базовый дизайн проекта: [`docs/PROJECT_DESIGN_EPICASE_v1.md`](docs/PROJECT_DESIGN_EPICASE_v1.md)
- Дополнения v1.1: [`docs/PROJECT_DESIGN_ADDENDUM_v1.1.md`](docs/PROJECT_DESIGN_ADDENDUM_v1.1.md)
- ADR (архитектурные решения): [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md)
- Кто что делает: [`docs/AGENT_ROSTER.md`](docs/AGENT_ROSTER.md)
- История версий: [`CHANGELOG.md`](CHANGELOG.md)

---

**Следующий шаг:** Claude Opus 4.7 приступает к Stage 1 — Auth + Users + Groups (TDD, ≥30 pytest-тестов, ~2 рабочих дня). См. `MEMORY.md § Next Action`.
