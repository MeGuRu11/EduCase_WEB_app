# EpiCase — Architecture Decision Records (ADR)

> Документ, фиксирующий архитектурные решения и — что важнее — **отказы** от популярных паттернов.
> Существует, чтобы будущий агент или разработчик **не предложил добавить** Redis, Celery, CDN, Kubernetes или Prometheus через полгода, забыв специфику проекта.
>
> Производитель: Claude Opus 4.7 · Дата: 2026-04-17

---

## Контекст проекта — почему стандартные паттерны не подходят

EpiCase — это **не SaaS**. Это внутреннее приложение военно-медицинской академии с жёстко определёнными ограничениями:

| Параметр | Значение | Следствие |
|---|---|---|
| Одновременных пользователей | до **30** | Один процесс Uvicorn справляется с запасом |
| Серверов | **1** (физическая машина или VM) | Нет необходимости в балансировке, репликации, k8s |
| Интернет на сервере | **отсутствует** | Нельзя использовать CDN, облачные сервисы, внешние API, CI/CD-раннеры, Prometheus-remote-write |
| Размер данных | ≤ 1 ГБ за 5 лет | Шардирование и партиционирование — излишество |
| Профиль нагрузки | 1–2 пика в неделю по 45 мин (практические занятия) | Нет постоянного RPS, нечего оптимизировать |
| IT-команда в академии | 1–2 человека, уровень «установить Docker» | Любой лишний компонент повышает риск падения |

**Ключевой принцип:** каждый добавленный Docker-контейнер = +1 точка отказа на сервере, где нет интернета и нельзя быстро исправлять через `apt install`. Поэтому архитектура максимально **boring** — FastAPI + PostgreSQL + Nginx + React. Всё.

---

## ADR-001: Stateless JWT вместо Redis-сессий

**Статус:** Принято
**Контекст:** В веб-приложениях часто используют Redis для хранения session state. Это даёт горизонтальную масштабируемость, возможность принудительно завершать сессии, централизованный rate-limiting.

**Решение:** Используем stateless JWT access (8 ч) + refresh (7 дней) без Redis.

**Обоснование:**
- Один сервер → нет сценария «прилип к другой реплике»
- Нет требований немедленной инвалидации (logout == клиент стирает токен, серверу всё равно)
- Redis = +1 контейнер, +100 МБ RAM, +1 точка отказа
- Для rate-limiting login хватает поля `users.login_attempts` в PostgreSQL (§8.1)
- Для rate-limiting backup — in-memory throttle внутри процесса (§T.7)

**Когда пересматривать:** если появится требование «admin может принудительно разлогинить пользователя мгновенно» (сейчас нет).

**Альтернатива отклонена:** blacklist-таблица токенов в PostgreSQL — работает, но усложняет middleware. Вынесено в N-02 backlog.

---

## ADR-002: Docker Compose вместо Kubernetes

**Статус:** Принято
**Контекст:** Современные production-системы часто на k8s или подобных оркестраторах.

**Решение:** Docker Compose, 3 сервиса (db, server, client), один файл конфигурации.

**Обоснование:**
- k8s требует 3+ нод для HA, у нас 1 сервер
- k8s cluster setup требует знаний, которых нет у IT-отдела ВМедА
- `docker compose up -d` / `docker compose ps` / `docker compose logs` — три команды, которым IT можно обучить за 5 минут
- Воспроизводимость деплоя уже обеспечена: `docker save → tar → flash drive → docker load`

**Когда пересматривать:** никогда. Даже если проект вырастет до 3 академий, это 3 независимых Docker Compose, а не k8s.

---

## ADR-003: Нет CDN, статика через Nginx

**Статус:** Принято
**Контекст:** CDN ускоряет раздачу статики в географически распределённых системах.

**Решение:** Nginx в Docker раздаёт `/usr/share/nginx/html` и `/media/*` напрямую.

**Обоснование:**
- Сервер в одном здании с пользователями, ping < 1 мс
- Нет интернета → нет доступа к CDN-провайдерам
- Nginx с `expires 7d` + `immutable` headers (§4.4) даёт нужный уровень кеширования

**Когда пересматривать:** никогда.

---

