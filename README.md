# EpiCase

**Платформа интерактивных эпидемиологических кейсов** для подготовки врачей-эпидемиологов Военно-медицинской академии им. С.М. Кирова.

Преподаватель в браузере рисует ветвящийся граф эпидкейса (данные пациента → решение → форма документа → финал), студенты из своих браузеров в изолированной LAN проходят сценарий, сервер автоматически проверяет ответы и строит аналитику.

Версия: **1.0.0** · Дата: 2026-05-19 · Лицензия: внутреннее использование ВМедА

---

## Документация

| Документ | Кому |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | IT-специалист, первый запуск на сервере |
| [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) | Администратор системы |
| [`docs/TEACHER_GUIDE.md`](docs/TEACHER_GUIDE.md) | Преподаватель |
| [`docs/STUDENT_GUIDE.md`](docs/STUDENT_GUIDE.md) | Студент |
| [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) | Разработчик — ключевые архитектурные решения (ADR) |
| [`docs/SECURITY_AUDIT_v1.0.0.md`](docs/SECURITY_AUDIT_v1.0.0.md) | OWASP §B.2.3 — 13/13 pass |
| [`docs/UX_AUDIT_v1.0.md`](docs/UX_AUDIT_v1.0.md) | UX-аудит v1.0, WCAG AA |
| [`docs/PROJECT_DESIGN_EPICASE_v1.md`](docs/PROJECT_DESIGN_EPICASE_v1.md) | Базовое техническое задание |
| [`docs/PROJECT_DESIGN_ADDENDUM_v1.1.md`](docs/PROJECT_DESIGN_ADDENDUM_v1.1.md) | Дополнения и изменения v1.1 |
| [`CHANGELOG.md`](CHANGELOG.md) | История версий |

---

## Стек

| Слой | Технологии |
|---|---|
| Backend | FastAPI 0.115 · SQLAlchemy 2 · Alembic · PostgreSQL 16 · Pydantic 2 · bcrypt · python-jose (JWT) · APScheduler · reportlab · openpyxl |
| Frontend | React 19 · TypeScript 5.7 · @xyflow/react 12 · Zustand 5 · TanStack Query 5 · Tailwind CSS 4 · React Hook Form + Zod · Recharts · framer-motion |
| Инфраструктура | Docker Compose · Nginx · pg_dump/pg_restore |
| Тесты | pytest + httpx + testcontainers · vitest + @testing-library/react + MSW |

---

## Быстрый старт

### Требования
- Docker Desktop с Docker Compose plugin

### Запуск

```bash
# 1. Настроить секреты
cp .env.example .env
# Отредактировать .env: POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32)

# 2. Запустить
docker compose up -d

# 3. Применить миграции
docker exec <server-container> alembic upgrade head

# 4. Создать первого администратора
docker exec <server-container> python scripts/create_admin.py

# 5. Открыть в браузере
# http://localhost
```

Подробно — [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Структура репозитория

```
epicase/
├── README.md
├── CHANGELOG.md
├── CLAUDE.md                    ← инструкции для Claude Opus 4.7 (Claude Code)
├── AGENTS.md                    ← правила для AI-агентов
├── MEMORY.md                    ← память между сессиями агентов
├── docker-compose.yml
├── .env.example
│
├── design/                      ← дизайн-система
│   ├── DESIGN_SYSTEM.md
│   ├── EpiCase_Design_System.html
│   └── epicase-design-system.svg
│
├── docs/                        ← документация
│   ├── DEPLOY.md
│   ├── ADMIN_GUIDE.md
│   ├── TEACHER_GUIDE.md
│   ├── STUDENT_GUIDE.md
│   ├── ARCHITECTURE_DECISIONS.md
│   ├── SECURITY_AUDIT_v1.0.0.md
│   ├── UX_AUDIT_v1.0.md
│   ├── PROJECT_DESIGN_EPICASE_v1.md
│   ├── PROJECT_DESIGN_ADDENDUM_v1.1.md
│   └── archive/                 ← артефакты разработки (не для пользователей)
│
├── scripts/
│   ├── verify.sh
│   ├── build-images.sh
│   ├── package-release.sh
│   ├── deploy-on-server.sh
│   └── create_admin.py
│
├── nginx/nginx.conf
│
├── server/                      ← FastAPI backend
│   ├── models/
│   ├── schemas/
│   ├── routers/
│   ├── services/
│   ├── migrations/
│   └── tests/
│
└── client/                      ← React SPA
    └── src/
        ├── api/
        ├── stores/
        ├── components/
        │   ├── ui/
        │   ├── layout/
        │   ├── scenario/        ← React Flow редактор
        │   └── player/          ← Case Player
        └── pages/
            ├── auth/
            ├── student/
            ├── teacher/
            └── admin/
```

---

## Команды

```bash
# Инфраструктура
docker compose up -d
docker compose down
docker compose logs -f server

# Backend
pytest server/tests/ -v
ruff check server/
alembic upgrade head

# Frontend
cd client && npm run dev
cd client && npx vitest run
cd client && npx tsc --noEmit

# Релиз
./scripts/verify.sh
./scripts/build-images.sh
./scripts/package-release.sh    # → dist/epicase-v1.0.0.tar.gz
```

---

## Деплой на сервер ВМедА

```bash
./scripts/verify.sh
./scripts/build-images.sh
./scripts/package-release.sh
# Перенести dist/epicase-v1.0.0.tar.gz на флешку → на сервер
./deploy-on-server.sh
```

Подробно — [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Работа с AI-агентами

```bash
# Claude Opus 4.7 (backend, архитектура, безопасность)
claude   # читает CLAUDE.md → AGENTS.md → MEMORY.md

# Codex GPT 5.5 (frontend, React, тесты)
codex    # читает AGENTS.md
```
