# EpiCase — Платформа Интерактивных Эпидемиологических Кейсов

## Полная Проектная Документация v1.0 — ВЕБ-ПРИЛОЖЕНИЕ (LAN)

> Версия 1.0 | Дата: 2026-04-01 | Статус: Полная спецификация
> Заказчик: ВМедА им. С.М. Кирова, кафедра общей и военной эпидемиологии

---

## PROJECT_IDEA — Аналитический документ

> Раздел для AI-агента: извлекай параметры, связи и ограничения отсюда перед написанием кода.

**Проблема:** На кафедре эпидемиологии ВМедА им. С.М. Кирова существует прототип
интерактивного образовательного кейса (Java Swing, 2023), позволяющего обучаемым
проводить эпидемиологическое расследование вспышки гепатита А. Прототип жёстко
привязан к одному сценарию, не имеет конструктора, интерфейс устарел (JFrame/JButton),
отсутствуют: многопользовательский режим, автоматическая аналитика, конструктор
сценариев, заполнение формализованных документов. Для нового кейса нужно писать код.

**Решение:** Веб-приложение (React + FastAPI + PostgreSQL) для внутренней сети академии:
1. Преподаватель создаёт интерактивный кейс через визуальный граф-редактор (React Flow)
2. Сценарий — ветвящийся граф с «правильными» и «неправильными» путями
3. Студент проходит кейс в браузере: видит данные пациентов, назначает исследования, заполняет формализованные документы
4. При ошибке — не обрыв, а продолжение по «неправильному пути» с уведомлением в конце
5. Преподаватель видит аналитику: путь каждого студента по графу, время, ошибки, оценки
6. Администратор управляет пользователями, бэкапами, системой

**Аудитория:**
- Преподаватели (5–15 человек на кафедру): создание кейсов, назначение группам, аналитика
- Студенты/ординаторы (группы по 10–30 человек): прохождение кейсов, просмотр результатов
- Администратор (1–2 человека): управление системой, бэкапы, пользователи

**Архитектура:** Docker Compose на внутреннем сервере академии:
- FastAPI (Python) — REST API бэкенд
- React + TypeScript — SPA фронтенд
- PostgreSQL — база данных
- Nginx — reverse proxy, раздача статики

**⚠️ КРИТИЧНО: Сервер ИЗОЛИРОВАН от внешней сети (нет интернета).**
Это значит:
- Docker-образы собираются на ПК разработчика (с интернетом), затем переносятся на сервер
- Никакие `npm install`, `pip install`, `docker pull` на продакшн-сервере НЕ работают
- Context7 MCP используется ТОЛЬКО на этапе разработки (на ПК с интернетом)
- Все зависимости бандлятся ВНУТРЬ Docker-образов при сборке
- Доступ к порталу — только из внутренней сети ВМедА

**Ключевая предметная область — эпидемиологическое расследование:**
Врач-эпидемиолог работает на популяционном уровне (не с одним пациентом, а с коллективом).
Процесс: первичные данные пациентов → постановка предварительного эпидемиологического
диагноза → обследование объектов очага → окончательный диагноз → разработка СППМ →
оформление служебных документов. Кейс должен моделировать весь этот цикл.

**MVP-scope (обязательно реализовать):**

| Компонент | В MVP | Отложено (V2) |
|---|---|---|
| Типы узлов сценария | data, decision, form, text_input, final | calculation, image_annotation, timeline |
| Роли | student, teacher, admin | кастомные роли |
| Аналитика | путь по графу, время, оценка, слабые узлы | radar по типам, export PDF |
| Конструктор | React Flow граф-редактор | шаблоны сценариев, импорт/экспорт |
| Формы документов | экстренное извещение ф.23, направление на лабораторное исследование | все формы из СППМ |
| Аутентификация | login/logout, JWT | SSO, 2FA |
| Администратор | users CRUD, бэкапы | темы, статистика использования |

**Конкуренты:**

| Система | Что делает | Чего не хватает |
|---|---|---|
| Java-прототип (Кузин, 2023) | Один кейс по гепатиту А | Нет конструктора, устаревший UI, один сценарий |
| Moodle | LMS полного цикла | Тяжёлый, нет ветвящихся кейсов |
| iSpring | Тесты и SCORM | Облако, не LAN, дорого |
| Body Interact | Клинические симуляции | Только клинический подход, не эпидемиологический |

**Риски:**

| Риск | Вероятность | Митигация |
|---|---|---|
| Сеть LAN не настроена | Средняя | Docker + инструкция для IT-отдела |
| БД повреждена | Низкая | Ежедневный автобэкап PostgreSQL |
| Одновременные ответы 30 студентов | Средняя | PostgreSQL + пул соединений + UNIQUE constraint |
| Сложность граф-редактора | Высокая | React Flow берёт на себя рендер, мы только определяем типы узлов |

---

## CHANGELOG

| Версия | Дата | Что изменилось |
|---|---|---|
| v1.0 | 2026-04-01 | Полная спецификация: веб-архитектура, React + FastAPI + PostgreSQL |

---

## §1. СТЕК ЗАВИСИМОСТЕЙ

### 1.1 server/requirements.txt

```
# ── WEB FRAMEWORK ────────────────────────────────────────────────────────────
fastapi==0.115.5                # REST API фреймворк
uvicorn[standard]==0.32.1       # ASGI сервер

# ── DATABASE ─────────────────────────────────────────────────────────────────
SQLAlchemy==2.0.36              # ORM
alembic==1.14.0                 # Миграции схемы
psycopg2-binary==2.9.10         # PostgreSQL драйвер
asyncpg==0.30.0                 # Async PostgreSQL (опционально)

# ── AUTH ─────────────────────────────────────────────────────────────────────
bcrypt==4.2.1                   # Хэширование паролей (cost=12)
python-jose[cryptography]==3.3.0  # JWT: encode/decode токенов

# ── VALIDATION ───────────────────────────────────────────────────────────────
pydantic==2.9.2                 # Схемы запросов/ответов

# ── REPORTS ──────────────────────────────────────────────────────────────────
openpyxl==3.1.5                 # Excel (.xlsx) экспорт
Pillow==11.0.0                  # Изображения: resize, validate

# ── UTILITIES ────────────────────────────────────────────────────────────────
loguru==0.7.2                   # Логирование
python-multipart==0.0.12        # Загрузка файлов (FastAPI UploadFile)
APScheduler==3.10.4             # Планировщик фоновых задач (автобэкап)
```

### 1.2 client/package.json (ключевые зависимости)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "typescript": "^5.7.0",
    "@xyflow/react": "^12.4.0",
    "axios": "^1.7.0",
    "zustand": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "lucide-react": "^0.469.0",
    "react-hook-form": "^7.54.0",
    "zod": "^3.24.0",
    "@tanstack/react-query": "^5.62.0",
    "recharts": "^2.15.0",
    "framer-motion": "^11.15.0",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0",
    "vitest": "^2.1.0"
  }
}
```

### 1.3 Обоснование выбора

| Решение | Альтернатива | Почему выбрано |
|---|---|---|
| FastAPI | Django, Flask | Автодокументация Swagger, Pydantic, async-ready |
| PostgreSQL | SQLite | Многопользовательский доступ, JSONB для графов, надёжность |
| React + TypeScript | Vue, Angular | Экосистема React Flow, крупнейшее комьюнити, типизация |
| React Flow (@xyflow/react) | vis.js, D3 | Готовый drag-and-drop граф-редактор с кастомными узлами |
| Zustand | Redux, MobX | Минимальный boilerplate, хорошо типизируется |
| TanStack Query | SWR, вручную | Кэширование, инвалидация, retry — из коробки |
| Axios | fetch, ky | Interceptors для JWT refresh, отмена запросов |
| Tailwind CSS | CSS Modules, styled-components | Utility-first, быстрая стилизация, единообразие |
| Docker Compose | ручная установка | Один файл — вся инфраструктура, воспроизводимость |
| Nginx | Caddy, Traefik | Стандарт в ВМедА, обширная документация |

---

## §2. АРХИТЕКТУРА — ОБЗОР

```
Внутренняя сеть ВМедА (192.168.x.x или 10.x.x.x)

┌─────────────────────────────────────────────────────────────┐
│               СЕРВЕР (1 ПК / виртуальная машина)            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Docker Compose                                      │   │
│  │                                                      │   │
│  │  ┌────────────────────────┐  ┌────────────────────┐  │   │
│  │  │  Nginx :80             │  │  PostgreSQL :5432   │  │   │
│  │  │  ├─ /        → React   │  │  epicase_db         │  │   │
│  │  │  ├─ /api     → FastAPI │  │  (графы, результаты │  │   │
│  │  │  └─ /media   → static  │  │   пользователи)     │  │   │
│  │  └──────────┬─────────────┘  └────────┬───────────┘  │   │
│  │             │ proxy_pass :8000         │ TCP :5432    │   │
│  │  ┌──────────┴─────────────────────────┴───────────┐  │   │
│  │  │  FastAPI + Uvicorn :8000                       │  │   │
│  │  │  ├─ /api/auth      (login, refresh, logout)    │  │   │
│  │  │  ├─ /api/users     (CRUD пользователей)        │  │   │
│  │  │  ├─ /api/scenarios (CRUD сценариев/графов)     │  │   │
│  │  │  ├─ /api/attempts  (start, answer, finish)     │  │   │
│  │  │  ├─ /api/analytics (статистика, отчёты)        │  │   │
│  │  │  └─ /api/admin     (система, бэкапы)           │  │   │
│  │  │                                                │  │   │
│  │  │  SQLAlchemy ORM → PostgreSQL                   │  │   │
│  │  │  media/ (изображения кейсов)                   │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Запуск: docker compose up -d                               │
└─────────────────────────────────────────────────────────────┘
          │ HTTP (порт 80)
          │ Bearer JWT токены
          │