## ADR-004: BackgroundTasks + APScheduler вместо Celery/RabbitMQ

**Статус:** Принято
**Контекст:** Для «тяжёлых» задач в production обычно используют Celery + Redis/RabbitMQ как broker.

**Решение:** FastAPI `BackgroundTasks` для ad-hoc (restore backup, PDF-export), APScheduler `BackgroundScheduler` для cron-like задач (autobackup, auto-finish attempts, log cleanup).

**Обоснование:**
- Все «тяжёлые» задачи укладываются в секунды-минуты: `pg_dump` 5-10 с, PDF-export 2-3 с, XLSX-export <1 с
- 30 пользователей физически не могут создать очередь запросов, превышающую способности FastAPI
- Celery + RabbitMQ/Redis = +2 контейнера, сложная отладка
- APScheduler работает в том же процессе и восстанавливается при рестарте контейнера (если использовать `SQLAlchemyJobStore` с таблицей `apscheduler_jobs`)

**Код-паттерн:**
```python
# server/services/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger

scheduler = BackgroundScheduler(jobstores={
    "default": SQLAlchemyJobStore(url=DATABASE_URL, tablename="apscheduler_jobs")
})

def register_jobs():
    scheduler.add_job(backup_service.create_backup, CronTrigger(hour=3, minute=0),
                      id="daily_backup", replace_existing=True)
    scheduler.add_job(attempt_service.auto_finish_expired, "interval", seconds=60,
                      id="finish_expired", replace_existing=True)
    scheduler.add_job(log_service.cleanup_old_logs, CronTrigger(hour=4, minute=0),
                      id="cleanup_logs", replace_existing=True)
    scheduler.start()
```

Вызов `register_jobs()` — в `main.py` на startup event. Добавить таблицу `apscheduler_jobs` в миграцию 004.

**Когда пересматривать:** если появится задача >10 минут (например, ML-анализ кейсов). Маловероятно.

---

## ADR-005: PostgreSQL как единственный store (без Redis-кеша)

**Статус:** Принято
**Контекст:** Redis часто используют для кеширования часто запрашиваемых данных.

**Решение:** Только PostgreSQL 16. Никакого Redis. Если какой-то запрос медленный — оптимизировать индексами или materialized view.

**Обоснование:**
- Hot cache PostgreSQL (`shared_buffers`) покрывает всю активную workload
- Сценарии за день запрашиваются 10-30 раз, никакой нагрузки
- Аналитика heatmap (самый сложный запрос) выполняется ≤100 мс при GIN-индексе (§Q.1)
- Кеширование на уровне приложения — `functools.lru_cache` для immutable данных (роли, form_templates)

**Когда пересматривать:** если profiling покажет PostgreSQL CPU > 50% во время пика (крайне маловероятно при 30 user).

---

## ADR-006: Прямой nginx proxy без API Gateway

**Статус:** Принято
**Контекст:** В микросервисах обычно есть API Gateway (Kong, Traefik) для rate-limiting, auth, routing.

**Решение:** Nginx с тремя `location` блоками (`/`, `/api/`, `/media/`). Auth и rate-limiting — в FastAPI через `require_role()` и in-process throttle.

**Обоснование:**
- Монолит → нет multi-service routing
- Все auth-проверки на Python проще отлаживать
- Nginx `limit_req_zone` можно добавить без нового компонента, если понадобится

---

## ADR-007: Нет Prometheus/Grafana monitoring

**Статус:** Принято
**Контекст:** Стандартный стек мониторинга для прод-систем.

**Решение:** `system_logs` таблица + admin-панель с widget «Errors за 24 ч» + `docker stats` по запросу.

**Обоснование:**
- Prometheus + Grafana = +2 контейнера, сложная настройка
- Админ физически в 10 метрах от сервера, может прийти и посмотреть
- Push-метрики в облачный Grafana Cloud невозможны (нет интернета)
- Лог-основанный мониторинг через admin panel (§UI.6) покрывает 95% сценариев: «сколько было ошибок», «что сломалось»

**Когда пересматривать:** если проект масштабируется на >5 академий одновременно.

---

## ADR-008: Нет CI/CD в обычном понимании