┌─────────┴────────────────────────────────────────────────────┐
│     КЛИЕНТЫ (N ПК: студенты + преподаватели)                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐   │
│  │  Chrome/Edge      │  │  Chrome/Edge      │  │  ...     │   │
│  │  React SPA        │  │  React SPA        │  │          │   │
│  │  Студент 1        │  │  Студент 2        │  │          │   │
│  └──────────────────┘  └──────────────────┘  └──────────┘   │
│                                                              │
│  Адрес: http://epicase.vmeda.local (или IP сервера)         │
└──────────────────────────────────────────────────────────────┘
```

**Правила архитектуры:**
- БД **только** на сервере. Клиент (браузер) не имеет доступа к PostgreSQL напрямую.
- Бизнес-логика (grader, scenario engine, analytics) **только** на сервере.
- Клиент хранит: JWT-токен (httpOnly cookie или localStorage), текущего пользователя.
- Все запросы к данным — HTTP через Axios. Никакого прямого SQL на клиенте.
- Фронтенд собирается в статику (`npm run build`) и раздаётся через Nginx.

---

## §3. СТРУКТУРА ПРОЕКТА

```
epicase/
│
├── docker-compose.yml              ← Вся инфраструктура
├── .env                            ← Секреты (не в git)
├── .env.example                    ← Шаблон секретов
├── AGENTS.md                       ← Правила для AI-агентов (§24)
├── MEMORY.md                       ← Память проекта между сессиями (§25)
├── .agent/                         ← Antigravity конфигурация
│   ├── config.json                 # Настройки агентов, hooks
│   ├── skills/                     # 30 скиллов (§22)
│   ├── commands/                   # Кастомные команды (§26)
│   │   ├── review.md               # /review — ревью кода
│   │   ├── test.md                 # /test — запуск всех тестов
│   │   └── status.md               # /status — прогресс проекта
│   └── mcp/
│       └── context7.json           # Context7 (только dev-машина!)
├── nginx/
│   └── nginx.conf                  ← Reverse proxy конфиг
│
├── server/                         ← FastAPI бэкенд
│   ├── main.py                     # uvicorn entry point
│   ├── config.py                   # Settings: DB_URL, JWT_SECRET, PORT
│   ├── database.py                 # engine, SessionLocal, Base
│   ├── dependencies.py             # get_db, get_current_user, require_role
│   ├── Dockerfile                  # Python 3.12 + requirements
│   ├── requirements.txt
│   │
│   ├── models/                     # SQLAlchemy ORM-модели
│   │   ├── __init__.py
│   │   ├── user.py                 # User, Role, Group
│   │   ├── scenario.py             # Scenario, ScenarioNode, ScenarioEdge
│   │   ├── node_content.py         # NodeData, NodeOption, FormField
│   │   ├── attempt.py              # Attempt, AttemptStep, AttemptFormAnswer
│   │   ├── media.py                # MediaFile
│   │   └── system.py               # SystemSetting, SystemLog
│   │
│   ├── schemas/                    # Pydantic-схемы (request/response)
│   │   ├── __init__.py
│   │   ├── auth.py                 # LoginRequest, TokenResponse
│   │   ├── user.py                 # UserCreate, UserUpdate, UserOut
│   │   ├── scenario.py             # ScenarioCreate, ScenarioOut, NodeOut, EdgeOut
│   │   ├── attempt.py              # AttemptStart, StepSubmit, AttemptOut
│   │   ├── analytics.py            # PathAnalysisOut, ScoreDistOut
│   │   └── common.py               # PaginatedResponse, ErrorResponse
│   │
│   ├── routers/                    # FastAPI роутеры
│   │   ├── __init__.py
│   │   ├── auth.py                 # /api/auth/*
│   │   ├── users.py                # /api/users/*
│   │   ├── groups.py               # /api/groups/*
│   │   ├── scenarios.py            # /api/scenarios/*
│   │   ├── nodes.py                # /api/nodes/*
│   │   ├── attempts.py             # /api/attempts/*
│   │   ├── analytics.py            # /api/analytics/*
│   │   ├── media.py                # /api/media/*
│   │   └── admin.py                # /api/admin/*
│   │
│   ├── services/                   # Бизнес-логика
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── user_service.py
│   │   ├── scenario_service.py     # CRUD + publish + validate graph
│   │   ├── graph_engine.py         # Движок исполнения: next_node, evaluate_choice
│   │   ├── grader_service.py       # Оценивание: формы, текстовый ввод, выбор
│   │   ├── attempt_service.py
│   │   ├── analytics_service.py
│   │   ├── media_service.py
│   │   └── backup_service.py       # pg_dump/pg_restore обёртки
│   │
│   ├── migrations/                 # Alembic
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 001_initial_schema.py
│   │       ├── 002_scenario_schema.py
│   │       └── 003_system_tables.py
│   │
│   ├── alembic.ini
│   ├── seed.py                     # Начальные данные: роли, дисциплины
│   └── data/                       # Runtime-данные
│       ├── media/                  # Загруженные файлы
│       │   ├── avatars/
│       │   ├── covers/
│       │   └── nodes/              # Изображения для узлов сценария
│       └── backups/                # Бэкапы PostgreSQL
│
├── client/                         ← React SPA
│   ├── Dockerfile                  # Node 22 + build → nginx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   │
│   ├── src/
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx                 # Router + AuthProvider + QueryProvider
│   │   │
│   │   ├── api/                    # HTTP-клиент
│   │   │   ├── client.ts           # Axios instance + interceptors (JWT refresh)
│   │   │   ├── auth.ts             # login(), refresh(), logout(), me()
│   │   │   ├── users.ts
│   │   │   ├── scenarios.ts
│   │   │   ├── attempts.ts
│   │   │   ├── analytics.ts
│   │   │   └── admin.ts
│   │   │
│   │   ├── stores/                 # Zustand
│   │   │   ├── authStore.ts        # user, tokens, login/logout actions
│   │   │   └── scenarioEditorStore.ts  # nodes, edges, selectedNode (React Flow state)
│   │   │
│   │   ├── hooks/                  # Custom React hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useScenarios.ts     # TanStack Query wrappers
│   │   │   ├── useAttempts.ts
│   │   │   └── useAnalytics.ts
│   │   │
│   │   ├── components/             # Переиспользуемые UI-компоненты
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.tsx   # Sidebar + TopBar + Content area
│   │   │   │   ├── Sidebar.tsx     # Навигация по роли
│   │   │   │   └── TopBar.tsx      # Аватар, имя, logout
│   │   │   ├── ui/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Toast.tsx       # Уведомления (react-hot-toast)
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   └── ConfirmDialog.tsx
│   │   │   ├── scenario/           # Компоненты конструктора
│   │   │   │   ├── ScenarioCanvas.tsx     # React Flow wrapper
│   │   │   │   ├── NodePalette.tsx        # Палитра типов узлов (drag source)
│   │   │   │   ├── NodeInspector.tsx      # Панель редактирования узла
│   │   │   │   ├── nodes/                 # Кастомные узлы React Flow
│   │   │   │   │   ├── DataNode.tsx       # Узел «Данные» (анамнез, результаты)
│   │   │   │   │   ├── DecisionNode.tsx   # Узел «Решение» (ветвление)
│   │   │   │   │   ├── FormNode.tsx       # Узел «Форма» (бланк документа)
│   │   │   │   │   ├── TextInputNode.tsx  # Узел «Текстовый ввод»
│   │   │   │   │   ├── FinalNode.tsx      # Узел «Финал» (результат)
│   │   │   │   │   └── StartNode.tsx      # Узел «Старт»
│   │   │   │   └── edges/
│   │   │   │       └── ChoiceEdge.tsx     # Ребро с меткой + цвет (correct/incorrect)
│   │   │   └── player/             # Компоненты плеера
│   │   │       ├── CasePlayer.tsx         # Основной контейнер прохождения
│   │   │       ├── DataView.tsx           # Отображение данных пациента
│   │   │       ├── DecisionView.tsx       # Выбор варианта действия
│   │   │       ├── FormView.tsx           # Заполнение бланка
│   │   │       ├── TextInputView.tsx      # Свободный текстовый ответ
│   │   │       ├── FinalView.tsx          # Итоговый результат
│   │   │       ├── ProgressBar.tsx        # Прогресс прохождения
│   │   │       └── PathVisualization.tsx   # Визуализация пути по графу (итоговая)
│   │   │
│   │   ├── pages/                  # Страницы (роутинг)
│   │   │   ├── auth/
│   │   │   │   └── LoginPage.tsx
│   │   │   ├── student/
│   │   │   │   ├── StudentDashboard.tsx    # S-1: Главная студента
│   │   │   │   ├── MyCases.tsx             # S-2: Назначенные кейсы
│   │   │   │   ├── CasePlayerPage.tsx      # S-3: Прохождение кейса
│   │   │   │   ├── CaseResultPage.tsx      # S-4: Результат прохождения
│   │   │   │   └── MyResults.tsx           # S-5: История результатов
│   │   │   ├── teacher/
│   │   │   │   ├── TeacherDashboard.tsx    # T-1: Главная преподавателя
│   │   │   │   ├── MyScenarios.tsx         # T-2: Мои сценарии
│   │   │   │   ├── ScenarioEditorPage.tsx  # T-3: Конструктор (React Flow)
│   │   │   │   ├── ScenarioPreview.tsx     # T-4: Предпросмотр (пройти как студент)
│   │   │   │   ├── AnalyticsPage.tsx       # T-5: Аналитика по кейсу
│   │   │   │   └── GroupsPage.tsx          # T-6: Управление группами
│   │   │   └── admin/
│   │   │       ├── AdminDashboard.tsx      # A-1: Главная администратора
│   │   │       ├── UsersPage.tsx           # A-2: Управление пользователями
│   │   │       ├── SystemPage.tsx          # A-3: Система, бэкапы, логи
│   │   │       └── SettingsPage.tsx        # A-4: Настройки
│   │   │
│   │   ├── types/                  # TypeScript типы
│   │   │   ├── user.ts
│   │   │   ├── scenario.ts         # Scenario, ScenarioNode, ScenarioEdge
│   │   │   ├── attempt.ts
│   │   │   └── analytics.ts
│   │   │
│   │   └── utils/
│   │       ├── constants.ts        # NODE_TYPES, EDGE_TYPES, ROLES
│   │       ├── validators.ts       # Zod schemas
│   │       └── formatters.ts       # Даты, баллы, длительность
│   │
│   └── public/
│       └── favicon.svg
│
└── docs/
    ├── PROJECT_DESIGN_v1.md        ← ЭТОТ ФАЙЛ
    └── api-examples/               # Примеры запросов (Postman/httpie)
```

---

## §4. КОНФИГУРАЦИЯ

### 4.1 docker-compose.yml

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-epicase}
      POSTGRES_USER: ${POSTGRES_USER:-epicase}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U epicase"]
      interval: 5s
      timeout: 3s
      retries: 5

  server:
    build: ./server
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-epicase}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-epicase}
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env (min 32 chars)}
      MEDIA_DIR: /app/data/media
      BACKUP_DIR: /app/data/backups
    volumes:
      - server_media:/app/data/media
      - server_backups:/app/data/backups
    ports:
      - "8000:8000"

  client:
    build: ./client
    restart: unless-stopped
    depends_on:
      - server
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  pgdata:
  server_media:
  server_backups:
```

### 4.2 .env.example

```bash
# PostgreSQL
POSTGRES_DB=epicase
POSTGRES_USER=epicase
POSTGRES_PASSWORD=change-me-strong-password-here

# JWT
JWT_SECRET=change-me-use-openssl-rand-hex-32-here

# Server
APP_VERSION=1.0.0
FIRST_RUN=true
```

### 4.3 server/config.py

```python
import os
from pathlib import Path

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://epicase:epicase@localhost:5432/epicase")

# JWT
JWT_SECRET    = os.getenv("JWT_SECRET", "change-me-in-production-use-32-chars-min")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS  = 8     # рабочий день
REFRESH_TOKEN_EXPIRE_DAYS  = 7     # неделя

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Media
MEDIA_DIR  = Path(os.getenv("MEDIA_DIR", "data/media"))
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "data/backups"))

MEDIA_LIMITS = {
    "avatar":     {"max_mb": 2,  "formats": ["JPEG", "PNG", "WEBP"]},
    "cover":      {"max_mb": 5,  "formats": ["JPEG", "PNG", "WEBP"]},
    "node_image": {"max_mb": 10, "formats": ["JPEG", "PNG", "WEBP", "GIF"]},
}

# Auth
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES    = 30

# Version
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

def init_dirs():
    for d in [MEDIA_DIR, BACKUP_DIR,
              MEDIA_DIR / "avatars", MEDIA_DIR / "covers", MEDIA_DIR / "nodes"]:
        d.mkdir(parents=True, exist_ok=True)
```