**Статус:** Принято
**Контекст:** GitHub Actions / GitLab CI автоматизируют test + build + deploy.

**Решение:** **Локальный dev→prod workflow**, формализованный в скриптах:

```bash
# scripts/verify.sh                       — запустить перед любой отправкой на сервер
pytest server/tests/ -v
cd client && npx vitest run && npx tsc --noEmit
ruff check server/

# scripts/build-images.sh                  — собрать Docker-образы на dev-машине
docker compose build
docker save epicase-server -o dist/epicase-server-$(date +%Y%m%d).tar
docker save epicase-client -o dist/epicase-client-$(date +%Y%m%d).tar

# scripts/deploy-on-server.sh              — запускается на VMedA-сервере
cd /opt/epicase
docker load -i dist/epicase-server-*.tar
docker load -i dist/epicase-client-*.tar
docker compose up -d
curl http://localhost/api/ping || echo "DEPLOY FAILED"
```

**Обоснование:**
- GitHub Actions не имеет доступа к изолированному серверу
- Self-hosted runner на prod = дыра в изоляции
- Три bash-скрипта покрывают всё: verify → build → deploy

**Что добавить в проект:** папка `scripts/` с тремя скриптами выше + README.

---

## ADR-009: Тесты миграций Alembic обязательны

**Статус:** Принято (**новое требование**, вносится в §MIG ADDENDUM)
**Контекст:** Миграции на prod-сервере могут упасть из-за незамеченной ошибки в `upgrade()` / `downgrade()`. На изолированном сервере это катастрофа: нельзя быстро откатить, нет интернета для help.

**Решение:** Добавить в `server/tests/test_migrations.py` обязательные тесты:

```python
# server/tests/test_migrations.py
import pytest
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, inspect

def test_all_migrations_apply_from_scratch(postgres_test_url):
    """Накатываем все миграции на пустую БД — ни одна не должна упасть."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", postgres_test_url)
    command.upgrade(cfg, "head")
    # Проверяем, что все ожидаемые таблицы существуют
    engine = create_engine(postgres_test_url)
    tables = set(inspect(engine).get_table_names())
    expected = {"roles", "groups", "users", "teacher_groups",
                "disciplines", "topics", "form_templates", "form_template_fields",
                "scenarios", "scenario_nodes", "scenario_edges", "scenario_groups",
                "media_files", "attempts", "attempt_steps",
                "system_settings", "system_logs", "apscheduler_jobs"}
    assert expected.issubset(tables), f"Missing tables: {expected - tables}"

def test_all_migrations_downgrade_cleanly(postgres_test_url):
    """Откатываем все миграции до base — БД должна быть пустой."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", postgres_test_url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    engine = create_engine(postgres_test_url)
    tables = set(inspect(engine).get_table_names())
    assert tables <= {"alembic_version"}, f"Tables remained after downgrade: {tables}"

def test_migration_stairsteps(postgres_test_url):
    """Пошаговый upgrade: base → 001 → 002 → 003 → 004 → base.
    Ловит ошибки в отдельных миграциях, которые теряются при head."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", postgres_test_url)
    for rev in ["001", "002", "003", "004"]:
        command.upgrade(cfg, rev)
    for rev in ["003", "002", "001", "base"]:
        command.downgrade(cfg, rev)
```

**Где тестировать:** добавить в `conftest.py` fixture `postgres_test_url` с `testcontainers-postgresql`, либо вторая БД в docker-compose.test.yml. Тест обязан запускаться в CI-эквиваленте (verify.sh).

**Владелец:** Claude Opus 4.7 (`backend-architect`), добавляется в Stage 1 и обновляется в каждом Stage 2-4 после новой миграции.

---

## ADR-010: Health-check endpoint с реальными проверками

**Статус:** Принято (**новое требование**, вносится в §A ADDENDUM)
**Контекст:** `GET /api/ping` возвращает статичный `{"status":"ok"}`, который ничего не проверяет. Если БД недоступна, /ping всё равно вернёт 200.

**Решение:** Добавить `GET /api/admin/health` (admin-only) с реальными проверками:

```python
# server/routers/admin.py
@router.get("/health", response_model=HealthCheckOut)
def health_check(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    checks = {}

    # 1. DB connectivity
    try:
        db.execute(text("SELECT 1"))
        checks["db"] = {"status": "ok"}
    except Exception as e:
        checks["db"] = {"status": "error", "message": str(e)}

    # 2. Disk space
    import shutil
    free_gb = shutil.disk_usage("/app/data").free / (1024**3)
    checks["disk"] = {"status": "ok" if free_gb > 1.0 else "warning", "free_gb": round(free_gb, 2)}

    # 3. Recent backup
    last_backup = backup_service.get_latest_backup_age_hours()
    checks["backup"] = {
        "status": "ok" if last_backup is not None and last_backup < 25 else "warning",
        "last_backup_hours_ago": last_backup,
    }

    # 4. Scheduler alive
    checks["scheduler"] = {"status": "ok" if scheduler.running else "error"}

    # 5. Error count last 24h
    err_count = db.query(SystemLog).filter(
        SystemLog.level == "ERROR",
        SystemLog.created_at > datetime.utcnow() - timedelta(hours=24),
    ).count()
    checks["errors_24h"] = {"status": "ok" if err_count < 10 else "warning", "count": err_count}

    overall = "ok" if all(c["status"] == "ok" for c in checks.values()) else "warning"
    return HealthCheckOut(status=overall, checks=checks)
```

**Использование:** виджет в `AdminDashboard.tsx` с цветовой индикацией (success/warning/danger), опрос раз в 60 с.

**Владелец:** Claude Opus 4.7 (endpoint) + Codex GPT 5.5 (widget в AdminDashboard), Stage 4 + Stage 9.

---

## ADR-011: In-app error alerts в AdminDashboard

**Статус:** Принято (**новое требование**, вносится в §UI ADDENDUM)
**Контекст:** Email-алерты невозможны (нет SMTP в LAN). Admin должен замечать проблемы до того, как их заметят пользователи.

**Решение:** Виджет «System Health» в `AdminDashboard.tsx`, отображающий:
- Результат `GET /api/admin/health` (живой статус)
- Последние 5 ERROR-логов (из `GET /api/admin/logs?level=ERROR&per_page=5`)
- Счётчик ошибок за 24 ч
- Кнопка «Посмотреть все логи»

**Цвета по статусу** (из DESIGN_SYSTEM §2.2):
- Все `ok` → зелёный badge
- Есть `warning` → жёлтая плашка + предупреждение
- Есть `error` → красная плашка + звуковое уведомление (если admin на дашборде)

**Обоснование:** Admin приходит на дашборд раз в день-два, этого достаточно для академии. Звуковое уведомление — чтобы привлечь внимание, если admin оставил открытый дашборд на втором мониторе.

**Владелец:** Codex GPT 5.5 (`frontend-developer`), Stage 9.

---

## ADR-012: Deploy workflow формализован в `scripts/`

**Статус:** Принято (**новое требование**)
**Контекст:** Сейчас в `§18.5` деплой описан прозой. Нужны воспроизводимые скрипты.

**Решение:** Папка `scripts/` в корне проекта с 4 скриптами:

```
scripts/
├── verify.sh              — локально: ruff + pytest + vitest + tsc
├── build-images.sh        — локально: docker compose build + docker save → dist/
├── package-release.sh     — локально: собирает tar+sha256 для переноса
└── deploy-on-server.sh    — на сервере: docker load + up -d + health check
```

Полное содержимое скриптов — в §SCALE ADDENDUM.

**Владелец:** Claude Opus 4.7, добавляется в Stage 10 (integration).

---

## ADR-013: At-rest БД encryption отложено до V2

**Статус:** Принято (принятый риск для MVP)
**Контекст:** PostgreSQL volume хранится на диске в открытом виде. При физической компрометации сервера — вся БД с данными медицинских кейсов, логами попыток, пользовательскими данными доступна злоумышленнику.

**Решение:** в MVP v1.0 **не шифруем** БД at-rest. В V2 — план: LUKS на `/var/lib/postgresql/data`, ключ вводится admin при старте сервера.

**Обоснование:**
- IT-отдел ВМедА — 2 человека, часть процедур ещё в освоении
- LUKS требует обучения (ввод ключа при каждом boot)
- В контексте изолированной LAN физический доступ к серверу контролируется самой академией
- Контекст MVP — набрать функциональность, не перегрузить операции