### 4.4 nginx/nginx.conf

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 20M;

    # React SPA
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://server:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    # Media files
    location /media/ {
        alias /app/data/media/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## §5. СЕРВЕР — FastAPI

### 5.1 server/main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from server.config import init_dirs, MEDIA_DIR
from server.database import run_migrations
from server.routers import auth, users, groups, scenarios, nodes, attempts, analytics, media, admin

init_dirs()
run_migrations()

app = FastAPI(
    title="EpiCase API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # LAN: разрешить все (только локальная сеть)
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["users"])
app.include_router(groups.router,    prefix="/api/groups",    tags=["groups"])
app.include_router(scenarios.router, prefix="/api/scenarios", tags=["scenarios"])
app.include_router(nodes.router,     prefix="/api/nodes",     tags=["nodes"])
app.include_router(attempts.router,  prefix="/api/attempts",  tags=["attempts"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(media.router,     prefix="/api/media",     tags=["media"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["admin"])

@app.get("/api/ping")
def ping():
    return {"status": "ok", "version": "1.0.0"}
```

### 5.2 server/database.py

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from server.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def run_migrations():
    from alembic.config import Config
    from alembic import command
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")
```

### 5.3 server/dependencies.py

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from server.database import get_db
from server.config import JWT_SECRET, JWT_ALGORITHM
from server.models.user import User

bearer = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired or invalid")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or blocked")
    return user

def require_role(*roles: str):
    def check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.name not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return current_user
    return check
```

---

## §6. API ЭНДПОИНТЫ — ПОЛНЫЙ СПИСОК

> Каждый эндпоинт: метод + путь + тело запроса + тело ответа + коды ошибок.
> Агент реализует без уточнений.

### 6.0 Стандартный формат ошибок

```json
{ "detail": "Описание ошибки на русском" }

// 400 — невалидные данные
// 401 — не авторизован / токен истёк
// 403 — недостаточно прав
// 404 — ресурс не найден
// 409 — конфликт (дубликат, активная попытка уже есть)
// 422 — бизнес-логика нарушена
// 500 — внутренняя ошибка
```

### 6.1 Аутентификация `/api/auth`

```
POST /api/auth/login
Тело:    {"username": "ivanov.i", "password": "Secure#Pass9"}
Ответ 200: {"access_token": "eyJ...", "refresh_token": "eyJ...",
             "token_type": "bearer", "user": UserOut}
Ошибки:  401 "Неверный логин или пароль"
         403 "Аккаунт заблокирован до {locked_until}"

POST /api/auth/refresh
Тело:    {"refresh_token": "eyJ..."}
Ответ 200: {"access_token": "eyJ...", "token_type": "bearer"}
Ошибки:  401 "Refresh token недействителен или истёк"

POST /api/auth/logout
Заголовок: Authorization: Bearer {access_token}
Ответ 200: {"status": "ok"}

GET /api/auth/me
Ответ 200: UserOut
Ошибки:  401 "Токен недействителен"
```

### 6.2 Пользователи `/api/users`

```
GET /api/users/?role=student&search=иванов&page=1&per_page=20
Доступ: Admin (все), Teacher (только студенты из привязанных групп)
Ответ 200: {"items": [UserOut], "total": 47, "page": 1, "pages": 3}

POST /api/users/
Доступ: Admin ТОЛЬКО
Тело:    {"username": "ivanov.i", "password": "...", "full_name": "Иванов И.И.",
          "role_id": 1, "group_id": 2}
Ответ 201: UserOut
Ошибки:  409 "Пользователь с таким логином уже существует"
         403 "Только администратор может создавать пользователей"

POST /api/users/bulk
Доступ: Admin ТОЛЬКО
Тело:    {"users": [{"username": "...", "password": "...", "full_name": "...",
                      "role_id": 1, "group_id": 2}, ...]}
Ответ 201: {"created": 15, "errors": []}
Примечание: Массовое создание студентов — Admin загружает список

PATCH /api/users/{id}
Доступ: Admin (любые поля), сам пользователь (только full_name, avatar)
Тело:    {"full_name": "...", "group_id": 3}
Ответ 200: UserOut

POST /api/users/{id}/toggle-active
Доступ: Admin ТОЛЬКО
Ответ 200: {"status": "locked"|"unlocked"}
Ошибки:  403 "Нельзя заблокировать самого себя"

POST /api/users/{id}/reset-password
Доступ: Admin ТОЛЬКО
Тело:    {"new_password": "..."}
Ответ 200: {"status": "ok"}

POST /api/users/me/change-password
Доступ: любой авторизованный
Тело:    {"old_password": "...", "new_password": "..."}
Ответ 200: {"status": "ok"}
Ошибки:  400 "Неверный текущий пароль"
```

### 6.3 Группы `/api/groups`

```
GET /api/groups/
Доступ: Admin (все), Teacher (только привязанные через teacher_groups)
Ответ 200: [GroupOut]

POST /api/groups/
Доступ: Admin ТОЛЬКО
Тело:    {"name": "Группа №4 (воен.)", "description": "6 курс, военная эпидемиология"}
Ответ 201: GroupOut
Ошибки:  403 "Только администратор может создавать группы"

POST /api/groups/{id}/members
Доступ: Admin ТОЛЬКО
Тело:    {"user_id": 15}
Ответ 200: {"status": "ok"}
Ошибки:  409 "Пользователь уже в группе"
         422 "Пользователь не является студентом"

DELETE /api/groups/{id}/members/{user_id}
Доступ: Admin ТОЛЬКО
Ответ 200: {"status": "removed"}

POST /api/groups/{id}/assign-teacher
Доступ: Admin ТОЛЬКО
Тело:    {"teacher_id": 5}
Ответ 200: {"status": "ok"}
Логика:  Добавляет запись в teacher_groups. Преподаватель получает доступ к группе.
Ошибки:  409 "Преподаватель уже привязан к этой группе"
         422 "Пользователь не является преподавателем"

DELETE /api/groups/{id}/teachers/{teacher_id}
Доступ: Admin ТОЛЬКО
Ответ 200: {"status": "removed"}
```

### 6.4 Сценарии `/api/scenarios`

```
GET /api/scenarios/
Параметры:  ?author=me&status=draft,published
Для студента: только published + назначенные его группе
Для учителя: свои + все published
Ответ 200: [ScenarioListOut]  (без полного графа)

GET /api/scenarios/{id}
Ответ 200: ScenarioFullOut {
    id, title, description, status, author, disease_category,
    cover_url, time_limit_min, max_attempts, passing_score,
    nodes: [NodeOut],
    edges: [EdgeOut],
    created_at, updated_at, published_at
}
Для студента: nodes без correct_value, edges без is_correct
Ошибки:  403 "Сценарий не назначен вашей группе"
         404 "Сценарий не найден"

POST /api/scenarios/
Доступ: Teacher, Admin
Тело:    {"title": "Гепатит А", "description": "...",
          "disease_category": "hepatitis", "topic_id": 1}
Ответ 201: ScenarioFullOut

PUT /api/scenarios/{id}/graph
Доступ: Teacher (автор), Admin
Тело:    {
    "nodes": [{"id": "node_1", "type": "data", "position": {"x": 100, "y": 200},
               "data": {"title": "Анамнез", "content": "..."}}],
    "edges": [{"id": "edge_1", "source": "node_1", "target": "node_2",
               "data": {"label": "Назначить анализ", "is_correct": true}}]
}
Ответ 200: ScenarioFullOut
Примечание: Полная замена графа (PUT, не PATCH). React Flow отдаёт весь граф целиком.

POST /api/scenarios/{id}/publish
Ответ 200: {"status": "published"}
Ошибки:  422 "Граф невалиден: нет узла START"
         422 "Граф невалиден: нет узла FINAL"
         422 "Граф невалиден: есть узлы без исходящих рёбер (кроме FINAL)"
         422 "Граф невалиден: есть недостижимые узлы"

POST /api/scenarios/{id}/unpublish
Ответ 200: {"status": "draft"}
Ошибки:  409 "Есть активные попытки прохождения"

POST /api/scenarios/{id}/assign
Тело:    {"group_id": 2, "deadline": "2026-06-01T23:59:00"}
Ответ 200: {"status": "assigned"}
Ошибки:  422 "Сценарий не опубликован"
         409 "Сценарий уже назначен этой группе"

POST /api/scenarios/{id}/duplicate
Доступ: Teacher
Ответ 201: ScenarioFullOut (новый сценарий, статус draft, тот же граф)
```

### 6.5 Узлы `/api/nodes` (вспомогательный CRUD)

```
PATCH /api/nodes/{id}
Тело:    {"data": {"title": "...", "content": "...", "options": [...]}}
Ответ 200: NodeOut

Примечание: Основное редактирование узлов происходит через
PUT /api/scenarios/{id}/graph — полная замена графа.
PATCH /api/nodes/{id} используется для обновления содержимого
отдельного узла (например, текст анамнеза) без пересохранения всего графа.
```

### 6.6 Попытки `/api/attempts`

```
POST /api/attempts/start
Тело:    {"scenario_id": 3}
Ответ 201: {
    "attempt_id": 15,
    "attempt_num": 1,
    "current_node": NodeOut,     # стартовый узел
    "started_at": "2026-04-01T10:00:00"
}
Ошибки:  409 "У вас уже есть активная попытка по этому сценарию"
         422 "Превышен лимит попыток ({max_attempts})"
         403 "Сценарий не назначен вашей группе"

POST /api/attempts/{id}/step
Тело:    {
    "node_id": "node_5",
    "action": "choose_option",
    "answer_data": {"selected_option_id": "opt_2"}
}
или:
{
    "node_id": "node_7",
    "action": "submit_form",
    "answer_data": {
        "fields": {"diagnosis": "Гепатит А", "date": "2026-03-15", "signature": "Иванов И.И."}
    }
}
или:
{
    "node_id": "node_9",
    "action": "submit_text",
    "answer_data": {"text": "По результатам расследования установлено..."}
}
Ответ 200: {
    "step_result": {
        "score": 8.0,
        "max_score": 10.0,
        "is_correct": true|false|null,
        "feedback": "Правильно! Anti-HAV IgM подтверждает диагноз."
    },
    "next_node": NodeOut|null,       # null если это был финальный узел
    "path_so_far": ["node_1", "node_3", "node_5"],
    "attempt_status": "in_progress"|"completed"
}
Ошибки:  400 "Недопустимый переход от node_5 к node_99"
         404 "Попытка не найдена или уже завершена"

POST /api/attempts/{id}/finish
Ответ 200: AttemptResultOut {
    "attempt_id": 15,
    "total_score": 75.5,
    "max_score": 100.0,
    "score_pct": 75.5,
    "passed": true,
    "path": ["node_1", "node_3", "node_5", "node_8", "node_10"],
    "steps": [StepResultOut],    # детальные результаты каждого шага
    "duration_sec": 1847,
    "finished_at": "2026-04-01T10:30:47"
}

POST /api/attempts/{id}/abandon
Ответ 200: {"status": "abandoned"}

GET /api/attempts/my?scenario_id=3
Доступ: Student
Ответ 200: [AttemptSummaryOut]   # все попытки студента по сценарию

GET /api/attempts/{id}
Доступ: Student (свои), Teacher (по своим сценариям), Admin
Ответ 200: AttemptResultOut
```

### 6.7 Аналитика `/api/analytics`

```
GET /api/analytics/student/dashboard
Доступ: Student
Ответ 200: {
    "total_scenarios": 5,
    "completed_scenarios": 3,
    "avg_score": 78.5,
    "best_score": 92.0,
    "total_time_hours": 12.5,
    "recent_attempts": [AttemptSummaryOut]
}

GET /api/analytics/teacher/scenario-stats?scenario_id=5&group_id=2
Доступ: Teacher
Ответ 200: {
    "total_students": 25,
    "completed": 20,
    "avg_score": 72.3,
    "score_distribution": {"bins": [...], "counts": [...]},
    "path_analysis": {
        "correct_path_count": 14,
        "incorrect_path_count": 6,
        "most_common_wrong_node": {"node_id": "node_5", "title": "Мазок из зева", "count": 4}
    },
    "weak_nodes": [{"node_id": "...", "title": "...", "avg_score_pct": 32.5}],
    "student_ranking": [{"user_id": 15, "full_name": "...", "score": 91.0, "path": [...]}]
}

GET /api/analytics/teacher/path-heatmap?scenario_id=5&group_id=2
Доступ: Teacher
Ответ 200: {
    "nodes": [{"id": "...", "title": "...", "visit_count": 20, "avg_score": 75.0}],
    "edges": [{"source": "...", "target": "...", "traverse_count": 18, "is_correct": true}]
}
Примечание: Данные для визуализации на графе — какие узлы/рёбра самые популярные

GET /api/analytics/admin/stats
Доступ: Admin
Ответ 200: {
    "users_total": 52, "students": 45, "teachers": 6, "admins": 1,
    "scenarios_total": 18, "published_scenarios": 12,
    "attempts_today": 34,
    "db_size_mb": 45.2
}
```

### 6.8 Администрирование `/api/admin`

```
GET /api/admin/sysinfo
Доступ: Admin
Ответ 200: {
    "db_size_mb": 45.2,
    "last_backup_age": "3 ч назад",
    "version": "1.0.0",
    "python_version": "3.12.3",
    "uptime_hours": 72
}

POST /api/admin/backup
Доступ: Admin
Ответ 201: {"filename": "backup_20260401_120000.sql.gz", "size_mb": 12.4}
Логика: pg_dump → gzip → сохранить в BACKUP_DIR

GET /api/admin/backups
Доступ: Admin
Ответ 200: [{"filename": "...", "size_mb": 12.4, "created_at": "...", "age": "2 ч назад"}]

POST /api/admin/backups/{filename}/restore
Доступ: Admin
Ответ 202: {"status": "started"}
Логика: pg_restore из файла

DELETE /api/admin/backups/{filename}
Доступ: Admin
Ответ 200: {"status": "deleted"}

GET /api/admin/logs?level=WARNING&page=1&per_page=50
Доступ: Admin
Ответ 200: {"items": [SystemLogOut], "total": 234}

PATCH /api/admin/settings
Тело:    {"institution_name": "ВМА им. Кирова", "idle_timeout_min": 20}
Доступ: Admin
Ответ 200: обновлённые настройки
```

---

## §7. АУТЕНТИФИКАЦИЯ — JWT FLOW

```
Браузер                                   Сервер
  │                                          │
  │  POST /api/auth/login                    │
  │  {username, password}  ─────────────────►│
  │                                          │  bcrypt.checkpw()
  │                                          │  Создать access_token (8ч)
  │                                          │  Создать refresh_token (7дн)
  │  {access_token, refresh_token, user} ◄───│
  │                                          │
  │  Сохранить в localStorage/Zustand        │
  │                                          │
  │  GET /api/scenarios (Bearer: access)     │
  │  ─────────────────────────────────────►  │
  │  {scenarios: [...]}  ◄────────────────── │
  │                                          │
  │  ... через 8 часов ...                   │
  │                                          │
  │  GET /api/scenarios → 401 Unauthorized   │
  │  ─────────────────────────────────────►  │
  │                                          │
  │  Axios interceptor: POST /api/auth/refresh │
  │  {refresh_token}  ─────────────────────► │
  │  {access_token}  ◄────────────────────── │
  │                                          │
  │  Повторить исходный запрос автоматически │
```

### 7.1 Axios interceptor на клиенте

```typescript
// client/src/api/client.ts
import axios from "axios";
import { useAuthStore } from "../stores/authStore";

const api = axios.create({ baseURL: "/api" });

// Добавляем токен к каждому запросу
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Автообновление при 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post("/api/auth/refresh", {
          refresh_token: refreshToken,
        });
        useAuthStore.getState().setAccessToken(data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## §8. БАЗА ДАННЫХ — ПОЛНАЯ СХЕМА

> БД: PostgreSQL 16. Доступ только через сервер. Клиент не видит БД.

### 8.1 Все таблицы

```sql
-- ═══════════════════════════════════════════════════════════════
-- ПОЛЬЗОВАТЕЛИ И ДОСТУП
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE roles (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(50) NOT NULL UNIQUE,       -- student, teacher, admin
    display_name VARCHAR(100) NOT NULL
);

CREATE TABLE groups (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    teacher_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    username       VARCHAR(50) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    full_name      VARCHAR(200) NOT NULL,
    role_id        INTEGER NOT NULL REFERENCES roles(id),
    group_id       INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    avatar_path    VARCHAR(500),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_role     ON users(role_id);
CREATE INDEX idx_users_group    ON users(group_id);
CREATE INDEX idx_users_username ON users(username);

-- ═══════════════════════════════════════════════════════════════
-- УЧЕБНЫЙ КОНТЕНТ
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE disciplines (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE topics (
    id            SERIAL PRIMARY KEY,
    discipline_id INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    name          VARCHAR(200) NOT NULL,
    order_index   INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════
-- СЦЕНАРИИ (ГРАФЫ)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE scenarios (
    id               SERIAL PRIMARY KEY,
    topic_id         INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    author_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title            VARCHAR(300) NOT NULL,
    description      TEXT,
    disease_category VARCHAR(100),          -- hepatitis, cholera, ari, etc.
    cover_path       VARCHAR(500),
    status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'archived')),
    time_limit_min   INTEGER,              -- NULL = без ограничения
    max_attempts     INTEGER,              -- NULL = без ограничения
    passing_score    INTEGER NOT NULL DEFAULT 60,
    settings         JSONB NOT NULL DEFAULT '{}',
    version          INTEGER NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at     TIMESTAMPTZ
);
CREATE INDEX idx_scenarios_author ON scenarios(author_id);
CREATE INDEX idx_scenarios_status ON scenarios(status);

CREATE TABLE scenario_nodes (
    id          VARCHAR(50) NOT NULL,          -- React Flow node ID (e.g. "node_1")
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    node_type   VARCHAR(30) NOT NULL
                CHECK (node_type IN ('start', 'data', 'decision', 'form',
                                     'text_input', 'final')),
    title       VARCHAR(300) NOT NULL,
    content     TEXT,                           -- Markdown/HTML контент узла
    position_x  REAL NOT NULL DEFAULT 0,
    position_y  REAL NOT NULL DEFAULT 0,
    node_data   JSONB NOT NULL DEFAULT '{}',   -- Тип-специфичные данные (см. §9)
    color_hex   VARCHAR(7),
    PRIMARY KEY (id, scenario_id)
);
CREATE INDEX idx_nodes_scenario ON scenario_nodes(scenario_id);

CREATE TABLE scenario_edges (
    id          VARCHAR(50) NOT NULL,          -- React Flow edge ID
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    source_id   VARCHAR(50) NOT NULL,          -- from node
    target_id   VARCHAR(50) NOT NULL,          -- to node
    label       VARCHAR(200),                  -- текст на стрелке ("Назначить анализ")
    is_correct  BOOLEAN NOT NULL DEFAULT TRUE, -- правильный путь?
    score_delta REAL NOT NULL DEFAULT 0.0,     -- баллы за этот переход
    condition   JSONB,                         -- условие перехода (для auto-edges)
    PRIMARY KEY (id, scenario_id)
);
CREATE INDEX idx_edges_scenario ON scenario_edges(scenario_id);

-- Назначение сценариев группам
CREATE TABLE scenario_groups (
    scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline    TIMESTAMPTZ,
    PRIMARY KEY (scenario_id, group_id)
);

-- Привязка преподавателей к группам (Admin назначает)
CREATE TABLE teacher_groups (
    teacher_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (teacher_id, group_id)
);
CREATE INDEX idx_teacher_groups_teacher ON teacher_groups(teacher_id);
CREATE INDEX idx_teacher_groups_group ON teacher_groups(group_id);

-- ═══════════════════════════════════════════════════════════════
-- ФОРМЫ ДОКУМЕНТОВ (шаблоны полей для узлов типа 'form')
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE form_templates (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,         -- "Экстренное извещение ф.23"
    description  TEXT,
    template_key VARCHAR(50) UNIQUE             -- "form_23", "lab_direction"
);

CREATE TABLE form_template_fields (
    id           SERIAL PRIMARY KEY,
    template_id  INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    field_key    VARCHAR(100) NOT NULL,          -- "diagnosis", "patient_name"
    field_label  VARCHAR(200) NOT NULL,          -- "Диагноз"
    field_type   VARCHAR(30) NOT NULL DEFAULT 'text',
                 -- text, textarea, select, date, number, checkbox
    options_json JSONB,                          -- для select: ["Вариант1", "Вариант2"]
    is_required  BOOLEAN NOT NULL DEFAULT TRUE,
    order_index  INTEGER NOT NULL DEFAULT 0,
    score_value  REAL NOT NULL DEFAULT 1.0,     -- баллы за правильное заполнение
    validation_regex VARCHAR(200)                -- паттерн валидации
);

-- ═══════════════════════════════════════════════════════════════
-- ПОПЫТКИ СТУДЕНТОВ
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE attempts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_id     INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    attempt_num     INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    total_score     REAL NOT NULL DEFAULT 0.0,
    max_score       REAL NOT NULL DEFAULT 0.0,
    current_node_id VARCHAR(50),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    duration_sec    INTEGER
);
CREATE INDEX idx_attempts_user     ON attempts(user_id);
CREATE INDEX idx_attempts_scenario ON attempts(scenario_id);
CREATE INDEX idx_attempts_status   ON attempts(status);
CREATE UNIQUE INDEX idx_attempts_active
    ON attempts(user_id, scenario_id) WHERE status = 'in_progress';

CREATE TABLE attempt_steps (
    id             SERIAL PRIMARY KEY,
    attempt_id     INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    node_id        VARCHAR(50) NOT NULL,
    edge_id        VARCHAR(50),                 -- через какое ребро пришли
    action         VARCHAR(50) NOT NULL,        -- choose_option, submit_form, submit_text, view_data
    answer_data    JSONB NOT NULL DEFAULT '{}',
    score_received REAL NOT NULL DEFAULT 0.0,
    max_score      REAL NOT NULL DEFAULT 0.0,
    is_correct     BOOLEAN,
    feedback       TEXT,
    time_spent_sec INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_steps_attempt ON attempt_steps(attempt_id);

-- ═══════════════════════════════════════════════════════════════
-- МЕДИА И СИСТЕМНЫЕ
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE media_files (
    id         SERIAL PRIMARY KEY,
    filename   VARCHAR(500) NOT NULL,
    path       VARCHAR(500) NOT NULL,
    mime_type  VARCHAR(100) NOT NULL,
    file_size  INTEGER NOT NULL,
    media_type VARCHAR(30) NOT NULL,    -- avatar, cover, node_image
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_settings (
    key   VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE system_logs (
    id        SERIAL PRIMARY KEY,
    level     VARCHAR(20) NOT NULL,
    message   TEXT NOT NULL,
    user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    data      JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_logs_level ON system_logs(level);
CREATE INDEX idx_logs_date  ON system_logs(created_at);
```

---

## §9. ТИПЫ УЗЛОВ СЦЕНАРИЯ — СПЕЦИФИКАЦИЯ node_data

> Каждый тип узла хранит свои данные в поле `node_data` (JSONB) таблицы `scenario_nodes`.
> Агент должен реализовать кастомный React Flow node и серверную валидацию для каждого типа.

### 9.1 start — Стартовый узел

```json
{
  "description": "Начало кейса. Вводная информация."
}
```
Поведение: Автоматически отображается при старте попытки. Один на сценарий.

### 9.2 data — Узел «Данные»

```json
{
  "subtitle": "Клинический и эпидемиологический анамнез",
  "content_html": "<p>Сержант Михайлов С.Г., 2 МСБ, обратился...</p>",
  "attachments": [
    {"type": "image", "url": "/media/nodes/patient_1_photo.jpg", "caption": "Фото пациента"},
    {"type": "table", "data": {"headers": ["Показатель", "Значение", "Норма"],
                                "rows": [["АЛТ", "4.3", "0.1-0.68"]]}}
  ],
  "auto_advance": false
}
```
Поведение: Отображает информацию. Студент читает и нажимает «Далее».
Оценивание: Нет (информационный узел).

### 9.3 decision — Узел «Решение» (ветвление)

```json
{
  "question": "Какое исследование необходимо назначить пациенту?",
  "options": [
    {"id": "opt_1", "text": "Определение anti-HAV IgM в сыворотке крови",
     "feedback": "Правильно! Это маркер острого гепатита А."},
    {"id": "opt_2", "text": "Мазок из зева на микрофлору",
     "feedback": "Этот анализ не позволит выявить гепатит А."},
    {"id": "opt_3", "text": "Общий анализ крови",
     "feedback": "ОАК покажет общую картину, но не подтвердит диагноз."}
  ],
  "allow_multiple": false,
  "max_score": 10.0
}
```
Поведение: Студент выбирает вариант. Каждый вариант — исходящее ребро, ведущее к разному узлу. Правильность определяется через `is_correct` на ребре.
Оценивание: Выбран правильный вариант → max_score, неправильный → 0 (или partial_credit).

### 9.4 form — Узел «Форма» (заполнение документа)

```json
{
  "form_title": "Экстренное извещение (форма №23)",
  "form_template_id": 1,
  "fields": [
    {"key": "diagnosis", "label": "Диагноз", "type": "text",
     "correct_value": "Острый вирусный гепатит А", "score": 3.0},
    {"key": "date_onset", "label": "Дата заболевания", "type": "date",
     "correct_value": "2026-03-15", "score": 2.0},
    {"key": "hospitalized", "label": "Госпитализирован", "type": "select",
     "options": ["Да", "Нет"], "correct_value": "Да", "score": 1.0},
    {"key": "lab_confirmed", "label": "Подтверждение лабораторное", "type": "checkbox",
     "correct_value": true, "score": 2.0},
    {"key": "epidemiologist_name", "label": "ФИО эпидемиолога", "type": "text",
     "correct_value": null, "score": 1.0,
     "validation_regex": "^[А-ЯЁ][а-яё]+ [А-ЯЁ]\\.[А-ЯЁ]\\.$"}
  ],
  "max_score": 9.0
}
```
Поведение: Студент заполняет формализованный бланк. Проверка — по полям.
Оценивание: Сумма score за правильно заполненные поля.

### 9.5 text_input — Узел «Текстовый ввод»

```json
{
  "prompt": "Сформулируйте предварительный эпидемиологический диагноз.",
  "keywords": [
    {"word": "гепатит", "synonyms": ["hepatitis", "ВГА"], "score": 3.0},
    {"word": "вспышка", "synonyms": ["эпидемическая заболеваемость", "групповая заболеваемость"], "score": 3.0},
    {"word": "водный", "synonyms": ["водный путь передачи", "через воду"], "score": 2.0},
    {"word": "фекально-оральный", "synonyms": ["фекально оральный"], "score": 2.0}
  ],
  "max_score": 10.0,
  "min_length": 50
}
```
Поведение: Студент пишет текст. Программа проверяет наличие ключевых слов.
Оценивание: Сумма score за найденные ключевые слова (с учётом синонимов). Case-insensitive.

### 9.6 final — Финальный узел

```json
{
  "result_type": "correct",          // "correct" | "incorrect" | "partial"
  "title": "Кейс пройден верно!",
  "summary": "Вы правильно установили эпидемиологический диагноз...",
  "show_correct_path": true,
  "show_score_breakdown": true
}
```
Поведение: Завершает попытку. Показывает итоговый результат.

---

## §10. ДВИЖОК ИСПОЛНЕНИЯ СЦЕНАРИЯ (graph_engine)

```python
# server/services/graph_engine.py

class GraphEngine:
    """
    Движок исполнения ветвящегося сценария.
    Отвечает за навигацию по графу и определение следующего узла.
    """

    def get_start_node(self, scenario_id: int) -> ScenarioNode:
        """Находит узел типа 'start' в сценарии."""

    def get_next_node(self, scenario_id: int, current_node_id: str,
                      selected_edge_id: str) -> ScenarioNode | None:
        """
        Определяет следующий узел по выбранному ребру.
        Для decision-узлов: edge_id определяется выбранным вариантом.
        Для data/form/text_input: единственное исходящее ребро.
        Для final: возвращает None (конец).
        """

    def validate_transition(self, scenario_id: int, from_node: str,
                           to_node: str) -> bool:
        """Проверяет, существует ли ребро между узлами."""

    def validate_graph(self, scenario_id: int) -> list[str]:
        """
        Валидация графа перед публикацией:
        1. Есть ровно один узел START
        2. Есть хотя бы один узел FINAL
        3. Все узлы достижимы из START (BFS)
        4. Из каждого не-FINAL узла есть хотя бы одно исходящее ребро
        5. У каждого decision-узла есть хотя бы 2 исходящих ребра
        6. Нет циклов (опционально — можно разрешить для повторного прохождения)
        Возвращает список ошибок (пустой = валидный граф).
        """

    def calculate_max_score(self, scenario_id: int) -> float:
        """
        Вычисляет максимальный балл по ПРАВИЛЬНОМУ пути.
        Суммирует max_score всех оцениваемых узлов на правильном пути
        + score_delta всех правильных рёбер.
        """
```

---

## §11. GRADER SERVICE — ОЦЕНИВАНИЕ

```python
# server/services/grader_service.py

class GraderService:
    """Оценивание ответов студентов по типам узлов."""

    def grade_decision(self, node_data: dict, answer_data: dict,
                       edge: ScenarioEdge) -> GradeResult:
        """
        decision-узел: проверяем is_correct на выбранном ребре.
        score = max_score если is_correct, иначе 0.
        feedback = option.feedback
        """

    def grade_form(self, node_data: dict, answer_data: dict) -> GradeResult:
        """
        form-узел: сравниваем каждое поле с correct_value.
        score = сумма score полей с правильными значениями.
        Сравнение: text → strip().lower(), date → exact, select → exact,
        checkbox → bool, regex → re.match если задан validation_regex.
        Если correct_value = null → поле не оценивается, только валидация формата.
        """

    def grade_text_input(self, node_data: dict, answer_data: dict) -> GradeResult:
        """
        text_input-узел: ищем ключевые слова (+ синонимы) в тексте студента.
        score = сумма score найденных keywords.
        Case-insensitive. Поиск подстроки (not exact match).
        Каждое keyword засчитывается максимум один раз.
        """
```

```python
@dataclass
class GradeResult:
    score: float           # полученный балл
    max_score: float       # максимальный балл
    is_correct: bool | None  # True/False/None (для data-узлов)
    feedback: str          # текст обратной связи
    details: dict          # {"matched_keywords": [...], "missing_keywords": [...]}
```

---

## §12. ФРОНТЕНД — СТРАНИЦЫ И ЭКРАНЫ

### 12.1 Роутинг

```typescript
// client/src/App.tsx — React Router v7
<Routes>
  <Route path="/login" element={<LoginPage />} />

  <Route element={<ProtectedRoute />}>
    <Route element={<AppLayout />}>

      {/* Student */}
      <Route path="/student" element={<StudentDashboard />} />
      <Route path="/student/cases" element={<MyCases />} />
      <Route path="/student/cases/:id/play" element={<CasePlayerPage />} />
      <Route path="/student/attempts/:id/result" element={<CaseResultPage />} />
      <Route path="/student/results" element={<MyResults />} />

      {/* Teacher */}
      <Route path="/teacher" element={<TeacherDashboard />} />
      <Route path="/teacher/scenarios" element={<MyScenarios />} />
      <Route path="/teacher/scenarios/:id/edit" element={<ScenarioEditorPage />} />
      <Route path="/teacher/scenarios/:id/preview" element={<ScenarioPreview />} />
      <Route path="/teacher/scenarios/:id/analytics" element={<AnalyticsPage />} />
      <Route path="/teacher/groups" element={<GroupsPage />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/admin/system" element={<SystemPage />} />
      <Route path="/admin/settings" element={<SettingsPage />} />

    </Route>
  </Route>
</Routes>
```

### 12.2 T-3: Конструктор сценариев (ScenarioEditorPage)

Ключевой экран приложения. Три зоны:
- **Левая панель (200px):** NodePalette — перетаскиваемые блоки типов узлов (start, data, decision, form, text_input, final). Drag-and-drop на канву.
- **Центр (flex):** ScenarioCanvas — React Flow с кастомными узлами и рёбрами. Zoom, pan, minimap.
- **Правая панель (320px):** NodeInspector — редактирование выбранного узла. Контент зависит от типа: для data — rich text editor + таблицы; для decision — список вариантов; для form — конструктор полей; для text_input — ключевые слова.

**Кнопки тулбара:**
- Сохранить (PUT /api/scenarios/{id}/graph — отправляет весь граф)
- Предпросмотр (переход на T-4)
- Опубликовать (POST /api/scenarios/{id}/publish)
- Назначить группе (POST /api/scenarios/{id}/assign)

**Автосохранение:** Каждые 30 секунд + при потере фокуса окна.

### 12.3 S-3: Плеер кейса (CasePlayerPage)

Две зоны:
- **Основная (70%):** Контент текущего узла. Зависит от типа: DataView, DecisionView, FormView, TextInputView, FinalView.
- **Боковая (30%):** ProgressBar (шаги по графу), таймер (если есть time_limit), кнопка «Прервать».

При каждом действии: POST /api/attempts/{id}/step → получить next_node → перерисовать.

---

## §13. TODO ЛИСТ v1.0 — ПОРЯДОК РЕАЛИЗАЦИИ

### ЭТАП 0 — Инфраструктура (~1 день)

- [ ] `docker-compose.yml` (PostgreSQL, FastAPI, Nginx, volumes)
- [ ] `.env.example` + `.env` (секреты)
- [ ] `nginx/nginx.conf` (proxy)
- [ ] `server/Dockerfile` (Python 3.12 + requirements)
- [ ] `client/Dockerfile` (Node 22 + build + nginx для статики)
- [ ] Проверить: `docker compose up` → все сервисы стартуют

### ЭТАП 1 — Сервер: Scaffolding + Auth (~2 дня)

- [ ] `server/config.py` (DATABASE_URL, JWT_SECRET, PORT, init_dirs, MEDIA_LIMITS)
- [ ] `server/database.py` (engine, SessionLocal, Base, get_db, run_migrations)
- [ ] `server/dependencies.py` (get_current_user, require_role)
- [ ] `server/models/user.py` (Role, User, Group)
- [ ] `server/schemas/auth.py` (LoginRequest, TokenResponse, RefreshRequest)
- [ ] `server/schemas/user.py` (UserCreate, UserUpdate, UserOut)
- [ ] `server/routers/auth.py` (login, refresh, logout, me, /api/ping)
- [ ] `server/routers/users.py` (CRUD + toggle-active + change-password)
- [ ] `server/routers/groups.py` (CRUD + members)
- [ ] `server/seed.py` (роли: student/teacher/admin + дисциплины + тестовый admin для dev)
- [ ] `alembic.ini` + `migrations/env.py` + `001_initial_schema.py`
- [ ] Тест: login → получить токен → GET /api/auth/me → данные пользователя

### ЭТАП 2 — Сервер: Сценарии + Граф (~3 дня)

- [ ] `server/models/scenario.py` (Scenario, ScenarioNode, ScenarioEdge, ScenarioGroup)
- [ ] `server/models/node_content.py` (FormTemplate, FormTemplateField)
- [ ] `server/schemas/scenario.py` (ScenarioCreate, ScenarioFullOut, NodeOut, EdgeOut)
- [ ] `server/services/scenario_service.py` (CRUD, save_graph, duplicate)
- [ ] `server/services/graph_engine.py` (validate_graph, get_start_node, get_next_node, calculate_max_score)
- [ ] `server/routers/scenarios.py` (GET /, GET /{id}, POST /, PUT /{id}/graph, POST publish/unpublish/assign/duplicate)
- [ ] `server/routers/nodes.py` (PATCH /{id})
- [ ] `server/services/media_service.py` + `server/routers/media.py`
- [ ] `migrations/002_scenario_schema.py`
- [ ] Тест: создать сценарий → добавить узлы → сохранить граф → опубликовать

### ЭТАП 3 — Сервер: Попытки + Оценивание (~3 дня)

- [ ] `server/models/attempt.py` (Attempt, AttemptStep)
- [ ] `server/schemas/attempt.py` (AttemptStart, StepSubmit, AttemptResultOut)
- [ ] `server/services/grader_service.py` (grade_decision, grade_form, grade_text_input)
- [ ] `server/services/attempt_service.py` (start, step, finish, abandon)
- [ ] `server/routers/attempts.py`
- [ ] Тест: полный цикл — start → step×N → finish → score

### ЭТАП 4 — Сервер: Аналитика + Админ (~2 дня)

- [ ] `server/services/analytics_service.py` (student_dashboard, scenario_stats, path_heatmap)
- [ ] `server/schemas/analytics.py`
- [ ] `server/routers/analytics.py`
- [ ] `server/services/backup_service.py` (pg_dump/pg_restore обёртки)
- [ ] `server/routers/admin.py` (sysinfo, backup CRUD, logs, settings)
- [ ] `server/models/system.py` + `migrations/003_system_tables.py`

### ЭТАП 5 — Клиент: Scaffolding + Auth (~2 дня)

- [ ] Vite + React + TypeScript + Tailwind + React Router setup
- [ ] `client/src/api/client.ts` (Axios + interceptors)
- [ ] `client/src/stores/authStore.ts` (Zustand: user, tokens, login/logout)
- [ ] `client/src/api/auth.ts` (login, refresh, logout, me)
- [ ] `client/src/pages/auth/LoginPage.tsx`
- [ ] `client/src/components/layout/AppLayout.tsx` (Sidebar + TopBar + Content)
- [ ] `client/src/components/layout/Sidebar.tsx` (навигация по роли)
- [ ] ProtectedRoute + роутинг по ролям

### ЭТАП 6 — Клиент: Конструктор сценариев (~5 дней)

- [ ] `client/src/stores/scenarioEditorStore.ts` (Zustand: nodes, edges, selectedNode)
- [ ] `client/src/api/scenarios.ts` (CRUD + save_graph)
- [ ] `client/src/components/scenario/ScenarioCanvas.tsx` (React Flow wrapper)
- [ ] `client/src/components/scenario/NodePalette.tsx` (drag source)
- [ ] `client/src/components/scenario/NodeInspector.tsx` (форма редактирования)
- [ ] Кастомные узлы: StartNode, DataNode, DecisionNode, FormNode, TextInputNode, FinalNode
- [ ] Кастомное ребро: ChoiceEdge (label + цвет correct/incorrect)
- [ ] `client/src/pages/teacher/ScenarioEditorPage.tsx` (3 панели)
- [ ] `client/src/pages/teacher/MyScenarios.tsx` (список + создание + удаление)
- [ ] Автосохранение (debounce 30s)
- [ ] Тест: создать граф → перетащить узлы → соединить → сохранить → опубликовать

### ЭТАП 7 — Клиент: Плеер кейса (~4 дня)

- [ ] `client/src/api/attempts.ts` (start, step, finish, abandon, my)
- [ ] `client/src/components/player/CasePlayer.tsx` (основной контейнер)
- [ ] `client/src/components/player/DataView.tsx`
- [ ] `client/src/components/player/DecisionView.tsx`
- [ ] `client/src/components/player/FormView.tsx`
- [ ] `client/src/components/player/TextInputView.tsx`
- [ ] `client/src/components/player/FinalView.tsx`
- [ ] `client/src/components/player/ProgressBar.tsx`
- [ ] `client/src/components/player/PathVisualization.tsx` (граф пройденного пути)
- [ ] `client/src/pages/student/CasePlayerPage.tsx`
- [ ] `client/src/pages/student/CaseResultPage.tsx`
- [ ] Тест: полное прохождение кейса → результат

### ЭТАП 8 — Клиент: Дашборды и аналитика (~3 дня)

- [ ] `client/src/pages/student/StudentDashboard.tsx` (статистика, последние попытки)
- [ ] `client/src/pages/student/MyCases.tsx` (назначенные кейсы)
- [ ] `client/src/pages/student/MyResults.tsx` (история)
- [ ] `client/src/pages/teacher/TeacherDashboard.tsx` (обзор сценариев, активность)
- [ ] `client/src/pages/teacher/AnalyticsPage.tsx` (тепловая карта графа, распределение, слабые узлы)
- [ ] `client/src/pages/teacher/GroupsPage.tsx` (управление группами)

### ЭТАП 9 — Клиент: Админ-панель (~2 дня)

- [ ] `client/src/pages/admin/AdminDashboard.tsx` (статистика системы)
- [ ] `client/src/pages/admin/UsersPage.tsx` (CRUD пользователей)
- [ ] `client/src/pages/admin/SystemPage.tsx` (бэкапы, логи, sysinfo)
- [ ] `client/src/pages/admin/SettingsPage.tsx`

### ЭТАП 10 — Интеграция и тестирование (~3 дня)

- [ ] Полный smoke-test (см. §15)
- [ ] Обработка ошибок на клиенте: 401 → refresh; 403 → toast; 404 → EmptyState; 500 → toast
- [ ] Loading states для всех API-вызовов
- [ ] Empty states для пустых списков
- [ ] README.md — инструкция запуска
- [ ] Финальный `docker compose up` на чистой машине

---

## §14. МАТРИЦА ПРАВ ДОСТУПА — ТРИ РОЛИ

> Только 3 роли: Admin, Teacher, Student.
> Admin — центр управления. Создаёт ВСЁ: пользователей, группы, назначает людей в группы,
> даёт доступ преподавателю к группам. Teacher и Student не могут управлять пользователями.

### 14.1 Роль: Admin (Администратор)

Полный контроль над системой. Один человек (или 2 для резерва).

| Действие | Подробности |
|---|---|
| Создание пользователей | Создаёт учётки для Teacher и Student (логин, пароль, ФИО) |
| Создание групп | Создаёт группы (название, описание) |
| Распределение по группам | Назначает Student в группы, привязывает Teacher к группам |
| Управление доступом | Блокировка/разблокировка пользователей, сброс паролей |
| Назначение сценариев | Может назначить сценарий группе (или делегировать Teacher) |
| Просмотр всего | Видит всех пользователей, все сценарии, всю аналитику |
| Система | Бэкапы БД, логи, настройки системы |

### 14.2 Роль: Teacher (Преподаватель)

Создаёт сценарии и анализирует результаты. НЕ управляет пользователями.

| Действие | Подробности |
|---|---|
| Создание сценариев | Конструктор (React Flow): создаёт, редактирует, удаляет свои |
| Публикация | Публикует свои сценарии |
| Назначение группам | Назначает свои сценарии тем группам, к которым Admin дал доступ |
| Предпросмотр | Проходит свой сценарий как студент (для проверки) |
| Аналитика | Видит результаты студентов по своим сценариям |
| Просмотр групп | Видит состав групп, к которым имеет доступ |
| ❌ НЕ может | Создавать пользователей, группы, управлять доступами |

### 14.3 Роль: Student (Обучаемый)

Проходит кейсы и видит свои результаты. Минимальные права.

| Действие | Подробности |
|---|---|
| Просмотр кейсов | Видит только кейсы, назначенные его группе |
| Прохождение | Проходит кейс: данные → решения → формы → результат |
| Результаты | Видит свои результаты, оценки, путь по графу |
| Профиль | Может сменить пароль |
| ❌ НЕ может | Видеть чужие результаты, создавать что-либо, управлять |

### 14.4 Полная матрица

| Действие | Student | Teacher | Admin |
|---|---|---|---|
| Создание пользователей | ❌ | ❌ | ✅ |
| Создание групп | ❌ | ❌ | ✅ |
| Распределение по группам | ❌ | ❌ | ✅ |
| Привязка Teacher к группам | ❌ | ❌ | ✅ |
| Создание сценариев | ❌ | ✅ (свои) | ✅ |
| Публикация сценариев | ❌ | ✅ (свои) | ✅ |
| Назначение сценария группе | ❌ | ✅ (свои группы) | ✅ (любые) |
| Прохождение кейса | ✅ | ✅ (предпросмотр) | ❌ |
| Просмотр своих результатов | ✅ | ❌ | ❌ |
| Аналитика по сценарию | ❌ | ✅ (свои) | ✅ (все) |
| Управление пользователями | ❌ | ❌ | ✅ |
| Бэкапы, логи, настройки | ❌ | ❌ | ✅ |
| Смена своего пароля | ✅ | ✅ | ✅ |

---

## §15. ЧЕКЛИСТ ГОТОВНОСТИ К ЗАПУСКУ

### Сервер

```
□ docker compose up -d — все контейнеры запущены (db, server, client)
□ GET http://server/api/ping → {"status":"ok"}
□ GET http://server/api/docs → Swagger UI открывается
□ POST /api/auth/login с admin → получить токен
□ GET /api/auth/me с Bearer → данные admin
□ POST /api/scenarios/ → создать сценарий
□ PUT /api/scenarios/{id}/graph → сохранить граф
□ POST /api/scenarios/{id}/publish → опубликовать
□ POST /api/scenarios/{id}/assign → назначить группе
□ POST /api/attempts/start → начать попытку
□ POST /api/attempts/{id}/step → пройти шаг
□ POST /api/attempts/{id}/finish → завершить
□ GET /api/analytics/teacher/scenario-stats → получить статистику
□ POST /api/admin/backup → создать бэкап
```

### Клиент

```
□ http://server/ → LoginPage загружается
□ Вход admin → AdminDashboard
□ Создать преподавателя → вход как Teacher
□ Создать сценарий → React Flow canvas работает
□ Перетащить узлы → соединить → сохранить
□ Опубликовать → назначить группе
□ Создать студента → вход как Student
□ Студент видит назначенный кейс
□ Прохождение: data → decision → form → final
□ Результат: путь по графу + оценка + feedback
□ Teacher: аналитика — путь, оценки, слабые узлы
□ Admin: бэкап создан, отображается в списке
```

### Финальный smoke-test

```
□ Полный цикл: docker compose up → вход admin → создать teacher →
               teacher создаёт кейс (гепатит А) → публикует → назначает →
               создать студента → студент проходит ПРАВИЛЬНЫМ путём → 90% →
               студент проходит НЕПРАВИЛЬНЫМ путём (ОРВИ) → 30% →
               teacher смотрит аналитику → admin делает бэкап
□ Два студента одновременно: без конфликтов
□ Обрыв связи в процессе прохождения → попытка сохраняется
□ Перезапуск docker compose → данные сохранены (volumes)
```

---

## §16. EDGE CASES — ГРАНИЧНЫЕ СИТУАЦИИ

### 16.1 Авторизация

```
EC-AUTH-01: Пароль ≤7 символов → 400 "Минимум 8 символов"
EC-AUTH-02: 5 неверных попыток → lock на 30 мин
EC-AUTH-03: Refresh token истёк → 401 → logout на клиенте
EC-AUTH-04: Два браузера одного студента → stateless JWT, оба работают
```

### 16.2 Сценарии

```
EC-SCENARIO-01: Публикация без START-узла → 422 "Нет стартового узла"
EC-SCENARIO-02: Публикация с недостижимым узлом → 422 "Узел X недостижим"
EC-SCENARIO-03: Редактирование опубликованного → unpublish → edit → publish
EC-SCENARIO-04: Удаление сценария с активными попытками → 409 "Есть активные попытки"
EC-SCENARIO-05: Дублирование → новый сценарий, status=draft, новый author
```

### 16.3 Попытки

```
EC-ATTEMPT-01: Студент начинает попытку при существующей active → 409
EC-ATTEMPT-02: Превышен max_attempts → 422 "Лимит попыток исчерпан"
EC-ATTEMPT-03: Переход к несуществующему узлу → 400 "Недопустимый переход"
EC-ATTEMPT-04: Время вышло (time_limit_min) → auto-finish при следующем step
EC-ATTEMPT-05: Страница обновлена (F5) → GET /api/attempts/{id} → resume с current_node
EC-ATTEMPT-06: form-узел: обязательное поле пустое → 400 на клиенте (не отправляется)
EC-ATTEMPT-07: text_input: текст < min_length → 400 "Минимум {N} символов"
```

### 16.4 Сеть

```
EC-NET-01: Сервер недоступен → toast "Нет связи с сервером" + retry
EC-NET-02: Потеря связи в процессе прохождения → сохранить ответ локально → retry при reconnect
EC-NET-03: Access token истёк → auto-refresh → повторить запрос
EC-NET-04: Refresh token истёк → logout → LoginPage
```

---

## §17. АНТИПАТТЕРНЫ — ЧЕГО НЕЛЬЗЯ ДЕЛАТЬ

### Код без спецификации
**Нельзя:** «Давай сначала напишем ScenarioEditor, потом разберёмся с API»
**Правило:** Сначала §6.4 (API scenarios) → §9 (типы узлов) → §10 (graph_engine) → §12.2 (UI) → код

### Хранение графа по частям
**Нельзя:** Сохранять каждый узел отдельным API-вызовом при каждом drag
**Правило:** PUT /api/scenarios/{id}/graph — полная замена графа. React Flow отдаёт nodes+edges целиком. Debounce 30s.

### Оценивание на клиенте
**Нельзя:** `if (selectedOption === correctOption) score += 10`
**Правило:** Вся логика оценивания — ТОЛЬКО на сервере (grader_service). Клиент отправляет answer_data, получает GradeResult.

### Прямая мутация Zustand из компонентов
**Нельзя:** `useAuthStore.setState({ user: null })` прямо в onClick
**Правило:** Определять actions в store: `logout: () => set({ user: null, tokens: null })`

### Игнорирование loading/empty/error states
**Нельзя:** Кнопка «Сохранить» нажата → 2 секунды белый экран → результат
**Правило:** Каждый API-вызов: loading spinner ДО ответа. Пустые данные → EmptyState. Ошибка → toast.

### Hardcode correct_value на клиенте
**Нельзя:** Отправлять correct_value в ответе для студента
**Правило:** GET /api/scenarios/{id} для student-роли НЕ включает correct_value, is_correct на рёбрах.

### Цикличные графы без обработки
**Нельзя:** Позволить студенту бесконечно ходить по кругу
**Правило:** validate_graph() проверяет циклы. Если цикл разрешён — ограничить max_visits per node.

---

## §18. DOCKER ДЛЯ НАЧИНАЮЩИХ + РАЗВЁРТЫВАНИЕ НА ИЗОЛИРОВАННОМ СЕРВЕРЕ

> Этот раздел написан для человека, который никогда не работал с Docker.
> Каждый шаг объяснён. Если что-то непонятно — спросите.

### 18.1 Что такое Docker и зачем он нужен

Docker — это инструмент, который упаковывает приложение со ВСЕМИ его зависимостями
в «контейнер» (как коробку). Внутри этой коробки — Python, Node.js, PostgreSQL,
все библиотеки, весь код. Вы переносите эту коробку на любой компьютер,
запускаете одной командой — и всё работает. Не нужно ничего устанавливать вручную.

**Аналогия:** Представьте, что вы переезжаете. Вместо того чтобы покупать новую мебель
на новом месте, вы упаковываете всю квартиру в контейнер и перевозите целиком.

**Что нам даёт Docker:**
- Один файл `docker-compose.yml` описывает ВСЮ инфраструктуру
- `docker compose up` — одна команда запускает ВСЁ (сервер, БД, фронтенд)
- Не нужно устанавливать Python, Node.js, PostgreSQL на сервер — всё внутри контейнеров
- Работает одинаково на любом компьютере (ваш ПК, сервер ВМедА, ноутбук)

### 18.2 Что нужно установить (ОДИН РАЗ)

```
НА ВАШЕМ ПК (для разработки):
  1. Docker Desktop — https://www.docker.com/products/docker-desktop/
     Скачать → установить → запустить (иконка кита в трее)
  2. Git — https://git-scm.com/downloads (если нет)

НА СЕРВЕРЕ ВМедА (для продакшн):
  1. Docker Engine — попросить IT-отдел установить
     (Ubuntu: sudo apt install docker.io docker-compose-plugin)
  2. Больше НИЧЕГО не нужно — всё остальное внутри контейнеров
```

### 18.3 Как работает наш проект в Docker

```
docker-compose.yml создаёт 3 контейнера:

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   client    │  │   server    │  │     db      │
│  (Nginx +   │  │  (FastAPI + │  │ (PostgreSQL │
│   React)    │  │   Python)   │  │   16)       │
│  порт 80    │→ │  порт 8000  │→ │  порт 5432  │
└─────────────┘  └─────────────┘  └─────────────┘

Пользователь открывает http://сервер/ →
  → Nginx (в контейнере client) отдаёт React SPA
  → React делает запросы к /api/ →
    → Nginx проксирует их в контейнер server (FastAPI)
      → FastAPI работает с PostgreSQL (контейнер db)
```

### 18.4 Команды Docker (шпаргалка)

```bash
# ═══ НА ВАШЕМ ПК (с интернетом) ═══

# Первый раз: собрать все контейнеры
docker compose build

# Запустить всё (в фоне)
docker compose up -d

# Посмотреть, что работает
docker compose ps

# Посмотреть логи (если что-то не так)
docker compose logs           # все логи
docker compose logs server    # только логи FastAPI
docker compose logs db        # только логи PostgreSQL

# Остановить всё
docker compose down

# Остановить и УДАЛИТЬ данные (БД, файлы) — ОСТОРОЖНО
docker compose down -v

# Пересобрать после изменений кода
docker compose build --no-cache
docker compose up -d
```

### 18.5 Перенос на ИЗОЛИРОВАННЫЙ сервер (без интернета)

Сервер ВМедА не имеет доступа к интернету. Поэтому мы не можем делать
`docker pull` или `docker compose build` на нём. Схема:

```
┌──────────────────┐        USB/сеть        ┌──────────────────┐
│  Ваш ПК          │  ═══════════════════►  │  Сервер ВМедА    │
│  (с интернетом)  │                        │  (без интернета) │
│                  │                        │                  │
│  1. git clone    │                        │  4. docker load  │
│  2. docker build │                        │  5. docker       │
│  3. docker save  │                        │     compose up   │
└──────────────────┘                        └──────────────────┘
```

**Шаг 1 — Собрать на своём ПК (один раз при обновлении):**

```bash
# На ВАШЕМ ПК с интернетом:
cd epicase/
docker compose build                    # собрать все контейнеры

# Экспортировать образы в файлы
docker save epicase-server -o epicase-server.tar
docker save epicase-client -o epicase-client.tar
docker save postgres:16-alpine -o postgres-16.tar

# Скопировать на флешку / по внутренней сети:
# - epicase-server.tar  (~500MB)
# - epicase-client.tar  (~100MB)
# - postgres-16.tar     (~200MB)
# - docker-compose.yml
# - .env
# - nginx/nginx.conf
```

**Шаг 2 — Загрузить на сервер ВМедА:**

```bash
# На СЕРВЕРЕ ВМедА (без интернета):
# Скопировать файлы с флешки в /opt/epicase/

cd /opt/epicase/

# Загрузить образы в Docker
docker load -i epicase-server.tar
docker load -i epicase-client.tar
docker load -i postgres-16.tar

# Проверить, что образы загружены
docker images
# Должны быть: epicase-server, epicase-client, postgres
```

**Шаг 3 — Запустить:**

```bash
# На СЕРВЕРЕ ВМедА:
cd /opt/epicase/

# Настроить секреты (ОДИН РАЗ)
cp .env.example .env
nano .env   # или notepad .env на Windows
# Задать:
#   POSTGRES_PASSWORD=ваш-сложный-пароль
#   JWT_SECRET=строка-32-символа-или-больше

# Запустить ВСЁ
docker compose up -d

# Проверить
docker compose ps            # все 3 контейнера = Up
curl http://localhost/api/ping   # → {"status":"ok"}

# Готово! Теперь откройте http://IP-сервера/ в браузере
```

**Шаг 4 — При обновлении (новая версия кода):**

```bash
# На ВАШЕМ ПК: пересобрать и экспортировать
docker compose build
docker save epicase-server -o epicase-server.tar
docker save epicase-client -o epicase-client.tar
# (postgres не нужно пересобирать — он не меняется)

# Перенести на сервер → загрузить → перезапустить
docker load -i epicase-server.tar
docker load -i epicase-client.tar
docker compose up -d
# Docker автоматически обнаружит новые образы и пересоздаст контейнеры
# Данные в PostgreSQL НЕ теряются (хранятся в volume)
```

### 18.6 Создание первого администратора

```
После запуска:
1. Откройте http://IP-сервера/ в браузере любого ПК в сети ВМедА
2. Войдите с логином/паролем из seed.py (admin / Admin1234 — сменить сразу!)
3. Admin → Пользователи → создать преподавателей
4. Admin → Группы → создать группы (например: «Группа №1 леч.», «Группа №2 воен.»)
5. Admin → Пользователи → создать студентов → назначить в группы
6. Admin → Группы → привязать преподавателя к группам
7. Преподаватель входит → создаёт сценарий → публикует → назначает группе
8. Студенты входят → видят назначенные кейсы → проходят
```

### 18.7 Устранение типичных проблем

| Проблема | Причина | Решение |
|---|---|---|
| «Страница не загружается» | Docker не запущен | `docker compose up -d` |
| «502 Bad Gateway» | FastAPI ещё стартует | Подождать 10–15 секунд |
| `docker compose build` падает | Нет интернета на сервере | Собирать на своём ПК → перенести tar |
| «Нет связи с БД» | PostgreSQL не стартовал | `docker compose logs db` — смотреть ошибку |
| Студент не видит кейсы | Кейс не назначен группе | Admin/Teacher: назначить сценарий группе |
| «Аккаунт заблокирован» | 5 неверных паролей | Admin → Пользователи → Разблокировать |
| Данные пропали после перезапуска | Использовали `down -v` | НИКОГДА не делать `docker compose down -v` на сервере |
| Docker не запускается на сервере | Docker не установлен | Попросить IT-отдел: `sudo apt install docker.io` |

---

## §19. БЕЗОПАСНОСТЬ

| Аспект | Решение |
|---|---|
| Пароли | bcrypt, cost=12 |
| Токены | JWT HS256, секрет из .env (≥32 символов) |
| Блокировка | 5 неверных попыток → lock на 30 мин |
| Права | require_role() на каждом endpoint |
| SQL-инъекции | SQLAlchemy ORM (параметризованные запросы) |
| Медиа | Pillow validate + MIME check + size limit |
| Сеть | LAN only, Nginx без публичного доступа |
| CORS | allow_origins=["*"] (безопасно в изолированной LAN) |
| Бэкапы | Ежедневный автобэкап через APScheduler + pg_dump |

---

## §20. АГЕНТЫ В ANTIGRAVITY — Claude Opus 4.6 + Gemini 3.1 Pro (High)

> Проект разрабатывается в Antigravity с двумя моделями.
> Оба агента читают один и тот же PROJECT_DESIGN и скиллы.
> Распределение задач — по сильным сторонам каждой модели.

### 20.1 Распределение ролей между моделями

| Модель | Роль | Почему |
|---|---|---|
| **Claude Opus 4.6** | Архитектура, сложная логика, ревью | Лучше в системном мышлении, длинных рассуждениях, code review |
| **Gemini 3.1 Pro (High)** | Быстрая генерация, UI, тесты | Быстрее в генерации больших объёмов кода, хорошо работает с React |

### 20.2 Задачи для Claude Opus 4.6

```
ЭТАП 0-1: Инфраструктура и Auth
- docker-compose.yml, Dockerfiles, nginx.conf
- server/config.py, database.py, dependencies.py
- Модели БД (server/models/*.py) — сложная архитектура графов
- Auth flow: JWT, bcrypt, refresh, блокировка
- graph_engine.py — самая сложная бизнес-логика (BFS, валидация графа)
- grader_service.py — логика оценивания всех типов узлов

ЭТАП 2-4: Backend бизнес-логика
- server/services/*.py — вся бизнес-логика
- server/routers/*.py — API эндпоинты
- server/schemas/*.py — Pydantic схемы
- Alembic миграции
- Edge cases из §16

РЕВЬЮ: Проверка кода Gemini
- Code review каждого PR/коммита от Gemini
- Проверка соответствия спецификации
- Поиск багов и антипаттернов
```

### 20.3 Задачи для Gemini 3.1 Pro (High)

```
ЭТАП 5-6: Frontend scaffolding + конструктор
- Vite + React + TypeScript + Tailwind setup
- Axios client с interceptors
- Zustand stores (authStore, scenarioEditorStore)
- React Flow canvas + кастомные узлы (6 типов)
- NodePalette, NodeInspector
- ScenarioEditorPage (три панели)

ЭТАП 7-8: Плеер + дашборды
- CasePlayer + все View-компоненты
- Страницы студента, преподавателя, админа
- Recharts графики для аналитики
- Loading/empty/error states

ТЕСТЫ: Все тесты проекта
- pytest тесты для backend (по спецификации Claude)
- vitest тесты для frontend
- E2E smoke tests
```

### 20.4 Настройка Antigravity

```
# Структура проекта для Antigravity:
epicase/
├── .agent/                          ← Конфигурация Antigravity
│   ├── config.json                  ← Настройки агентов
│   ├── skills/                      ← Скиллы (§22)
│   │   ├── react-best-practices.md
│   │   ├── react-flow-node-ts.md
│   │   ├── zustand-store-ts.md
│   │   ├── fastapi-router-py.md
│   │   ├── pydantic-models-py.md
│   │   ├── postgres-best-practices.md
│   │   ├── test-driven-development.md
│   │   ├── modern-python.md
│   │   └── security-best-practices.md
│   └── mcp/                         ← MCP серверы
│       └── context7.json            ← Context7 (только dev-машина с интернетом!)
│
├── AGENTS.md                        ← Правила для обоих агентов (§24)
├── docs/
│   └── PROJECT_DESIGN_EPICASE_v1.md ← ЭТОТ ФАЙЛ — источник правды
...
```

### 20.5 AGENTS.md — общие правила для обоих моделей

```markdown
# EpiCase — Правила для AI-агентов (Antigravity)

## Источник правды
Читай docs/PROJECT_DESIGN_EPICASE_v1.md перед КАЖДОЙ задачей.

## Методология: Test → Code → Verify (§21)
1. Написать тест → запустить (должен упасть)
2. Написать код → запустить тест (должен пройти)
3. Запустить ВСЕ тесты → commit

## Context7 MCP
Перед кодом с любой библиотекой: "use context7"
Список: §23.3. ТОЛЬКО на dev-машине (продакшн без интернета).

## Роли (§14)
Admin = создаёт ВСЁ (пользователей, группы, доступы)
Teacher = создаёт сценарии + аналитика (НЕ управляет людьми)
Student = проходит кейсы + свои результаты

## Стек
Backend: FastAPI + SQLAlchemy 2 + PostgreSQL 16 + Alembic + pytest
Frontend: React 19 + TS + @xyflow/react 12 + Zustand 5 + TanStack Query 5 + Tailwind 4

## Антипаттерны
- НЕ писать код без теста
- НЕ хранить correct_value на клиенте
- НЕ оценивать ответы на клиенте
- НЕ делать API-вызовы без loading state
- НЕ hardcode цветов — Tailwind tokens
```

---

## §21. МЕТОДОЛОГИЯ РАЗРАБОТКИ — TEST → CODE → VERIFY

> **ЖЕЛЕЗНОЕ ПРАВИЛО:** Каждая единица работы проходит цикл: Тест → Код → Проверка.
> Агент НИКОГДА не пишет реализацию без тестов. Нарушение = откат и переделка.

### 21.1 Цикл разработки для КАЖДОЙ задачи

```
┌─────────────────────────────────────────────────────────┐
│  ФАЗА 1: ТЕСТ (Red)                                    │
│  ─────────────────                                      │
│  1. Прочитать спецификацию задачи из PROJECT_DESIGN     │
│  2. Написать тест, который описывает ожидаемое          │
│     поведение (pytest для бэка, vitest для фронта)      │
│  3. Запустить тест → ДОЛЖЕН УПАСТЬ (red)                │
│  4. Если тест прошёл — он бесполезен, переписать        │
│                                                         │
│  ФАЗА 2: КОД (Green)                                   │
│  ──────────────────                                     │
│  5. Написать минимальный код, чтобы тест прошёл         │
│  6. Запустить тест → ДОЛЖЕН ПРОЙТИ (green)              │
│  7. Если не прошёл — исправить код (не тест!)           │
│                                                         │
│  ФАЗА 3: ПРОВЕРКА (Refactor + Verify)                   │
│  ──────────────────────────────────                     │
│  8. Запустить ВСЕ тесты (не только новый)               │
│  9. Убедиться, что ничего не сломалось                  │
│  10. Рефакторинг если нужно → прогнать тесты снова      │
│  11. Commit с сообщением: "feat: <что сделано> [tests]" │
└─────────────────────────────────────────────────────────┘
```

### 21.2 Структура тестов

```
epicase/
├── server/
│   └── tests/
│       ├── conftest.py              # Фикстуры: test DB, test client, test user
│       ├── test_auth.py             # Login, refresh, logout, блокировка
│       ├── test_users.py            # CRUD пользователей
│       ├── test_scenarios.py        # CRUD сценариев, save_graph, publish
│       ├── test_graph_engine.py     # validate_graph, get_next_node, calculate_max_score
│       ├── test_grader.py           # grade_decision, grade_form, grade_text_input
│       ├── test_attempts.py         # start, step, finish, abandon
│       ├── test_analytics.py        # Статистика, path_analysis
│       └── test_edge_cases.py       # Все EC-* из §16
│
├── client/
│   └── src/
│       └── __tests__/
│           ├── setup.ts             # Vitest setup, MSW mocks
│           ├── api/
│           │   └── client.test.ts   # Interceptors, JWT refresh
│           ├── stores/
│           │   ├── authStore.test.ts
│           │   └── scenarioEditorStore.test.ts
│           ├── components/
│           │   ├── scenario/
│           │   │   ├── ScenarioCanvas.test.tsx
│           │   │   └── NodeInspector.test.tsx
│           │   └── player/
│           │       ├── CasePlayer.test.tsx
│           │       └── DecisionView.test.tsx
│           └── pages/
│               ├── LoginPage.test.tsx
│               └── ScenarioEditorPage.test.tsx
```

### 21.3 Пример: TDD для graph_engine.validate_graph

```python
# ФАЗА 1 — ТЕСТ (пишется ПЕРВЫМ)
# server/tests/test_graph_engine.py

import pytest
from server.services.graph_engine import GraphEngine

class TestValidateGraph:
    """Тесты валидации графа перед публикацией (§10)."""

    def test_valid_graph_no_errors(self, valid_scenario):
        """Валидный граф: START → DATA → DECISION → FINAL×2."""
        engine = GraphEngine()
        errors = engine.validate_graph(valid_scenario.id)
        assert errors == []

    def test_no_start_node(self, scenario_without_start):
        """Граф без START-узла → ошибка."""
        engine = GraphEngine()
        errors = engine.validate_graph(scenario_without_start.id)
        assert "Нет стартового узла" in errors

    def test_unreachable_node(self, scenario_with_orphan):
        """Граф с недостижимым узлом → ошибка."""
        engine = GraphEngine()
        errors = engine.validate_graph(scenario_with_orphan.id)
        assert any("недостижим" in e for e in errors)

    def test_decision_without_edges(self, scenario_decision_no_edges):
        """Decision-узел без исходящих рёбер → ошибка."""
        engine = GraphEngine()
        errors = engine.validate_graph(scenario_decision_no_edges.id)
        assert any("исходящих рёбер" in e for e in errors)

# ФАЗА 2 — КОД (пишется ПОСЛЕ теста)
# server/services/graph_engine.py → реализация validate_graph

# ФАЗА 3 — ПРОВЕРКА
# pytest server/tests/ -v → все зелёные
```

### 21.4 Пример: TDD для React-компонента

```typescript
// ФАЗА 1 — ТЕСТ (пишется ПЕРВЫМ)
// client/src/__tests__/components/player/DecisionView.test.tsx

import { render, screen, fireEvent } from "@testing-library/react";
import { DecisionView } from "@/components/player/DecisionView";

const mockNode = {
  node_type: "decision",
  node_data: {
    question: "Какой анализ назначить?",
    options: [
      { id: "opt_1", text: "Anti-HAV IgM" },
      { id: "opt_2", text: "Мазок из зева" },
    ],
  },
};

describe("DecisionView", () => {
  it("renders question and all options", () => {
    render(<DecisionView node={mockNode} onSubmit={vi.fn()} />);
    expect(screen.getByText("Какой анализ назначить?")).toBeInTheDocument();
    expect(screen.getByText("Anti-HAV IgM")).toBeInTheDocument();
    expect(screen.getByText("Мазок из зева")).toBeInTheDocument();
  });

  it("submit button disabled until option selected", () => {
    render(<DecisionView node={mockNode} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ответить/i })).toBeDisabled();
  });

  it("calls onSubmit with selected option id", async () => {
    const onSubmit = vi.fn();
    render(<DecisionView node={mockNode} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Anti-HAV IgM"));
    fireEvent.click(screen.getByRole("button", { name: /ответить/i }));
    expect(onSubmit).toHaveBeenCalledWith({ selected_option_id: "opt_1" });
  });
});

// ФАЗА 2 — КОД
// client/src/components/player/DecisionView.tsx → реализация

// ФАЗА 3 — ПРОВЕРКА
// npx vitest run → все зелёные
```

### 21.5 Правила для агентов

```
ПРАВИЛО 1: Тест ВСЕГДА пишется ДО реализации
  Нельзя: написать route → потом тест
  Нужно:  написать тест route → запустить (red) → написать route → запустить (green)

ПРАВИЛО 2: Каждый API-эндпоинт = минимум 3 теста
  - Happy path (200/201)
  - Ошибка авторизации (401/403)
  - Ошибка валидации (400/422)

ПРАВИЛО 3: Каждый React-компонент = минимум 2 теста
  - Рендер с корректными props
  - Пользовательское взаимодействие (click, submit)

ПРАВИЛО 4: Edge cases из §16 = обязательные тесты
  Каждый EC-* должен быть покрыт отдельным тестом

ПРАВИЛО 5: Запуск ВСЕХ тестов перед commit
  pytest server/tests/ && cd client && npx vitest run

ПРАВИЛО 6: Тест-зависимости
  server: pytest + pytest-asyncio + httpx (TestClient для FastAPI)
  client: vitest + @testing-library/react + msw (Mock Service Worker)
```

### 21.6 Тест-зависимости

```
# server/requirements-dev.txt
pytest==8.3.4
pytest-asyncio==0.24.0
pytest-cov==6.0.0
httpx==0.28.1                   # TestClient для FastAPI
factory-boy==3.3.1              # Фикстуры данных

# client/package.json → devDependencies
"vitest": "^2.1.0",
"@testing-library/react": "^16.1.0",
"@testing-library/jest-dom": "^6.6.0",
"@testing-library/user-event": "^14.5.0",
"msw": "^2.7.0",                 # Mock Service Worker для API mocks
"@vitest/coverage-v8": "^2.1.0"
```

---

## §22. AGENT SKILLS — ФИНАЛЬНЫЙ СПИСОК (из 80 скриншотов)

> Отобрано из VoltAgent/awesome-agent-skills + 4 партий скриншотов (80 шт).
> Скиллы разделены на 3 категории: ОБЯЗАТЕЛЬНЫЕ, UI/UX, ВСПОМОГАТЕЛЬНЫЕ.
> Все скиллы копируются в .agent/skills/ для Antigravity.

### 22.1 ОБЯЗАТЕЛЬНЫЕ — подключить ДО начала кода

| # | Скилл | Источник | Для кого | Зачем |
|---|---|---|---|---|
| 1 | **test-driven-development** | obra/superpowers | Оба | TDD цикл: тест→код→verify. Основа §21 |
| 2 | **react-flow-node-ts** | microsoft | Gemini | React Flow node components + Zustand. ЯДРО конструктора |
| 3 | **zustand-store-ts** | microsoft | Gemini | Zustand stores с middleware. authStore, scenarioEditorStore |
| 4 | **fastapi-router-py** | microsoft | Claude Opus | FastAPI routers with CRUD and auth. Шаблон всех роутеров |
| 5 | **pydantic-models-py** | microsoft | Claude Opus | Pydantic v2 schemas. Шаблон server/schemas/ |
| 6 | **react-best-practices** | vercel-labs | Gemini | React паттерны, composition, хуки |
| 7 | **postgres-best-practices** | supabase | Claude Opus | PostgreSQL оптимальная структура, индексы, JSONB |
| 8 | **modern-python** | trailofbits | Claude Opus | ruff, pytest, uv — стандарт Python-кода |
| 9 | **secure-code-guardian** | okaashish | Claude Opus | Auth, JWT, OWASP — безопасный код с первой строки |
| 10 | **playwright-skill** | testdino-hq | Оба | TDD через Playwright — полный цикл red→green |

### 22.2 UI/UX — подключить при работе с фронтендом

| # | Скилл | Источник | Зачем |
|---|---|---|---|
| 11 | **frontend-design** | anthropic (official) | Production-level UI, нет «AI slop», дизайн-направление до кода |
| 12 | **ui-ux-pro-max** | nextlevelbuilder | Генерирует полную дизайн-систему: палитра, шрифты, UX-правила |
| 13 | **ux-heuristics** | okaashish | Аудит по 10 эвристикам Нильсена + Крюга. Severity-scored |
| 14 | **refactoring-ui** | okaashish | Аудит иерархии, spacing, теней, цвета. Финальная полировка |
| 15 | **brand-guidelines** | anthropic (official) | Загрузить бренд ВМедА → агенты автоматически соблюдают |
| 16 | **web-design-guidelines** | vercel-labs | Стандарты веб-дизайна |
| 17 | **composition-patterns** | vercel-labs | Reusable React component patterns |

### 22.3 ВСПОМОГАТЕЛЬНЫЕ — подключать по ситуации

| # | Скилл | Источник | Когда использовать |
|---|---|---|---|
| 18 | **code-reviewer** | okaashish | Перед каждым коммитом — структурированное ревью |
| 19 | **feature-forge** | okaashish | Перед началом новой фичи — спецификация + acceptance criteria |
| 20 | **debugging-skill** | AlmogBaku | Когда агент застрял на баге — breakpoints, пошаговое |
| 21 | **systematic-debugging** | obra/superpowers | 4-фазный дебаггинг: root cause ДО фикса |
| 22 | **the-fool** | okaashish | Stress-test архитектуры: devil's advocate, red team, pre-mortem |
| 23 | **security-best-practices** | openai | При работе с auth, JWT, паролями |
| 24 | **insecure-defaults** | trailofbits | Детект hardcoded secrets, дефолтных паролей |
| 25 | **verification-before-completion** | obra | Верификация перед завершением задачи |
| 26 | **context-optimization** | muratcankoylan | Сжатие контекста, token reduction при длинных сессиях |
| 27 | **skill-creator** | anthropic (official) | Если нужно создать кастомный скилл под EpiCase |
| 28 | **code-review** | getsentry | Sentry-паттерны code review |
| 29 | **find-bugs** | getsentry | Автоматический поиск багов |
| 30 | **commit** | getsentry | Best practices для коммит-сообщений |

### 22.4 Дополнительные инструменты

| Инструмент | Источник | Зачем |
|---|---|---|
| **Repomix** | yamadashy/repomix | Упаковка всего репозитория в один AI-friendly файл. Для передачи контекста между сессиями |
| **Claude Mem** | thedotmack/claude-mem | Автоматическая память между сессиями. Альтернатива ручному MEMORY.md |
| **Framer Motion** | framer/motion | React анимации для плеера и конструктора. Добавить в package.json |

### 22.5 Подключение в Antigravity

```
epicase/
├── .agent/
│   └── skills/
│       │
│       │  ── ОБЯЗАТЕЛЬНЫЕ (подключить сразу) ──
│       ├── test-driven-development.md     ← obra/superpowers
│       ├── react-flow-node-ts.md          ← microsoft
│       ├── zustand-store-ts.md            ← microsoft
│       ├── fastapi-router-py.md           ← microsoft
│       ├── pydantic-models-py.md          ← microsoft
│       ├── react-best-practices.md        ← vercel-labs
│       ├── postgres-best-practices.md     ← supabase
│       ├── modern-python.md               ← trailofbits
│       ├── secure-code-guardian.md         ← okaashish (скачать с GitHub)
│       ├── playwright-skill.md            ← testdino-hq
│       │
│       │  ── UI/UX (подключить перед фронтенд-этапами) ──
│       ├── frontend-design.md             ← anthropic/skills
│       ├── ui-ux-pro-max.md               ← nextlevelbuilder
│       ├── ux-heuristics.md               ← okaashish
│       ├── refactoring-ui.md              ← okaashish
│       ├── brand-guidelines.md            ← anthropic/skills
│       ├── web-design-guidelines.md       ← vercel-labs
│       ├── composition-patterns.md        ← vercel-labs
│       │
│       │  ── ВСПОМОГАТЕЛЬНЫЕ (подключать по ситуации) ──
│       ├── code-reviewer.md               ← okaashish
│       ├── feature-forge.md               ← okaashish
│       ├── debugging-skill.md             ← AlmogBaku
│       ├── systematic-debugging.md        ← obra/superpowers
│       ├── the-fool.md                    ← okaashish
│       ├── security-best-practices.md     ← openai
│       ├── insecure-defaults.md           ← trailofbits
│       ├── verification-before-completion.md ← obra
│       ├── context-optimization.md        ← muratcankoylan
│       ├── skill-creator.md               ← anthropic/skills
│       ├── code-review.md                 ← getsentry
│       ├── find-bugs.md                   ← getsentry
│       └── commit.md                      ← getsentry

# Инструкция для агента перед началом работы:
# 1. Проверить наличие скиллов: ls .agent/skills/
# 2. Прочитать docs/PROJECT_DESIGN_EPICASE_v1.md
# 3. Прочитать MEMORY.md (если существует)
# 4. Прочитать релевантные скиллы для текущей задачи
# 5. Начать работу по циклу §21 (Тест → Код → Проверка)
```

### 22.6 Откуда скачивать скиллы

```bash
# Обязательные:
git clone https://github.com/obra/superpowers.git
git clone https://github.com/microsoft/skills.git
git clone https://github.com/vercel-labs/agent-skills.git
git clone https://github.com/supabase/agent-skills.git
git clone https://github.com/trailofbits/skills.git

# UI/UX:
git clone https://github.com/anthropics/skills.git
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

# Вспомогательные:
git clone https://github.com/getsentry/skills.git
git clone https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering.git
git clone https://github.com/AlmogBaku/debug-skill.git

# Из каждого репо скопировать SKILL.md в .agent/skills/ с нужным именем
```

---

## §25. MEMORY.md — ПАМЯТЬ МЕЖДУ СЕССИЯМИ

> Критически важный файл. Без него каждая сессия агента начинается с нуля.
> Агенты ОБЯЗАНЫ обновлять MEMORY.md в конце каждой сессии.

### 25.1 Зачем нужен

Antigravity запускает новую сессию агента — и он не помнит, что было в прошлой.
MEMORY.md — это файл в корне проекта, который агенты читают в начале и обновляют в конце.
Он хранит: какие решения приняты, какие проблемы решены, где остановились, что НЕ работает.

### 25.2 Шаблон MEMORY.md

```markdown
# EpiCase — Память проекта

## Последнее обновление
- Дата: 2026-04-15
- Агент: Claude Opus 4.6
- Этап: §13 ЭТАП 2 — Сервер: Сценарии + Граф

## Текущий статус
- [x] ЭТАП 0 — Инфраструктура (docker-compose, Dockerfiles)
- [x] ЭТАП 1 — Auth + Users + Groups (JWT, bcrypt, CRUD)
- [ ] ЭТАП 2 — Сценарии + Граф (IN PROGRESS)
  - [x] models/scenario.py — готово
  - [x] schemas/scenario.py — готово
  - [ ] services/graph_engine.py — validate_graph (70% готово)
  - [ ] routers/scenarios.py — PUT /graph не работает (см. Проблемы)
- [ ] ЭТАП 3 — Попытки + Оценивание

## Решения (НЕ МЕНЯТЬ)
- JSONB для node_data, НЕ отдельные таблицы — решение от 2026-04-12
- React Flow v12 (@xyflow/react), НЕ v11 — breaking changes
- Zustand v5 с immer middleware — для scenarioEditorStore
- PUT /graph — полная замена, НЕ PATCH отдельных узлов
- Tailwind v4 — новый конфиг (НЕ tailwind.config.js, а CSS-based)

## Проблемы (НЕРЕШЁННЫЕ)
- [ ] PUT /api/scenarios/{id}/graph возвращает 500 при циклическом графе
      → graph_engine.validate_graph() не обрабатывает циклы
      → Нужно: добавить BFS с visited set
- [ ] Alembic downgrade ломает scenario_nodes из-за composite PK
      → Workaround: не делать downgrade, только upgrade

## Проблемы (РЕШЁННЫЕ)
- [x] PostgreSQL JSONB индекс не работал на node_data->>'type'
      → Решение: GIN индекс вместо B-tree (2026-04-13)
- [x] React Flow onNodesChange не обновлял Zustand
      → Решение: useCallback с shallow compare (2026-04-14)

## Тесты
- Backend: 47 тестов, 45 pass, 2 fail (graph_engine cycle detection)
- Frontend: ещё не начато (ЭТАП 5)

## Заметки для следующей сессии
- Начать с fix graph_engine.validate_graph() для циклов
- Потом: routers/scenarios.py — PUT /graph endpoint
- НЕ ТРОГАТЬ: models/user.py, routers/auth.py — работают идеально
```

### 25.3 Правила обновления MEMORY.md

```
ПРАВИЛО 1: Читать MEMORY.md ПЕРВЫМ при каждой сессии
ПРАВИЛО 2: Обновлять ПЕРЕД завершением каждой сессии
ПРАВИЛО 3: НЕ удалять решения — только дополнять
ПРАВИЛО 4: Нерешённые проблемы → в «Проблемы (НЕРЕШЁННЫЕ)»
ПРАВИЛО 5: Решённые проблемы → переместить в «РЕШЁННЫЕ» с датой и решением
ПРАВИЛО 6: Статус этапов обновлять после каждого коммита
```

---

## §26. HOOKS И COMMANDS — АВТОМАТИЗАЦИЯ

> Hooks запускаются автоматически при каждом сохранении файла.
> Commands — кастомные команды для частых действий.

### 26.1 Hooks (автоформатирование)

```json
// .agent/config.json (или settings.json для Claude Code)
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "cd server && python -m ruff check --fix --quiet",
        "description": "Auto-lint Python before save"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "command": "cd client && npx prettier --write $FILE_PATH",
        "description": "Auto-format TypeScript after save"
      },
      {
        "matcher": "Write",
        "command": "cd server && python -m ruff format $FILE_PATH",
        "description": "Auto-format Python after save"
      }
    ]
  }
}
```

### 26.2 Custom Commands

```markdown
# .agent/commands/review.md
---
description: Review code for bugs, security, and spec compliance
allowed-tools: Read, Grep, Glob, Agent, WebSearch
---

Review the latest changes for these issues:
- Security vulnerabilities (XSS, SQL injection, hardcoded secrets)
- Spec compliance: does code match PROJECT_DESIGN §6 (API), §8 (DB), §9 (node types)?
- Missing tests (every endpoint needs 3+ tests per §21)
- Missing error handling and edge cases from §16
- Anti-patterns from §17

Output a markdown table:
| File | Line | Severity | Issue | Suggested Fix |
Sort by severity: critical > high > medium > low
```

```markdown
# .agent/commands/test.md
---
description: Run all tests and report results
allowed-tools: Bash, Read
---

Run all project tests:
1. cd server && python -m pytest tests/ -v --tb=short
2. cd client && npx vitest run --reporter=verbose

Report:
- Total tests / Passed / Failed / Skipped
- List all FAILED tests with error messages
- If any test fails: suggest fix based on the error
```

```markdown
# .agent/commands/status.md
---
description: Show project progress against TODO list
allowed-tools: Read, Grep, Glob
---

Read docs/PROJECT_DESIGN_EPICASE_v1.md §13 (TODO list).
Read MEMORY.md for current status.
Compare and output:
- What's DONE (with dates)
- What's IN PROGRESS
- What's NEXT
- Estimated remaining work
```

---

## §23. CONTEXT7 MCP — АКТУАЛЬНАЯ ДОКУМЕНТАЦИЯ (ТОЛЬКО НА DEV-МАШИНЕ)

> ⚠️ Context7 требует интернет. Продакшн-сервер ВМедА ИЗОЛИРОВАН от сети.
> Context7 используется ТОЛЬКО во время разработки на ПК разработчика (с интернетом).
> На продакшн-сервер переносятся готовые Docker-образы, Context7 там НЕ нужен.

### 23.1 Установка Context7 MCP

```bash
# Для Claude Code:
claude mcp add --transport http context7 https://mcp.context7.com/mcp

# Для Antigravity (в .agent/config или mcp_config.json):
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}

# Для Cursor (settings → MCP → Add new global MCP server):
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

### 23.2 Правило использования Context7

```
ПРАВИЛО: Агент ОБЯЗАН запрашивать Context7 перед написанием кода с любой библиотекой.

Когда использовать:
- Перед написанием кода с React Flow → "use context7" для @xyflow/react
- Перед написанием Zustand store → "use context7" для zustand
- Перед написанием FastAPI router → "use context7" для fastapi
- Перед написанием SQLAlchemy модели → "use context7" для sqlalchemy
- Перед написанием Alembic миграции → "use context7" для alembic
- Перед написанием Axios interceptor → "use context7" для axios
- Перед написанием TanStack Query hook → "use context7" для @tanstack/react-query
- Перед написанием Tailwind стилей → "use context7" для tailwindcss
- Перед написанием Zod схемы → "use context7" для zod
- Перед написанием Recharts графика → "use context7" для recharts
- Перед написанием react-hook-form → "use context7" для react-hook-form
- Перед написанием Docker Compose → "use context7" для docker compose
- Перед написанием Nginx конфига → "use context7" для nginx
- Перед написанием pytest теста → "use context7" для pytest
- Перед написанием Vitest теста → "use context7" для vitest

Почему это критично:
- React Flow v12 (@xyflow/react) кардинально отличается от v11 (reactflow)
- Zustand v5 имеет breaking changes по сравнению с v4
- FastAPI и Pydantic v2 несовместимы с v1 паттернами
- TanStack Query v5 изменил API по сравнению с React Query v3/v4
- Tailwind CSS v4 отличается от v3 (новая конфигурация)
```

### 23.3 Библиотеки проекта для Context7

```
# Полный список библиотек, для которых агент ОБЯЗАН использовать Context7:

# Backend (Python)
/tiangolo/fastapi                    # FastAPI framework
/sqlalchemy/sqlalchemy               # ORM
/sqlalchemy/alembic                  # Миграции
/pydantic/pydantic                   # Валидация схем
/bcrypt/bcrypt                       # Хэширование паролей
/mpdavis/python-jose                 # JWT
/pytest-dev/pytest                   # Тестирование

# Frontend (TypeScript)
/xyflow/xyflow                       # React Flow (конструктор графов)
/pmndrs/zustand                      # State management
/tanstack/query                      # Server state management
/axios/axios                         # HTTP client
/react-hook-form/react-hook-form     # Формы
/colinhacks/zod                      # Валидация
/recharts/recharts                   # Графики
/framer/motion                       # Анимации (framer-motion)
/tailwindlabs/tailwindcss            # CSS framework
/vitejs/vite                         # Сборщик
/vitest-dev/vitest                   # Тестирование

# Infrastructure
/docker/compose                      # Docker Compose
/nginx/nginx                         # Reverse proxy
/postgres/postgres                   # PostgreSQL
```

### 23.4 Пример промпта с Context7

```
# Плохо (без Context7 — агент генерирует устаревший код):
"Создай кастомный узел для React Flow с handles"

# Хорошо (с Context7 — агент получает актуальный API):
"Создай кастомный узел для React Flow (@xyflow/react v12) с handles.
use context7 для @xyflow/react"

# Результат: агент получает актуальную документацию React Flow v12
# и использует правильные импорты из @xyflow/react (не из устаревшего reactflow)
```

---

## §24. AGENTS.md — ФАЙЛ В КОРНЕ ПРОЕКТА

> Этот файл лежит в epicase/AGENTS.md и читается обоими агентами при каждом запуске.
> Подходит для Claude Opus 4.6 и Gemini 3.1 Pro (High) в Antigravity.

```markdown
# EpiCase — Правила для AI-агентов (Antigravity)
# Читают: Claude Opus 4.6 + Gemini 3.1 Pro (High)

## Источник правды
- docs/PROJECT_DESIGN_EPICASE_v1.md — единственный источник правды
- НЕ придумывать API, модели, типы — ТОЛЬКО из PROJECT_DESIGN
- При сомнениях — перечитать соответствующий параграф

## Методология: Test → Code → Verify (§21)
- КАЖДАЯ задача: написать тест → запустить (red) → написать код → запустить (green)
- Без теста = НЕ начинать реализацию
- Перед commit: запустить ВСЕ тесты
- Минимум 3 теста на API эндпоинт, 2 теста на React компонент

## Context7 MCP (§23)
- ПЕРЕД кодом с ЛЮБОЙ библиотекой: "use context7"
- Список библиотек: §23.3
- ТОЛЬКО на dev-машине (продакшн-сервер без интернета!)

## Три роли (§14)
- Admin = создаёт ВСЁ (пользователей, группы, доступы, привязку teacher→group)
- Teacher = создаёт сценарии + назначает своим группам + аналитика
- Student = проходит кейсы + свои результаты
- Teacher и Student НЕ управляют пользователями/группами

## Стек
- Backend: FastAPI + SQLAlchemy 2 + PostgreSQL 16 + Alembic + pytest
- Frontend: React 19 + TS + @xyflow/react 12 + Zustand 5 + TanStack Query 5 + Tailwind 4 + Vite 6 + Vitest
- Infra: Docker Compose + Nginx + PostgreSQL 16
- Деплой: Docker images → tar → перенос на изолированный сервер

## Распределение задач
- Claude Opus 4.6: архитектура, бэкенд, бизнес-логика, graph_engine, grader, code review
- Gemini 3.1 Pro: фронтенд, React Flow, UI компоненты, тесты, быстрая генерация

## Антипаттерны (§17)
- НЕ писать код без теста
- НЕ хранить correct_value на клиенте
- НЕ оценивать ответы на клиенте (только server/grader_service)
- НЕ делать API-вызовы без loading state
- НЕ оставлять пустые экраны — всегда EmptyState
- НЕ hardcode цветов — Tailwind tokens
- НЕ PUT /graph на каждый drag — debounce 30s
- НЕ docker compose build на сервере ВМедА (нет интернета!)

## Скиллы (.agent/skills/)
Перед началом работы прочитать релевантные скиллы:
- react-flow-node-ts — для конструктора
- zustand-store-ts — для stores
- fastapi-router-py — для роутеров
- test-driven-development — для TDD
- postgres-best-practices — для БД

## Git
- Формат: feat|fix|test|docs|refactor: описание [tests]
- Каждый коммит содержит тесты
- code review: Claude Opus ревьюит код Gemini и наоборот
```