**Митигации в v1.0:**
- `scripts/package-release.sh` считает checksums → защита от подмены образов при транспортировке
- `docker-compose.yml` запускает postgres в отдельной сети → не exposed наружу
- Backup файлы — на том же диске, но в отдельной директории с ограниченными правами (700)
- При каждом release — проверить права `/var/lib/postgresql/` (не 777, должно быть postgres:postgres 700)

**Когда пересматривать:**
- Если регулятор (Роскомнадзор, ФСТЭК) потребует
- При масштабировании на несколько академий (несколько независимых серверов → сложнее контролировать физически)
- При любом инциденте physical breach

**Источник:** `BEST_PRACTICES.md §B.2.2 E-19` — OWASP A02 Cryptographic Failures.

---

## ADR-014: Ruflo (Claude-Flow) не используется как runtime-зависимость

**Статус:** Принято (с частичной интеграцией 3 паттернов)
**Контекст:** [Ruflo](https://github.com/ruvnet/ruflo) (31.9k⭐, 6067+ коммитов, v3.5) — популярная enterprise-платформа мульти-агентной оркестрации для Claude Code. Предоставляет hive-mind swarms, 313 MCP tools, 64 типа агентов, SPARC methodology, Byzantine consensus, neural training pipeline и dual-mode Claude+Codex coordination.

На первый взгляд — прямое попадание в нашу пару Claude Opus 4.7 + Codex GPT 5.5.

**Решение:** Ruflo **не устанавливается** как зависимость EpiCase. Используем только 3 паттерна **концептуально** (без самого инструмента):
1. Statusline script в `.claude/statusline.sh` (собственная реализация, ~50 строк bash)
2. Post-stage hook в `.claude/hooks/post-stage.sh` (собственная реализация, ~50 строк bash)
3. SPARC mental model в `CLAUDE.md` (adapted for one-agent-per-stage)

**Обоснование отказа от полной интеграции:**

| Причина | Детали |
|---|---|
| **Alpha-quality** | 1470+ релизов, пакеты `@alpha`/`v2-alpha`/`v3alpha`, активное breaking API. Для медицинского проекта ВМедА с многолетним циклом поддержки — недопустимо. |
| **Требует `--dangerously-skip-permissions`** | Installation guide Ruflo явно предписывает `claude --dangerously-skip-permissions`. Отключать защиты Claude Code в проекте с медицинскими данными нельзя. |
| **Требует интернет на сервере** | `npx ruflo@latest`, npm registry, Docker Hub v2-alpha образ. Наш prod — изолированная LAN без интернета (ADR-003, ADR-008). |
| **Enterprise-сложность избыточна** | Hive-mind / Byzantine consensus / neural training / 64 типа агентов — для 30 пользователей. 30-дневный проект на 16 600 строк. Молоток для забивания кнопки. |
| **Конфликт с существующей архитектурой** | `AGENT_ROSTER.md` уже определяет 5 sub-agents Claude + 4 Codex с чёткой раскладкой. Ruflo предлагает заменить это на иерархию queen→workers — пересборка существующей работающей структуры без ценности. |
| **Философский mismatch** | Ruflo про **autonomous self-learning swarms** (84.8% SWE-Bench solve rate автоматически). EpiCase про **human-in-the-loop с жёстким TDD**, каждый commit проходит ревью. Разные парадигмы. |
| **SQLite `.swarm/memory.db`** vs наш MEMORY.md | Ruflo пишет состояние в бинарный SQLite с HNSW vector index. Наш MEMORY.md — текстовый файл в git, читается человеком, версионируется. Простая и прозрачная альтернатива. |
| **313 MCP tools** vs наш 1 | У нас Context7 — единственный MCP (для up-to-date docs). Минимум атакующей поверхности, минимум в ADR. 313 MCP — это сотни точек отказа. |

**Что заимствуем концептуально (3 паттерна):**

### A. Statusline (собственная реализация)

Ruflo показывает в статусбаре Claude Code:
```
▊ Ruflo V3 ● ruvnet │ ⎇ main │ Opus 4.7 │ ●42% ctx │ $0.15 │ 🏗️ DDD [●●●●○] 4/5
```

Наша реализация (`.claude/statusline.sh`, `settings.json → statusLine`):
```
▊ EpiCase ● main │ opus-4-7 │ ctx:42% │ S1 │ 🧪 12/0
```

Показывает: git branch, модель, context usage, текущий Stage (из MEMORY.md), test counts. Без зависимостей, ~50 строк bash. Читает JSON из stdin, gracefully fallback если stdin пустой.

### B. Post-stage hook (собственная реализация)

Ruflo имеет обширную hooks-систему (session, agent, task, tool, memory, swarm, file, command events). Мы берём **одну** полезную идею: hook после завершения stage.

`.claude/hooks/post-stage.sh`:
- Находит в MEMORY.md последний незавершённый stage
- Меняет `[ ]` на `[x]`
- Обновляет `Last Updated` на сегодняшнюю дату
- Пересчитывает количество pytest/vitest тестов
- Напоминает обновить `Next Action`

Запускается вручную после commit: `bash .claude/hooks/post-stage.sh N` или через auto-detect из последнего commit message.

### C. SPARC methodology (mental model в CLAUDE.md)

Ruflo использует SPARC (Specification → Pseudocode → Architecture → Refinement → Completion) с hive-mind swarm'ами. Мы берём **только концепцию**, адаптированную под нашу модель «один агент — один stage»:

- **S**pec → читаем `PROJECT_DESIGN` + `ADDENDUM`
- **P**seudocode → пишем failing pytest/vitest (TDD RED)
- **A**rch → консультируемся с ADR, новые зависимости только через новый ADR
- **R**efine → реализация до GREEN
- **C**omplete → full suite green → commit на stage boundary + post-stage hook

Это не swarm-SPARC от Ruflo, это простая последовательность — зафиксировано в CLAUDE.md под разделом «Methodology: SPARC-TDD».

**Когда пересматривать ADR-014:**

Никогда — если проект остаётся в рамках 30 пользователей одного учреждения. Пересмотр возможен при:
- Масштабировании на ≥5 академий одновременно (даже тогда — скорее k8s + service mesh, а не Ruflo)
- Переходе на public cloud с интернет-доступом на всех серверах
- Появлении у Ruflo стабильной v4 с LTS-гарантиями и dry-run режимом

---

## ADR-015: Package layout — `server/` как workspace root с plain-imports

**Статус:** Принято (2026-04-20, Stage 1 precondition)
**Контекст:** В стартере и PROJECT_DESIGN `§5.1` код импортировал модули как `from server.config import ...`, `from server.models.user import User`. Это подразумевает, что `server` — Python-пакет, а репозиторий — workspace-корень.

При деплое в Docker сборка устроена иначе:

```dockerfile
# server/Dockerfile
WORKDIR /app
COPY . .                                    # содержимое server/ → /app
CMD ["uvicorn", "main:app", ...]            # импорт top-level, без префикса
```

Build-контекст `./server` копируется в `/app`, поэтому внутри контейнера на sys.path лежит `/app`, а модули доступны как `config`, `main`, `models.user`. Префикс `server.` изнутри контейнера не резолвится (ModuleNotFoundError), и uvicorn падает на старте.

Попытки оставить `server.X`-стиль и переписать Dockerfile (`COPY . /app/server` + `CMD uvicorn server.main:app`) на практике приводят к раздвоению: host-среда (pytest из корня) и container-среда требуют разного `PYTHONPATH`, что размывает воспроизводимость.

**Решение:** фиксируем `server/` как workspace root. Весь backend-код использует **plain imports**: `from config import ...`, `from models.user import User`, `from services.auth_service import AuthService`. Префикс `server.` не применяется нигде.

Под это настроено:

1. **`server/Dockerfile`** — `WORKDIR /app` + `COPY . .` + `CMD ["uvicorn", "main:app", ...]`
2. **`server/main.py`** — `from config import ...`, `from database import ...`, `from routers import ...`
3. **`mypy.ini`** (корень репозитория) — `mypy_path = server`, `explicit_package_bases = True`
4. **`pyproject.toml` / `pytest.ini`** — `pythonpath = ["server"]`, `testpaths = ["server/tests"]`, чтобы `pytest` из корня репозитория импортировал модули так же, как uvicorn внутри контейнера
5. **`server/alembic.ini`** — `script_location = migrations` (путь относительно CWD `server/`), миграции импортируют модели `from models import ...`
6. **Суб-агенты** — `.claude/agents/backend-architect.md` (и неявно все остальные) получают правило: «в server/ пиши `from services.X import Y`, не `from server.services.X import Y`»

**Исключение:** в корневых утилитах вне `server/` (например, `scripts/` bash-скрипты) — не применимо, они не импортируют Python-модули из `server/`.

**Обоснование:**
- Один источник истины для PYTHONPATH (host = container = `/app ≡ server/`)
- Минимум конфигурации: один `mypy.ini`, один `pyproject.toml`
- Dockerfile остаётся «dumb copy» без хитростей с layout
- Pytest из корня работает идентично pytest из `server/` (pythonpath абсолютный)

**Альтернативы, отклонённые:**

| Вариант | Почему нет |
|---|---|
| `server` как Python-пакет (`server/server/` + `setup.py`) | Дублирует имя каталога, усложняет Docker layer caching, нестандартно для FastAPI-шаблонов |
| `src/`-layout (`src/epicase/...`) | Требует переписать все документы (§5.1, §3, §R, §S). Преимущество — только формальное соответствие PEP 420 |
| Смешанный (`from server.X` в проде + pytest с `sys.path.insert`) | Раздвоение путей импорта. Каждая новая миграция/тест требует согласования двух режимов. Путь к регрессиям |

**Когда пересматривать:** если проект извлекается в multi-service monorepo (например, добавляется отдельный `auth-service/`) или если packaging через `pip install .` становится требованием (нет в плане v1.0).

**Следствия для Stage 1:**
- В `server/dependencies.py`, `server/database.py`, `server/models/*.py`, `server/migrations/env.py` остаточные `from server.X` — переписать на plain.
- Все новые модули Stage 1+ (`services/`, `routers/`, `schemas/`, `models/`) — исключительно plain imports.
- `conftest.py` НЕ делает `sys.path.insert(0, ...)`. Конфигурация через `pyproject.toml` / `pytest.ini`.

**Владелец:** Claude Opus 4.7 (`backend-architect`). Исполнено в precondition Stage 1.

---

## Сводка ADR (обновлено)

| Идея из транскрипции | Решение | ADR |
|---|---|---|
| Redis для sessions | Отклонено | ADR-001 |
| k8s / auto-scaling | Отклонено | ADR-002 |
| CDN | Отклонено | ADR-003 |
| Celery/RabbitMQ | Отклонено (BackgroundTasks + APScheduler) | ADR-004 |
| Redis cache | Отклонено | ADR-005 |
| API Gateway | Отклонено (Nginx proxy) | ADR-006 |
| Prometheus/Grafana | Отклонено | ADR-007 |
| CI/CD внешний | Отклонено (local scripts) | ADR-008 |
| **Тесты миграций** | ✅ **Принято** | **ADR-009** |
| **Health-check endpoint** | ✅ **Принято** | **ADR-010** |
| **In-app error alerts** | ✅ **Принято** | **ADR-011** |
| **Deploy scripts** | ✅ **Принято** | **ADR-012** |
| **At-rest БД encryption** | 🟡 Отложено до V2 (принятый риск) | **ADR-013** |
| **Ruflo / Claude-Flow как runtime** | 🟡 Не используем; взяты 3 концепт. паттерна | **ADR-014** |
| **Package layout: `server/` = workspace root, plain imports** | ✅ **Принято** | **ADR-015** |
| Шардирование БД | Отклонено | (не ADR — слишком очевидно) |
| Логирование | Уже есть | ADDENDUM §T.4 |

**Итого:** 15 ADR. Из system-design-primer интегрированы 5 паттернов (REST, OWASP, ACID, indexing, latency) — см. `BEST_PRACTICES.md`. Из Ruflo — 3 концептуальных паттерна (statusline, post-stage hook, SPARC-TDD) без установки самого инструмента.
