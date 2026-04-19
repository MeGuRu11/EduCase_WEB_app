# EpiCase — PROJECT_DESIGN ADDENDUM v1.1

> Патч-документ к `docs/PROJECT_DESIGN_EPICASE_v1.md` v1.0.
> Закрывает все 8 CRITICAL и 19 IMPORTANT пробелов из `AUDIT_REPORT.md`.
> Читается **совместно** с основным дизайн-документом. При конфликте — приоритет у этого файла.
>
> **Когда v1.1 вольётся в основной документ**, можно удалить этот аддендум и обновить `CHANGELOG`.

---

## Оглавление

- **§X.** Переопределение §20 (агенты Claude + Codex, а не Gemini) — CRITICAL C-02
- **§R.** Pydantic-схемы (полные определения всех `*Out`/`*In`) — CRITICAL C-03
- **§S.** Seed data (роли, admin, дисциплины, form_templates) — CRITICAL C-06
- **§T.** Security и операционные правила (password, bulk CSV, restore, rate limit, CORS, logs) — CRITICAL C-05, C-07 + IMPORTANT I-01, I-06, I-07, I-11, I-14
- **§U.** Поведенческие спецификации (таймер, idle timeout, ProtectedRoute) — CRITICAL C-04, C-08 + IMPORTANT I-09
- **§A.** Дополнительные эндпоинты и уточнения API — IMPORTANT I-10, I-12, I-13, I-15, I-16, I-19
- **§B.** Уточнения по типам узлов и оцениванию — IMPORTANT I-03, I-17
- **§E.** Эндпоинты экспорта отчётов — IMPORTANT I-04
- **§MIG.** Нумерация миграций Alembic — ERRATA E-06
- **§Q.** Дополнительные индексы БД — IMPORTANT I-02
- **§M.** Настройка Context7 MCP — IMPORTANT I-08
- **§UI.** Спецификации недостающих экранов T-4, T-5, T-6, S-5, A-2, A-3 — IMPORTANT I-05, I-18
- **§D.** Ссылка на дизайн-систему — CRITICAL C-01
- **§SCALE.** Operational patterns (health-check, migration tests, deploy scripts) — ADR-009..012

---

## §SCALE. Операционные паттерны (ADR-009, ADR-010, ADR-011, ADR-012)

> Новые требования, вытекающие из архитектурного ревью (см. `docs/ARCHITECTURE_DECISIONS.md`).
> НЕ про масштабирование в облачном смысле — у нас LAN с 30 пользователями. Про **устойчивость**: защита от незамеченных проблем (health), защита от плохих миграций, воспроизводимый деплой.

### SCALE.1 Тесты миграций Alembic (ADR-009)

**Цель:** поймать ошибки в `upgrade()`/`downgrade()` ДО того, как они попадут на изолированный сервер, где нет интернета для быстрого фикса.

**Три обязательных теста в `server/tests/test_migrations.py`:**

| Тест | Что проверяет |
|---|---|
| `test_all_migrations_apply_from_scratch` | `upgrade base → head` не падает, все ожидаемые таблицы созданы |
| `test_all_migrations_downgrade_cleanly` | `upgrade head → downgrade base` оставляет только `alembic_version` |
| `test_migration_stairsteps` | Пошаговый upgrade `001→002→003→004` + обратный downgrade — ловит ошибки в отдельных миграциях |

Код тестов — в `ARCHITECTURE_DECISIONS.md` ADR-009. Fixture `postgres_test_url` — через `testcontainers-postgresql` (добавить в `requirements-dev.txt`):

```
testcontainers[postgres]==4.8.2
```

**Запуск:** тесты включены в `pytest server/tests/` suite, обязательный запуск перед каждым commit (автоматизировано в `scripts/verify.sh`).

**Владелец:** Claude Opus 4.7 (`backend-architect`). Добавляется в Stage 1 после первой миграции, обновляется в каждом Stage 2-4.

### SCALE.2 Health-check endpoint (ADR-010)

**Эндпоинт:** `GET /api/admin/health` (admin only).

**Pydantic схема** (добавить в `server/schemas/system.py`):

```python
class HealthCheck(BaseModel):
    status: Literal["ok", "warning", "error"]
    message: str | None = None
    # дополнительные поля — зависят от типа проверки

class HealthCheckOut(BaseModel):
    status: Literal["ok", "warning", "error"]
    checks: dict[str, dict]  # имя проверки → {"status": ..., ...метрики}
    checked_at: datetime
```

**Полный код endpoint** — в `ARCHITECTURE_DECISIONS.md` ADR-010.

**Проверки:** db connectivity, disk space (> 1 GB свободно), backup age (< 25 ч), scheduler alive, errors за 24 ч (< 10).

**Логика статусов:**
- Все `ok` → overall `ok` (зелёный)
- Есть `warning` → overall `warning` (жёлтый)
- Есть `error` → overall `error` (красный)

**Владелец:** Claude Opus 4.7 (endpoint — Stage 4). Клиентский widget — Codex GPT 5.4 (Stage 9).

### SCALE.3 In-app error alerts в AdminDashboard (ADR-011)

**Замена SMTP-алертов** (их нельзя — нет интернета) на живой widget в `AdminDashboard.tsx`:

```tsx
// components/admin/HealthWidget.tsx
export function HealthWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api.admin.getHealth(),
    refetchInterval: 60_000, // раз в минуту
  });

  const { data: recentErrors } = useQuery({
    queryKey: ["admin", "logs", "recent-errors"],
    queryFn: () => api.admin.getLogs({ level: "ERROR", per_page: 5 }),
    refetchInterval: 60_000,
  });

  // UI: зелёная плашка если overall=ok, жёлтая если warning, красная если error
  // Детали проверок в раскрывающемся списке
  // Последние 5 ERROR-логов с временем и сообщением
  // Кнопка "Посмотреть все логи" → /admin/system?tab=logs
}
```

**Звуковое уведомление** при изменении overall статуса на `warning`/`error`:

```tsx
const prevStatus = useRef(data?.status);
useEffect(() => {
  if (prevStatus.current === "ok" && data?.status !== "ok") {
    new Audio("/sounds/alert.mp3").play().catch(() => {});  // fail silently если звук отключён
  }
  prevStatus.current = data?.status;
}, [data?.status]);
```

**Обязательно:** rate-limit звука (не чаще 1 раза в 5 мин). Файл `public/sounds/alert.mp3` — короткий ненавязчивый звук (≤1 с).

**Accessibility:** визуальный индикатор работает и без звука. Звук — только усиление.

**Владелец:** Codex GPT 5.4 (`frontend-developer`), Stage 9.

### SCALE.4 Deploy scripts (ADR-012)

Добавить в корень проекта папку `scripts/`:

```
scripts/
├── verify.sh              — локальная проверка перед push
├── build-images.sh        — сборка Docker-образов
├── package-release.sh     — упаковка релиза в tar
├── deploy-on-server.sh    — деплой на сервере ВМедА
└── README.md              — как использовать
```

#### `scripts/verify.sh`

```bash
#!/usr/bin/env bash
# Запускается перед любым commit или push. Ничего не меняет, только проверяет.
set -euo pipefail

echo "==> Python: ruff"
ruff check server/

echo "==> Python: pytest"
pytest server/tests/ -v --tb=short

echo "==> TypeScript: tsc --noEmit"
cd client && npx tsc --noEmit

echo "==> TypeScript: vitest"
npx vitest run

echo "==> ✓ All checks passed"
```

#### `scripts/build-images.sh`

```bash
#!/usr/bin/env bash
# Собирает Docker-образы на dev-машине (с интернетом).
set -euo pipefail

VERSION=$(git describe --tags --always --dirty)
mkdir -p dist/

echo "==> Building server image"
docker compose build server

echo "==> Building client image"
docker compose build client

echo "==> ✓ Images built, version: $VERSION"
echo "Next: run scripts/package-release.sh to create tar archives"
```

#### `scripts/package-release.sh`

```bash
#!/usr/bin/env bash
# Упаковывает образы в tar для переноса на изолированный сервер.
set -euo pipefail

VERSION=$(git describe --tags --always --dirty)
RELEASE_DIR="dist/epicase-$VERSION"
mkdir -p "$RELEASE_DIR"

echo "==> Saving images to tar"
docker save epicase-server:latest -o "$RELEASE_DIR/epicase-server.tar"
docker save epicase-client:latest -o "$RELEASE_DIR/epicase-client.tar"
docker pull postgres:16-alpine
docker save postgres:16-alpine -o "$RELEASE_DIR/postgres-16-alpine.tar"

echo "==> Copying config files"
cp docker-compose.yml "$RELEASE_DIR/"
cp .env.example "$RELEASE_DIR/"
cp -r nginx/ "$RELEASE_DIR/"
cp scripts/deploy-on-server.sh "$RELEASE_DIR/"

echo "==> Computing checksums"
cd "$RELEASE_DIR" && sha256sum *.tar > checksums.sha256

echo "==> Creating tarball"
cd dist/ && tar -czf "epicase-$VERSION.tar.gz" "epicase-$VERSION/"

echo "==> ✓ Release packaged: dist/epicase-$VERSION.tar.gz"
echo "Transfer this file to the VMedA server via flash drive."
```

#### `scripts/deploy-on-server.sh`

```bash
#!/usr/bin/env bash
# Запускается на сервере ВМедА (без интернета).
# Предполагает, что пользователь уже распаковал релиз и находится в его папке.
set -euo pipefail

INSTALL_DIR="/opt/epicase"

echo "==> Verifying checksums"
sha256sum -c checksums.sha256 || { echo "Checksum verification FAILED"; exit 1; }

echo "==> Loading Docker images"
docker load -i epicase-server.tar
docker load -i epicase-client.tar
docker load -i postgres-16-alpine.tar

echo "==> Staging config to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp docker-compose.yml "$INSTALL_DIR/"
cp -rn nginx/ "$INSTALL_DIR/"  # -n: не перезаписывать (возможны местные изменения)

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    echo "==> .env not found, copying from example"
    cp .env.example "$INSTALL_DIR/.env"
    echo ""
    echo "!!! ACTION REQUIRED !!!"
    echo "Edit $INSTALL_DIR/.env and set:"
    echo "    POSTGRES_PASSWORD=<strong password>"
    echo "    JWT_SECRET=<output of: openssl rand -hex 32>"
    echo ""
    echo "Then re-run: docker compose up -d"
    exit 0
fi

cd "$INSTALL_DIR"

echo "==> Starting services"
docker compose up -d

echo "==> Waiting for health check"
sleep 15

for i in 1 2 3 4 5; do
    if curl -sf http://localhost/api/ping > /dev/null; then
        echo "==> ✓ Deployment successful"
        docker compose ps
        exit 0
    fi
    echo "  attempt $i failed, waiting 10s..."
    sleep 10
done

echo "==> ✗ Deployment verification FAILED"
echo "Check logs: docker compose logs"
exit 1
```

Все скрипты должны быть `chmod +x scripts/*.sh`.

**Владелец:** Claude Opus 4.7. Добавить в Stage 10 (integration) вместе с README.md деплоя.

---

## §X. Переопределение §20 — агентная модель (заменяет §20 в v1.0)

### X.1 Текущая пара агентов

Проект разрабатывается в связке **Claude Opus 4.7 (Claude Code) + Codex GPT 5.4 (Codex CLI)**. Упоминание Gemini 3.1 Pro в §20 оригинального документа — **устаревшее**, игнорировать.

### X.2 Источники правды для каждого агента

| Агент | Корневой файл | Правила по путям | Суб-агенты | Команды |
|---|---|---|---|---|
| **Claude Opus 4.7** | `CLAUDE.md` → `AGENTS.md` | `.claude/rules/{api,backend,frontend}.md` | `.claude/agents/*.md` (5 штук) | `.claude/commands/*.md` (4 штуки) |
| **Codex GPT 5.4** | `AGENTS.md` (через `project_doc_fallback_filenames`) | наследуется из `AGENTS.md` | `.codex/agents/*.toml` (4 штуки) | — |

### X.3 Распределение зон ответственности

Подробный per-stage разбор — в `docs/AGENT_TASKS.md`. Краткая сводка:

- **Claude Opus 4.7:** всё backend, архитектура, безопасность, `graph_engine`, `grader_service`, `backup_service`, миграции, code-review, финальная сборка образов.
- **Codex GPT 5.4:** всё frontend (React/TS), UI-scaffolding, Zustand stores, TanStack Query hooks, vitest-тесты компонентов, шаблонные backend-тесты (happy/auth/validation) под ревью Claude.

### X.4 MCP для Claude Code

Добавлен файл `.claude/mcp/context7.json` (см. §M.1). До этого Context7 был подключён только в `.codex/config.toml`.

---

## §R. Pydantic-схемы — полные определения

Все схемы — Pydantic v2. Файл — `server/schemas/`. Для TypeScript-типов на клиенте — зеркальные определения в `client/src/types/` (Codex создаёт автоматически после публикации схем на бэке).

### R.1 Auth — `server/schemas/auth.py`

```python
from pydantic import BaseModel, Field
from .user import UserOut

class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)

class RefreshRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None  # None для /refresh (только access_token)
    token_type: str = "bearer"
    expires_in: int  # секунд до истечения access_token
    user: UserOut | None = None  # присутствует только в /login
```

### R.2 User — `server/schemas/user.py`

```python
from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, Field, AfterValidator
import re

PASSWORD_REGEX = re.compile(r"^(?=.*[A-Za-zА-ЯЁа-яё])(?=.*\d)(?=.*[!@#$%^&*\-_=+]).{8,128}$")

def check_password_complexity(v: str) -> str:
    if not PASSWORD_REGEX.match(v):
        raise ValueError(
            "Пароль должен содержать минимум 8 символов, хотя бы одну букву, "
            "одну цифру и один символ из: ! @ # $ % ^ & * - _ = +"
        )
    return v

# Переиспользуемый тип — вешается на любое поле Pydantic v2 через Annotated
Password = Annotated[str, AfterValidator(check_password_complexity), Field(min_length=8, max_length=128)]

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    password: Password
    full_name: str = Field(min_length=2, max_length=200)
    role_id: int
    group_id: int | None = None

class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    group_id: int | None = None
    avatar_path: str | None = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: Password

class ResetPasswordRequest(BaseModel):
    new_password: Password

class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str  # "student" | "teacher" | "admin" (из join с roles.name)
    role_id: int
    group_id: int | None
    group_name: str | None  # из join с groups, если group_id есть
    avatar_url: str | None  # полный URL: /media/avatars/{filename} или null
    is_active: bool
    must_change_password: bool  # см. §S.2
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

class UserBulkCSVRow(BaseModel):
    """Одна строка CSV для bulk-upload. См. §T.6."""
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    password: Password
    full_name: str = Field(min_length=2, max_length=200)
    role: str = Field(pattern=r"^(student|teacher|admin)$")
    group_name: str | None = None  # name группы, не id — admin так удобнее
    email: str | None = None  # reserved для V2 (сейчас в модели нет поля)

class UserBulkResult(BaseModel):
    created: int
    errors: list[dict]  # [{"row": 3, "detail": "..."}]
```

### R.3 Group — `server/schemas/group.py`

```python
from datetime import datetime
from pydantic import BaseModel, Field

class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)

class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None

class GroupOut(BaseModel):
    id: int
    name: str
    description: str | None
    teachers: list["TeacherShort"]  # привязанные через teacher_groups
    student_count: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class TeacherShort(BaseModel):
    id: int
    full_name: str

class GroupMemberAdd(BaseModel):
    user_id: int

class GroupTeacherAssign(BaseModel):
    teacher_id: int
```

### R.4 Scenario — `server/schemas/scenario.py`

```python
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal, Any

NodeType = Literal["start", "data", "decision", "form", "text_input", "final"]
ScenarioStatus = Literal["draft", "published", "archived"]

class ScenarioCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    disease_category: str | None = Field(default=None, max_length=100)
    topic_id: int | None = None
    time_limit_min: int | None = Field(default=None, ge=1, le=480)
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    passing_score: int = Field(default=60, ge=0, le=100)

class ScenarioUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    disease_category: str | None = None
    topic_id: int | None = None
    time_limit_min: int | None = Field(default=None, ge=1, le=480)
    max_attempts: int | None = Field(default=None, ge=1, le=100)
    passing_score: int | None = Field(default=None, ge=0, le=100)
    cover_path: str | None = None

class ScenarioListOut(BaseModel):
    """Краткая карточка. НЕ включает граф."""
    id: int
    title: str
    description: str | None
    disease_category: str | None
    cover_url: str | None
    status: ScenarioStatus
    author_id: int | None
    author_name: str | None
    time_limit_min: int | None
    max_attempts: int | None
    passing_score: int
    version: int
    node_count: int
    assigned_groups: list[int]  # id групп
    my_attempts_count: int = 0  # для студента; 0 для teacher/admin
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class NodeOut(BaseModel):
    """Полный узел. ВНИМАНИЕ: для student-роли поле node_data санитизируется
    (убираются correct_value, correct_values, score у опций). См. §T.2."""
    id: str
    type: NodeType
    position: dict  # {"x": float, "y": float} — React Flow format
    data: dict  # node_data JSONB

class EdgeOut(BaseModel):
    """Ребро. ВНИМАНИЕ: для student-роли is_correct и score_delta скрыты."""
    id: str
    source: str  # source node_id
    target: str  # target node_id
    label: str | None = None
    data: dict = {}  # {"is_correct": bool, "score_delta": float}  — только teacher/admin

class ScenarioFullOut(ScenarioListOut):
    """Сценарий с полным графом."""
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    published_at: datetime | None

class GraphIn(BaseModel):
    """Тело PUT /api/scenarios/{id}/graph — полная замена."""
    nodes: list[NodeOut]
    edges: list[EdgeOut]

class ScenarioAssign(BaseModel):
    group_id: int
    deadline: datetime | None = None

class PublishResult(BaseModel):
    status: ScenarioStatus
    errors: list[str] = []  # непустой список → 422
```

### R.5 Attempt — `server/schemas/attempt.py`

```python
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal

# Явный импорт NodeOut из scenario.py (не forward-reference строкой).
# В модуле attempt.py:
from server.schemas.scenario import NodeOut

AttemptStatus = Literal["in_progress", "completed", "abandoned"]
StepAction = Literal[
    "view_data",         # data / start / final — просто промотка
    "choose_option",     # decision
    "submit_form",       # form
    "submit_text",       # text_input
]

class AttemptStart(BaseModel):
    scenario_id: int

class AttemptStartOut(BaseModel):
    attempt_id: int
    attempt_num: int
    current_node: NodeOut  # прямой тип, не строка
    started_at: datetime
    time_limit_min: int | None
    expires_at: datetime | None  # если time_limit_min задан

class StepSubmit(BaseModel):
    node_id: str
    action: StepAction
    answer_data: dict
    # Форматы answer_data:
    #   choose_option: {"selected_option_id": "opt_2"} или {"selected_option_ids": [...]}
    #   submit_form:   {"fields": {"field_key": "value", ...}}
    #   submit_text:   {"text": "полный текст ответа"}
    #   view_data:     {}  — просто подтверждение промотки
    time_spent_sec: int = Field(ge=0, le=3600)

class StepResult(BaseModel):
    score: float
    max_score: float
    is_correct: bool | None  # None для data/start/final
    feedback: str
    details: dict = {}  # {"matched_keywords": [...], "missing_keywords": [...]}

class StepOut(BaseModel):
    step_result: StepResult
    next_node: NodeOut | None  # None → попытка завершена
    path_so_far: list[str]
    attempt_status: AttemptStatus

class AttemptSummaryOut(BaseModel):
    id: int
    scenario_id: int
    scenario_title: str
    attempt_num: int
    status: AttemptStatus
    total_score: float
    max_score: float
    score_pct: float
    passed: bool
    started_at: datetime
    finished_at: datetime | None
    duration_sec: int | None

class StepResultOut(BaseModel):
    """Детальный результат одного шага в итоговом отчёте."""
    step_id: int
    node_id: str
    node_type: str
    node_title: str
    action: str
    answer_data: dict
    score_received: float
    max_score: float
    is_correct: bool | None
    feedback: str | None
    time_spent_sec: int | None
    created_at: datetime

class AttemptResultOut(AttemptSummaryOut):
    path: list[str]  # последовательность node_id
    steps: list[StepResultOut]

class TimeRemaining(BaseModel):
    remaining_sec: int | None  # None если time_limit_min не задан
    expires_at: datetime | None
```

**Важно:** поскольку `NodeOut` импортируется из другого модуля, в Pydantic v2 достаточно прямого импорта — `model_rebuild()` нужен только при истинных forward references (строки-аннотации). Если понадобятся циклические импорты, используем `TYPE_CHECKING`-паттерн и явный `AttemptStartOut.model_rebuild()` в `schemas/__init__.py`.

### R.6 Analytics — `server/schemas/analytics.py`

```python
from pydantic import BaseModel
from typing import Optional

class StudentDashboardOut(BaseModel):
    total_scenarios: int
    completed_scenarios: int
    in_progress_scenarios: int
    avg_score: float
    best_score: float
    total_time_hours: float
    recent_attempts: list["AttemptSummaryOut"]

class ScoreDistributionOut(BaseModel):
    bins: list[int]  # [0, 20, 40, 60, 80, 100]
    counts: list[int]  # [2, 3, 7, 10, 3]

class WeakNodeOut(BaseModel):
    node_id: str
    title: str
    node_type: str
    visit_count: int
    avg_score_pct: float
    most_common_wrong_answer: Optional[str]

class PathAnalysisOut(BaseModel):
    correct_path_count: int
    incorrect_path_count: int
    most_common_wrong_node: Optional[WeakNodeOut]

class StudentRankingEntry(BaseModel):
    user_id: int
    full_name: str
    score: float
    duration_sec: int
    path: list[str]

class TeacherScenarioStatsOut(BaseModel):
    scenario_id: int
    scenario_title: str
    group_id: int | None
    group_name: str | None
    total_students: int
    completed: int
    in_progress: int
    avg_score: float
    score_distribution: ScoreDistributionOut
    path_analysis: PathAnalysisOut
    weak_nodes: list[WeakNodeOut]
    student_ranking: list[StudentRankingEntry]

class HeatmapNode(BaseModel):
    id: str
    title: str
    node_type: str
    visit_count: int
    avg_score_pct: float | None  # None для неоцениваемых

class HeatmapEdge(BaseModel):
    source: str
    target: str
    traverse_count: int
    is_correct: bool

class PathHeatmapOut(BaseModel):
    scenario_id: int
    group_id: int | None
    total_attempts: int
    nodes: list[HeatmapNode]
    edges: list[HeatmapEdge]

class AdminStatsOut(BaseModel):
    users_total: int
    students: int
    teachers: int
    admins: int
    scenarios_total: int
    published_scenarios: int
    attempts_today: int
    attempts_total: int
    db_size_mb: float
    last_backup_at: datetime | None
    last_backup_age_human: str | None  # "3 часа назад"
```

### R.7 System — `server/schemas/system.py`

```python
from datetime import datetime
from pydantic import BaseModel
from typing import Literal

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]

class SystemLogOut(BaseModel):
    id: int
    level: LogLevel
    message: str
    user_id: int | None
    username: str | None
    data: dict | None
    created_at: datetime

class BackupInfo(BaseModel):
    filename: str
    size_mb: float
    created_at: datetime
    age_human: str  # "2 ч назад"

class BackupCreateResult(BaseModel):
    filename: str
    size_mb: float
    duration_sec: float

class SysInfoOut(BaseModel):
    db_size_mb: float
    last_backup_at: datetime | None
    last_backup_age_human: str | None
    version: str  # APP_VERSION
    python_version: str
    uptime_hours: float
    maintenance_mode: bool  # см. §T.5

class SystemSettingUpdate(BaseModel):
    institution_name: str | None = None
    idle_timeout_min: int | None = Field(default=None, ge=5, le=120)
    max_file_upload_mb: int | None = Field(default=None, ge=1, le=50)
    backup_retention_days: int | None = Field(default=None, ge=7, le=365)
```

### R.8 Common — `server/schemas/common.py` (расширение)

```python
from pydantic import BaseModel, Field
from typing import Generic, TypeVar

T = TypeVar("T")

class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, le=10_000)
    per_page: int = Field(default=20, ge=1, le=100)
    search: str | None = Field(default=None, max_length=200)
    sort: str | None = None  # "created_at", "-updated_at", "full_name"

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    pages: int
    per_page: int

class ErrorResponse(BaseModel):
    detail: str
```

---

## §S. Seed data

Файл — `server/seed.py`. Запускается **ровно один раз** при первом старте (проверка: если таблица `roles` пуста → seed, иначе skip). Идемпотентность критична — повторный запуск не должен дублировать записи.

### S.1 Роли

```python
ROLES = [
    {"name": "student", "display_name": "Обучаемый"},
    {"name": "teacher", "display_name": "Преподаватель"},
    {"name": "admin",   "display_name": "Администратор"},
]
```

### S.2 Первый admin

```python
FIRST_ADMIN = {
    "username": "admin",
    "password": "Admin1234!",  # bcrypt hash, обязательная смена при первом входе
    "full_name": "Администратор системы",
    "role_id": 3,  # admin
    "must_change_password": True,  # добавить поле в модель в миграции 001
}
```

UI показывает модал «Необходимо сменить пароль» при `must_change_password=True`, блокирует всё остальное до смены.

### S.3 Дисциплины и темы

```python
DISCIPLINES = [
    {
        "id": 1,
        "name": "Общая эпидемиология",
        "order_index": 1,
        "topics": [
            {"name": "Эпидемиологическая диагностика", "order_index": 1},
            {"name": "Противоэпидемические мероприятия", "order_index": 2},
            {"name": "Иммунопрофилактика", "order_index": 3},
        ],
    },
    {
        "id": 2,
        "name": "Военная эпидемиология",
        "order_index": 2,
        "topics": [
            {"name": "Биологическая защита войск", "order_index": 1},
            {"name": "Санитарно-противоэпидемическое обеспечение", "order_index": 2},
        ],
    },
]
```

### S.4 Form templates

Это шаблоны формализованных документов, на которые опираются узлы типа `form`. Наполнение основано на реальных бланках Роспотребнадзора.

```python
FORM_TEMPLATES = [
    {
        "id": 1,
        "name": "Экстренное извещение (форма №58)",
        "template_key": "form_58",  # актуальная форма (058/у вместо устаревшей 23)
        "description": "Извещение об инфекционном заболевании, пищевом или остром профессиональном отравлении",
        "fields": [
            {"field_key": "diagnosis",        "field_label": "Диагноз",                             "field_type": "text",     "is_required": True,  "score_value": 3.0, "order_index": 1},
            {"field_key": "patient_fio",      "field_label": "ФИО пациента",                        "field_type": "text",     "is_required": True,  "score_value": 1.0, "order_index": 2, "validation_regex": r"^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.[А-ЯЁ]\.$"},
            {"field_key": "age",              "field_label": "Возраст",                             "field_type": "number",   "is_required": True,  "score_value": 1.0, "order_index": 3},
            {"field_key": "address",          "field_label": "Адрес",                               "field_type": "textarea", "is_required": True,  "score_value": 1.0, "order_index": 4},
            {"field_key": "date_onset",       "field_label": "Дата заболевания",                    "field_type": "date",     "is_required": True,  "score_value": 2.0, "order_index": 5},
            {"field_key": "date_detected",    "field_label": "Дата выявления",                      "field_type": "date",     "is_required": True,  "score_value": 2.0, "order_index": 6},
            {"field_key": "lab_confirmed",    "field_label": "Подтверждение лабораторное",          "field_type": "checkbox", "is_required": False, "score_value": 2.0, "order_index": 7},
            {"field_key": "hospitalized",     "field_label": "Госпитализирован",                    "field_type": "select",   "is_required": True,  "score_value": 1.0, "order_index": 8,
             "options_json": ["Да, в инфекционное отделение", "Да, в другое отделение", "Нет"]},
            {"field_key": "sent_by",          "field_label": "ФИО и должность отправителя",         "field_type": "text",     "is_required": True,  "score_value": 1.0, "order_index": 9},
        ],
    },
    {
        "id": 2,
        "name": "Направление на лабораторное исследование",
        "template_key": "lab_direction",
        "description": "Форма направления биоматериала на исследование",
        "fields": [
            {"field_key": "material_type",    "field_label": "Вид материала",                       "field_type": "select",   "is_required": True,  "score_value": 3.0, "order_index": 1,
             "options_json": ["Кровь", "Моча", "Кал", "Мазок из зева", "Мазок из носа", "Мокрота", "Ликвор", "Другое"]},
            {"field_key": "collection_date",  "field_label": "Дата забора",                         "field_type": "date",     "is_required": True,  "score_value": 1.0, "order_index": 2},
            {"field_key": "target",           "field_label": "Цель исследования",                   "field_type": "text",     "is_required": True,  "score_value": 3.0, "order_index": 3},
            {"field_key": "method",           "field_label": "Метод исследования",                  "field_type": "select",   "is_required": True,  "score_value": 2.0, "order_index": 4,
             "options_json": ["ИФА (anti-HAV IgM)", "ПЦР", "Бактериологический", "Микроскопический", "Серологический"]},
            {"field_key": "preliminary_dx",   "field_label": "Предварительный диагноз",             "field_type": "text",     "is_required": True,  "score_value": 2.0, "order_index": 5},
            {"field_key": "urgency",          "field_label": "Срочность",                           "field_type": "select",   "is_required": True,  "score_value": 1.0, "order_index": 6,
             "options_json": ["Плановое", "Срочное", "Cito!"]},
            {"field_key": "sender_sign",      "field_label": "Подпись направившего",                "field_type": "text",     "is_required": True,  "score_value": 1.0, "order_index": 7,
             "validation_regex": r"^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.[А-ЯЁ]\.$"},
        ],
    },
]
```

### S.5 System settings (начальные значения)

```python
SYSTEM_SETTINGS = {
    "institution_name": "ВМедА им. С.М. Кирова",
    "idle_timeout_min": 30,
    "max_file_upload_mb": 10,
    "backup_retention_days": 90,
    "maintenance_mode": "false",
    "installation_date": datetime.utcnow().isoformat(),
}
```

### S.6 Порядок выполнения seed

```python
def seed_database():
    with SessionLocal() as db:
        if db.query(Role).count() > 0:
            logger.info("Seed уже выполнен, пропускаем")
            return
        seed_roles(db)
        seed_disciplines_and_topics(db)
        seed_form_templates(db)
        seed_first_admin(db)
        seed_system_settings(db)
        reset_serial_sequences(db)  # см. ниже — ВАЖНО после явных INSERT с id
        db.commit()
        logger.info("Seed выполнен успешно")

def reset_serial_sequences(db):
    """После явных INSERT с заданными id sequence остаётся на 1.
    Следующий INSERT без id породит UniqueViolation.
    Выравниваем sequence на MAX(id) по каждой seed-таблице."""
    for table, col in [
        ("roles", "id"),
        ("disciplines", "id"),
        ("topics", "id"),
        ("form_templates", "id"),
        ("form_template_fields", "id"),
    ]:
        db.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
            f"COALESCE((SELECT MAX({col}) FROM {table}), 1), true)"
        ))
```

Вызов `seed_database()` — в `main.py` **после** `run_migrations()`, только если `FIRST_RUN=true` в env (см. §18.5).

---

## §T. Security и операционные правила

### T.1 Password policy (I-01)

**Regex:** `^(?=.*[A-Za-zА-Яа-я])(?=.*\d)(?=.*[!@#$%^&*\-_=+]).{8,128}$`

**Требования:**
- Длина 8–128 символов
- Минимум 1 буква (латинская или кириллическая)
- Минимум 1 цифра
- Минимум 1 символ из: `! @ # $ % ^ & * - _ = +`

**Применяется:**
- При создании пользователя (`UserCreate`)
- При смене пароля (`POST /api/users/me/change-password`)
- При сбросе пароля администратором (`POST /api/users/{id}/reset-password`)

**Сообщения ошибок** — только на русском, полным предложением (см. `PasswordValidator` в §R.2).

### T.2 Role-based сериализация сценария

При ответе `GET /api/scenarios/{id}` для роли **student** сервер **обязан** удалить из `node_data` и `edge.data` все поля, раскрывающие правильные ответы:

```python
# server/services/scenario_service.py
STUDENT_FORBIDDEN_NODE_FIELDS = {
    "decision":   ["options[*].feedback", "options[*].score"],
    "form":       ["fields[*].correct_value", "fields[*].score"],
    "text_input": ["keywords", "max_score"],
    "final":      [],  # видимо полностью
    "data":       [],
    "start":      [],
}
STUDENT_FORBIDDEN_EDGE_FIELDS = ["is_correct", "score_delta", "condition"]

def sanitize_scenario_for_student(scenario_full_out: ScenarioFullOut) -> ScenarioFullOut:
    """Удаляет из графа поля, раскрывающие правильные ответы.
    Вызывается в роутере scenarios.get() если current_user.role == 'student'."""
    ...
```

**Тест обязателен:** `test_scenarios.py::test_student_does_not_see_correct_values` — пройти граф сценария и убедиться, что ни в одном узле/ребре нет запрещённых ключей.

### T.3 Никогда не оценивать на клиенте

Клиентский код **не должен** содержать:
- Поля `correct_value`, `correct_values`, `is_correct`, `keywords` в TypeScript-типах
- Функции вида `checkAnswer`, `isCorrect`, `gradeAnswer`

Grep перед коммитом (автоматизировано в pre-commit hook):

```bash
grep -rnE '(correct_value|is_correct|grade_answer|check_answer)' client/src/ \
  --include='*.ts' --include='*.tsx' \
  && { echo "LEAK: correct_value in client code"; exit 1; }
```

### T.4 Logging policy (I-07)

**Уровни:**
| Level | Что пишется | Retention |
|---|---|---|
| `DEBUG` | Только в dev-окружении; детали SQL, request/response. | 7 дней |
| `INFO` | Login, logout, scenario publish, scenario assign, user created. | 30 дней |
| `WARNING` | Failed login (при количестве попыток 3+), истёкший refresh. | 365 дней |
| `ERROR` | 5xx, неперехваченные исключения, falied pg_dump, failed restore. | 365 дней |

**Обязательный actor_id** при записи write-операций (`actor_id` — семантическое название «кто совершил действие»; в схеме БД и в коде это колонка `system_logs.user_id`, см. §8.1):

```python
log_service.write(
    level="INFO",
    message="Scenario published",
    user_id=current_user.id,
    data={"scenario_id": scenario.id, "title": scenario.title},
)
```

**Автоочистка:** APScheduler задача `cleanup_old_logs` раз в сутки в 04:00:

```sql
DELETE FROM system_logs WHERE level = 'DEBUG'   AND created_at < NOW() - INTERVAL '7 days';
DELETE FROM system_logs WHERE level = 'INFO'    AND created_at < NOW() - INTERVAL '30 days';
DELETE FROM system_logs WHERE level IN ('WARNING','ERROR') AND created_at < NOW() - INTERVAL '365 days';
```

### T.5 Restore backup — оркестрация (C-05)

**Предусловие:** `pg_dump` и `pg_restore` — штатные утилиты PostgreSQL, поставляются в пакете `postgresql-client`, уже установленном в `server/Dockerfile` (строка `apt-get install ... postgresql-client ...`). Сервис запускает их через `subprocess.run`, а не через SQLAlchemy.

**Процедура** (`backup_service.restore_backup(filename, actor_id)`):

```
 1. Validate filename: не содержит '..', '/', '\', фактически существует в BACKUP_DIR
 2. Получить ТЕКУЩУЮ версию миграций до restore:
      current_rev_before = alembic.command.current()  → сохранить для лога
 3. SystemSetting["maintenance_mode"] = "true"   → клиент показывает баннер
 4. Ждём 3 секунды (у активных попыток есть шанс увидеть баннер)
 5. Завершаем все in_progress попытки как abandoned:
      UPDATE attempts SET status='abandoned', finished_at=NOW()
      WHERE status='in_progress';
 6. Закрываем connection pool:
      engine.dispose()
 7. Запускаем pg_restore в subprocess с timeout 10 минут:
      subprocess.run(
        ["pg_restore", "--clean", "--if-exists", "-d", DATABASE_URL, filename],
        timeout=600, check=True, capture_output=True,
      )
 8. Пересоздаём engine и pool
 9. ПРОВЕРКА версий миграций после restore:
      current_rev_after  = alembic.command.current()
      head_rev           = alembic.command.heads()
      if current_rev_after > head_rev:
          # Бэкап содержит миграции из БУДУЩЕГО
          log WARNING "Backup contains newer migrations (%s) than application head (%s). "
                      "Application may not work correctly. Consider upgrading the app."
          # upgrade НЕ запускаем — это бесполезно
      elif current_rev_after < head_rev:
          # Нормальный случай — бэкап старее текущего кода
          alembic.command.upgrade(config, "head")
          log INFO  "Applied migrations from %s to %s", current_rev_after, head_rev
      else:
          log INFO  "Backup at same revision as application (%s)", head_rev
10. SystemSetting["maintenance_mode"] = "false"
11. Log INFO: "Backup restored" + actor_id + {before: current_rev_before, after: current_rev_after}
12. При любой ошибке на шагах 3-9 → maintenance_mode оставляем "true",
    log ERROR с traceback, возвращаем 500 + admin видит баннер "Требуется ручное вмешательство"
```

**API:** `POST /api/admin/backups/{filename}/restore` возвращает `202 Accepted` с `{status: "started"}`. Операция асинхронная (BackgroundTasks FastAPI). Клиент опрашивает `GET /api/admin/sysinfo` (проверяет `maintenance_mode`) раз в 5 секунд.

**Клиентский баннер (maintenance_mode):**
```tsx
<div className="bg-danger text-white px-6 py-3 text-center text-sm font-semibold">
  ⚠ Идёт восстановление системы. Сохраните свои данные. Обновите страницу через 5 минут.
</div>
```

**Triple-confirm в UI:** ConfirmDialog → ввести название бэкапа вручную → ещё один ConfirmDialog с danger-кнопкой. См. §UI.6.

### T.6 Bulk CSV upload (C-07)

**Эндпоинт:** `POST /api/users/bulk-csv` (admin only)

**Request:** `multipart/form-data` с полем `file` (text/csv).

**Формат файла:**
- Кодировка: UTF-8 **с BOM** (для корректного открытия в Excel)
- Разделитель: `;` (точка с запятой — российский Excel по умолчанию)
- Первая строка — заголовки (регистр не важен)
- Строки после — данные

**Колонки:**
```
username;password;full_name;role;group_name;email
```

**Пример:**
```csv
username;password;full_name;role;group_name;email
ivanov.i;Secure123!;Иванов И.И.;student;Группа №4 воен.;
petrov.p;Qwerty12@;Петров П.П.;student;Группа №4 воен.;
smirnov.s;Teacher9#;Смирнов С.С.;teacher;;s.smirnov@vmeda.local
```

**Ответ:**
```json
{
  "created": 2,
  "errors": [
    {"row": 4, "detail": "Пользователь с логином 'smirnov.s' уже существует"}
  ]
}
```

**Правила парсинга:**
- `group_name` пустой → `group_id=NULL` (для teacher/admin норма)
- `group_name` не найден → ошибка «Группа 'X' не существует» (не создаём группы автоматически)
- `email` игнорируется в MVP
- Транзакция: **или все строки проходят, или откат всех** (если `errors` не пустой — 422, ничего не создано; admin исправляет и загружает заново)

**Валидация каждой строки** — через `UserBulkCSVRow` (§R.2), с агрегацией ошибок.

**Лимит размера файла:** 2 MB (≈ 20 000 строк, более чем достаточно).

### T.7 Rate limiting для backup (I-06)

**In-memory throttle** (не redis — изолированный LAN, один сервер):

```python
# server/services/backup_service.py
_last_backup_at: datetime | None = None
_BACKUP_COOLDOWN_SEC = 300  # 5 минут

def create_backup(actor_id: int):
    global _last_backup_at
    if _last_backup_at and (datetime.utcnow() - _last_backup_at).total_seconds() < _BACKUP_COOLDOWN_SEC:
        retry_after = _BACKUP_COOLDOWN_SEC - int((datetime.utcnow() - _last_backup_at).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Слишком частые запросы. Повторите через {retry_after} секунд.",
            headers={"Retry-After": str(retry_after)},
        )
    _last_backup_at = datetime.utcnow()
    # ... pg_dump
```

**Для login** — ограничение через `users.login_attempts` (уже в схеме), лимит 5 попыток → лок на 30 минут.

### T.8 CORS configuration (I-14)

**`server/config.py`:**

```python
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
# В dev: "http://localhost:5173"
# В prod (на сервере ВМедА): "http://epicase.vmeda.local,http://10.0.1.100"
```

**`server/main.py`:**

```python
from server.config import CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,     # НЕ "*"
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**`.env.example`** дополнить:
```bash
CORS_ORIGINS=http://localhost:5173
# Для прода: CORS_ORIGINS=http://epicase.vmeda.local
```

### T.9 Avatar upload security (I-15)

При `POST /api/users/me/avatar`:
1. Проверка `Content-Length` ≤ 2 MB до чтения
2. `UploadFile.content_type` ∈ `{"image/jpeg", "image/png", "image/webp"}`
3. Чтение в `BytesIO`, проверка через Pillow: `Image.open().verify()` (ловит не-картинки с правильным mime)
4. Imagemagick/Pillow resize до 256×256
5. Сохранение как JPEG качества 85 в `MEDIA_DIR/avatars/{user_id}_{hash}.jpg`
6. Старый файл — удалить с диска

---

## §U. Поведенческие спецификации

### U.3 Таймер попытки — серверно-авторитетная модель (C-04)

**Принцип:** единственный источник правды о времени — сервер. Клиент только отображает.

**При старте попытки:**
- Сервер вычисляет `expires_at = started_at + time_limit_min минут`
- Записывает в `attempts.expires_at` (поле создаётся сразу в миграции, создающей таблицу `attempts` — см. §MIG ниже)
- Возвращает в `AttemptStartOut`

**Клиентский отсчёт:**
- При получении `expires_at` клиент вычисляет offset между своими часами и серверными (разница `Date.now() - started_at`), чтобы избежать расхождения
- Отображает оставшееся время локально, обновляя раз в секунду
- **Каждые 30 секунд** опрашивает `GET /api/attempts/{id}/time-remaining` для ресинхронизации

**Состояния таймера:**
| remaining | Цвет | Поведение |
|---|---|---|
| > 5 мин | `fg-muted` | Обычное отображение |
| 1–5 мин | `warning`, пульсация раз в 2 с | Toast предупреждение в 5 мин, 1 мин |
| ≤ 1 мин | `danger`, постоянная пульсация | — |
| 0 | — | Автовызов `POST /api/attempts/{id}/finish`, редирект на result |

**При `step` после истечения:**
- Сервер возвращает `410 Gone` с `{detail: "Время попытки истекло"}`
- Клиент перехватывает и редиректит на `CaseResultPage`

**Фоновая задача сервера (APScheduler) раз в 60 с:**
```python
def auto_finish_expired_attempts():
    """Находит in_progress попытки с expires_at < NOW() и завершает их."""
    now = datetime.utcnow()
    expired = db.query(Attempt).filter(
        Attempt.status == "in_progress",
        Attempt.expires_at < now,
    ).all()
    for attempt in expired:
        attempt_service.finish(attempt.id, reason="time_expired")
```

Гарантирует завершение даже если клиент не дошёл до `POST /finish` (закрыл вкладку ровно в момент истечения).

### U.6 Idle timeout (I-09)

**Клиентская механика:**

```tsx
// client/src/hooks/useIdleTimeout.ts
export function useIdleTimeout(timeoutMin: number, onTimeout: () => void) {
  useEffect(() => {
    let timer: number;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(onTimeout, timeoutMin * 60 * 1000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [timeoutMin, onTimeout]);
}
```

**Поведение при истечении:**
1. Модал «Вы всё ещё здесь?» с countdown 60 секунд
2. Кнопка «Я здесь» → сбрасывает таймер
3. По истечении countdown → `authStore.logout()` → redirect на `/login` с `?reason=idle`

**Сервер:** ничего не делает. JWT остаётся валидным до истечения своего времени жизни (8 ч). Клиентский logout просто стирает токены из `localStorage`.

### U.8 ProtectedRoute — полная спецификация (C-08)

```tsx
// client/src/components/ProtectedRoute.tsx
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

type Role = "student" | "teacher" | "admin";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  // Case 1: не авторизован
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />;
  }

  // Case 2: авторизован, но must_change_password
  if (user?.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Case 3: роль не подходит
  if (roles && user && !roles.includes(user.role)) {
    toast.error("У вас нет доступа к этой странице");
    const homeByRole = { student: "/student", teacher: "/teacher", admin: "/admin" };
    return <Navigate to={homeByRole[user.role]} replace />;
  }

  // Case 4: всё ок
  return <Outlet />;
}
```

**Использование в роутинге:**

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/change-password" element={<ChangePasswordPage />} />
  <Route path="/forbidden" element={<ForbiddenPage />} />

  <Route element={<ProtectedRoute roles={["student"]} />}>
    <Route path="/student/*" element={<StudentArea />} />
  </Route>

  <Route element={<ProtectedRoute roles={["teacher", "admin"]} />}>
    <Route path="/teacher/*" element={<TeacherArea />} />
  </Route>

  <Route element={<ProtectedRoute roles={["admin"]} />}>
    <Route path="/admin/*" element={<AdminArea />} />
  </Route>

  {/* Default redirect по роли */}
  <Route path="/" element={<RoleHomeRedirect />} />

  {/* Catch-all: любой неизвестный путь → NotFoundPage (E-21) */}
  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

**Catch-all поведение (E-21):**

`NotFoundPage` — полноценная страница для неизвестных URL. Рендерится в двух случаях:
1. Пользователь набрал несуществующий путь (`/unknown-path` или опечатка)
2. Старый bookmark после `restore backup` ведёт на удалённый ресурс (в комбинации с API not-found, см. ниже)

```tsx
// client/src/pages/NotFoundPage.tsx
export function NotFoundPage() {
  const location = useLocation();
  const { user } = useAuthStore();
  const homeByRole = { student: "/student", teacher: "/teacher", admin: "/admin" };
  const homeUrl = user ? homeByRole[user.role] : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="max-w-md text-center px-6 py-12">
        <Icon name="search" className="w-20 h-20 mx-auto mb-6 text-fg-muted" />
        <h1 className="text-3xl font-bold text-fg mb-3">Страница не найдена</h1>
        <p className="text-fg-muted mb-2">
          Запрошенный адрес не существует или был перемещён.
        </p>
        <p className="text-sm text-fg-muted mb-8 font-mono">{location.pathname}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => window.history.back()}>
            ← Назад
          </Button>
          <Button variant="primary" onClick={() => window.location.href = homeUrl}>
            На главную
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**ForbiddenPage (для прямых переходов на `/forbidden`):**

Обычно ProtectedRoute делает `Navigate` с toast вместо отдельной страницы (это лучший UX). Но отдельный роут `/forbidden` полезен для специфических случаев, где нужно объяснить контекст запрета — например, teacher пытается посмотреть admin-backup.

```tsx
// client/src/pages/ForbiddenPage.tsx
export function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="max-w-md text-center px-6 py-12">
        <Icon name="lock" className="w-20 h-20 mx-auto mb-6 text-danger" />
        <h1 className="text-3xl font-bold text-fg mb-3">Доступ запрещён</h1>
        <p className="text-fg-muted mb-8">
          У вас недостаточно прав для просмотра этой страницы. Если вы считаете,
          что это ошибка, обратитесь к администратору.
        </p>
        <Button variant="primary" onClick={() => window.history.back()}>
          ← Назад
        </Button>
      </div>
    </div>
  );
}
```

**API 404 — ResourceNotFound pattern (E-21):**

Когда API возвращает 404 на `GET /api/scenarios/{id}` (ресурс удалён после restore, неправильный id в URL, soft-deleted) — клиент должен показать осмысленный EmptyState, не глобальный NotFoundPage.

Паттерн: TanStack Query `queryFn` ловит 404, возвращает `null`; компонент проверяет `null` и рендерит `ResourceNotFound`:

```tsx
// client/src/hooks/useScenario.ts
export function useScenario(id: number) {
  return useQuery({
    queryKey: ["scenarios", id],
    queryFn: async () => {
      try {
        const { data } = await api.scenarios.getOne(id);
        return data;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;  // сигнал для UI: ресурс не найден
        }
        throw err;  // остальные ошибки — throw как обычно
      }
    },
  });
}

// client/src/pages/student/CaseDetailPage.tsx
export function CaseDetailPage() {
  const { id } = useParams();
  const { data: scenario, isLoading } = useScenario(Number(id));

  if (isLoading) return <LoadingSpinner />;
  if (scenario === null) {
    return (
      <ResourceNotFound
        resourceType="Кейс"
        backUrl="/student/cases"
        backLabel="К моим кейсам"
      />
    );
  }
  // ...обычный render
}
```

**ResourceNotFound компонент:**

```tsx
// client/src/components/ResourceNotFound.tsx
interface Props {
  resourceType: string;  // "Кейс" | "Попытка" | "Группа" | ...
  backUrl: string;
  backLabel: string;
}

export function ResourceNotFound({ resourceType, backUrl, backLabel }: Props) {
  return (
    <EmptyState
      icon="search"
      title={`${resourceType} не найден`}
      description="Ресурс удалён или у вас нет к нему доступа. Возможно, администратор обновил данные."
      action={{ label: backLabel, href: backUrl }}
    />
  );
}
```

**Универсальный hook для всех GET-запросов с 404:**

```tsx
// client/src/hooks/useResourceQuery.ts
/**
 * Обёртка над useQuery, которая конвертирует 404 в `null` (вместо throw).
 * Все компоненты получают единообразный паттерн: data === null → ResourceNotFound.
 */
export function useResourceQuery<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  options?: Omit<UseQueryOptions<T | null>, "queryKey" | "queryFn">
) {
  return useQuery<T | null>({
    queryKey: key,
    queryFn: async () => {
      try {
        return await fetcher();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    ...options,
  });
}

// Использование:
const { data: scenario } = useResourceQuery(
  ["scenarios", id],
  () => api.scenarios.getOne(id).then(r => r.data)
);
```

**Правила (обязательны для code-reviewer):**

1. Каждый `*DetailPage.tsx` (CaseDetailPage, GroupDetailPage, UserDetailPage и др.) ДОЛЖЕН проверять `data === null` и рендерить `ResourceNotFound`
2. Глобальный Axios interceptor НЕ перехватывает 404 на GET-запросах — это делает hook (`useResourceQuery`), чтобы компонент получил null, а не throw
3. Axios interceptor ОБРАБАТЫВАЕТ 404 на POST/PUT/DELETE как обычно — показывает toast "Ресурс не найден"
4. `NotFoundPage` и `ForbiddenPage` — только для router-level (catch-all и explicit навигация), не для API-ошибок

**401 из API** перехватывается Axios interceptor:
1. Попытка `POST /api/auth/refresh` с refresh_token
2. Успех → повтор оригинального запроса
3. Неудача → `authStore.logout()` → redirect `/login?reason=session_expired`

---

## §A. Дополнительные эндпоинты и уточнения

### A.2 Logout (I-10)

`POST /api/auth/logout`:
- **Сервер:** пишет `INFO` в `system_logs` с actor_id, возвращает `{status: "ok"}`. Токен не инвалидируется (JWT stateless).
- **Клиент:** `authStore.logout()` — очищает `user`, `accessToken`, `refreshToken` из state и `localStorage`, redirect на `/login`.
- **V2:** blacklist-таблица для немедленной инвалидации (не в MVP).

### A.3 Pagination defaults (I-12)

Все list-эндпоинты (`GET /api/users`, `/groups`, `/scenarios`, `/attempts/my`, `/admin/logs`):
- `page` default **1**, min 1, max 10 000
- `per_page` default **20**, min 1, max **100**
- Возвращают `PaginatedResponse[T]` (см. §R.8)
- Если `per_page > 100` → `422`

### A.4 Default sort order (I-13)

| Endpoint | Default ORDER BY |
|---|---|
| `GET /api/scenarios` | `updated_at DESC` |
| `GET /api/users` | `full_name ASC` |
| `GET /api/groups` | `name ASC` |
| `GET /api/attempts/my` | `started_at DESC` |
| `GET /api/admin/logs` | `created_at DESC` |

Параметр `?sort=field` или `?sort=-field` (минус — DESC) позволяет переопределить. Список разрешённых полей — whitelist в каждом роутере.

### A.5 Avatar endpoint (I-15)

```
POST /api/users/me/avatar
Content-Type: multipart/form-data
body: file=<image>

Response 200: {"avatar_url": "/media/avatars/{id}_{hash}.jpg"}
Errors:
  400 "Файл должен быть изображением (JPEG/PNG/WebP)"
  413 "Файл слишком большой (максимум 2 MB)"
  422 "Не удалось обработать изображение"
```

Процедура — §T.9.

### A.6 Scenario DELETE + archive (I-16)

```
DELETE /api/scenarios/{id}
Доступ: Teacher (автор черновика), Admin
Ограничение: только status='draft'
Ответ 204: без тела
Ошибки:
  409 "Нельзя удалить опубликованный сценарий. Архивируйте."
  403 "Вы не автор этого сценария"

POST /api/scenarios/{id}/archive
Доступ: Teacher (автор), Admin
Ответ 200: ScenarioListOut (со status='archived')
Примечание: Архивный сценарий скрыт из обычных списков, но попытки и история сохраняются.
  Студенты не могут начать новую попытку, но могут просматривать завершённые.
```

### A.7 Time-remaining endpoint (I-19)

```
GET /api/attempts/{id}/time-remaining
Доступ: Student (своя попытка), Teacher (если preview), Admin

Ответ 200:
  {
    "remaining_sec": 1234,
    "expires_at": "2026-04-16T14:30:00Z"
  }
  или для попытки без time_limit:
  {
    "remaining_sec": null,
    "expires_at": null
  }

Ошибки:
  404 "Попытка не найдена"
  410 "Попытка уже завершена"
```

Используется клиентом каждые 30 секунд для ресинхронизации (см. §U.3).

---

## §B. Уточнения типов узлов

### B.3 Partial scoring для decision (I-03)

Расширение `node_data` для `decision`:

```json
{
  "question": "...",
  "options": [...],
  "allow_multiple": true,
  "partial_credit": true,
  "max_score": 10.0
}
```

**Логика `grade_decision`:**

```python
def grade_decision(self, node_data: dict, answer_data: dict, edges: list[ScenarioEdge]) -> GradeResult:
    selected_ids = set(answer_data.get("selected_option_ids", []) or [answer_data.get("selected_option_id")])

    if not node_data.get("allow_multiple", False):
        # Бинарно: выбранный option определяет edge, is_correct берётся с ребра
        selected_id = answer_data["selected_option_id"]
        chosen_edge = next((e for e in edges if e.data.get("option_id") == selected_id), None)
        if chosen_edge and chosen_edge.is_correct:
            return GradeResult(score=node_data["max_score"], ..., is_correct=True)
        return GradeResult(score=0, ..., is_correct=False)

    # allow_multiple:
    correct_ids = {e.data["option_id"] for e in edges if e.is_correct}
    if not correct_ids:
        # Защитный кейс — decision-узел без хотя бы одного correct edge.
        # Должен отсекаться на этапе validate_graph() ещё до публикации.
        return GradeResult(
            score=0, max_score=node_data["max_score"], is_correct=False,
            feedback="Узел настроен некорректно: нет правильных вариантов",
            details={"config_error": "no_correct_edges"},
        )
    if not node_data.get("partial_credit", False):
        # Всё или ничего: нужно выбрать РОВНО correct_ids
        is_correct = selected_ids == correct_ids
        return GradeResult(
            score=node_data["max_score"] if is_correct else 0,
            is_correct=is_correct, ...
        )

    # partial_credit=True:
    true_positives = len(selected_ids & correct_ids)
    false_positives = len(selected_ids - correct_ids)
    # correct_ids гарантированно непустой (проверено выше)
    score = node_data["max_score"] * max(0, (true_positives - false_positives) / len(correct_ids))
    return GradeResult(score=round(score, 2), ..., is_correct=(true_positives == len(correct_ids) and false_positives == 0))
```

**Дополнительно:** `validate_graph()` должен запрещать публикацию сценария, если у decision-узла нет ни одного ребра с `is_correct=True`. Ошибка: «Узел {node_id}: decision-узел должен иметь хотя бы один правильный вариант ответа (ребро с is_correct=true)».

**Тесты:** `test_grader.py::test_decision_partial_credit` — 4 сценария (всё верно, половина, со штрафом, ничего не выбрано).

### B.5 `condition` JSONB — reserved (I-17)

Поле `scenario_edges.condition` в MVP всегда `NULL`. Зарезервировано для V2 (условные переходы на основе предыдущих ответов).

В миграции 002 комментарий:
```python
op.create_table(
    "scenario_edges",
    ...
    sa.Column("condition", postgresql.JSONB, nullable=True,
              comment="RESERVED for V2: conditional transitions based on previous answers"),
    ...
)
```

Валидатор Pydantic `EdgeOut` не пропускает `condition ≠ null` в MVP:
```python
@field_validator("data")
def check_condition_reserved(cls, v: dict) -> dict:
    if v.get("condition") is not None:
        raise ValueError("Conditional edges are reserved for V2")
    return v
```

---

## §E. Export endpoints (I-04)

### E.1 Три новых эндпоинта

```
GET /api/analytics/teacher/scenario-stats.xlsx?scenario_id=5&group_id=2
Доступ: Teacher (свои), Admin
Ответ 200: Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
           Content-Disposition: attachment; filename="stats_{scenario}_{group}_{date}.xlsx"
           Body: бинарный xlsx

GET /api/analytics/teacher/scenario-stats.pdf?scenario_id=5&group_id=2
Доступ: Teacher (свои), Admin
Ответ 200: Content-Type: application/pdf
           Content-Disposition: attachment; filename="stats_{scenario}_{group}_{date}.pdf"

GET /api/analytics/teacher/path-heatmap.xlsx?scenario_id=5&group_id=2
Доступ: Teacher, Admin
Ответ 200: xlsx
```

### E.2 Содержимое XLSX

3 листа:
- **"Сводка"** — общие метрики (total_students, completed, avg_score, passing_rate)
- **"Рейтинг"** — таблица `full_name | score | duration | path_length | status`
- **"Слабые узлы"** — `node_title | node_type | visit_count | avg_score_pct`

Библиотека: `openpyxl` (уже в requirements).

### E.3 Содержимое PDF

Для PDF добавить в `server/requirements.txt`:
```
reportlab==4.2.5
```

Разделы PDF:
1. Шапка с логотипом (используем `epicase-design-system.svg` → PNG через CairoSVG при сборке Docker-образа) и названием заведения
2. Название сценария, дата, группа
3. Сводная таблица
4. Гистограмма распределения баллов (matplotlib → PNG → embed)
5. Таблица рейтинга (топ-20)

**Обязательный footer:** «Сформировано EpiCase · {date} · {institution_name}».

---

## §MIG. Нумерация миграций Alembic (E-06)

В §13 оригинала перечислены три файла миграций без чёткого содержания. Ниже — окончательная раскладка, синхронизированная с Pydantic-схемами §R и seed §S.

| Номер | Файл | Создаёт таблицы | Создаёт индексы | Комментарии |
|---|---|---|---|---|
| **001** | `001_initial_schema.py` | `roles`, `groups`, `users`, `teacher_groups`, `disciplines`, `topics`, `form_templates`, `form_template_fields` | `idx_users_role`, `idx_users_group`, `idx_users_username`, `idx_teacher_groups_teacher`, `idx_teacher_groups_group` | Добавить колонку `users.must_change_password BOOLEAN NOT NULL DEFAULT FALSE` (см. §S.2) |
| **002** | `002_scenario_schema.py` | `scenarios`, `scenario_nodes`, `scenario_edges`, `scenario_groups`, `media_files` | `idx_scenarios_author`, `idx_scenarios_status`, `idx_nodes_scenario`, `idx_edges_scenario`, **`idx_nodes_data_gin`** (GIN по JSONB) | Archived статус уже учтён в CHECK constraint (§8.1) |
| **003** | `003_attempts_schema.py` | `attempts`, `attempt_steps` | `idx_attempts_user`, `idx_attempts_scenario`, `idx_attempts_status`, partial UNIQUE `idx_attempts_active`, `idx_attempts_completed` (composite), `idx_steps_attempt`, `idx_steps_attempt_node` | `attempts.expires_at TIMESTAMPTZ NULL` создаётся сразу (§U.3) |
| **004** | `004_system_tables.py` | `system_settings`, `system_logs` | `idx_logs_level`, `idx_logs_date` | Initial records для system_settings делает `seed.py`, не миграция |

`seed.py` запускается один раз после всех четырёх миграций, проверка `if Role.count() > 0: skip`.

**Команда создания миграции 001 в dev:**
```bash
cd server
alembic revision -m "initial_schema" --rev-id 001
# затем вручную заполнить файл по §8.1 + must_change_password
alembic upgrade head
```

---

## §Q. Дополнительные индексы БД (I-02)

Добавить в миграцию 002:

```python
# GIN для быстрого поиска по JSONB (аналитика по keywords и form fields)
op.execute("CREATE INDEX idx_nodes_data_gin ON scenario_nodes USING GIN (node_data);")

# Составной индекс для аналитики
op.create_index(
    "idx_attempts_completed",
    "attempts",
    ["scenario_id", "status", "started_at"],
    postgresql_where=sa.text("status = 'completed'"),
)

# Индекс для path-heatmap (частые запросы по attempt_id + node_id)
op.create_index(
    "idx_steps_attempt_node",
    "attempt_steps",
    ["attempt_id", "node_id"],
)
```

---

## §M. Context7 MCP (I-08)

### M.1 `.claude/mcp/context7.json`

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "env": {},
      "description": "Actual docs for libraries (dev only, not on isolated prod server)"
    }
  }
}
```

### M.2 `.claude/settings.json` — обновление

Добавить в `permissions.allow`:
```json
"Bash(npx -y @upstash/context7-mcp *)"
```

### M.3 Использование

**Перед написанием любого кода с библиотеками из списка** — Claude/Codex обязан запросить актуальную документацию через Context7:

Обязательный список (из §23.3 оригинала):
- fastapi, sqlalchemy, alembic, pydantic, bcrypt, python-jose, pytest
- react, @xyflow/react, zustand, @tanstack/react-query, tailwindcss, vitest, @testing-library/react, react-hook-form, zod

Формулировка: «use context7 для <library>» в промпте. Context7 недоступен на продакшн-сервере (изолированная сеть) — используется только на dev-машине.

---

## §UI. Спецификации недостающих экранов

### UI.1 T-4: Scenario Preview (I-18)

**URL:** `/teacher/scenarios/{id}/preview`

**Layout:** 100% идентичен `CasePlayerPage` (чтобы teacher видел то же, что student), **плюс**:
- Top-bar: оранжевый баннер «🔍 Режим предпросмотра — ответы не сохраняются» + кнопка «Выйти»
- Правая панель: дополнительная секция «Инсайты» (показывает `is_correct` ребра, `correct_value` формы, `keywords` для text_input — только здесь и только teacher)

**Механика:**
- `POST /api/attempts/start` с флагом `?preview=true`
- Сервер создаёт попытку с `user_id=current_user.id` (teacher), но **НЕ** пишет её в `attempts` таблицу — держит in-memory (Redis-like кэш в памяти процесса, keyed by `preview_session_id`)
- `POST /api/attempts/{preview_session_id}/step` — всё работает, но без persist
- Автоочистка in-memory сессий старше 2 часов

**Выход:** кнопка «Выйти из предпросмотра» → DELETE in-memory session → redirect на `/teacher/scenarios/{id}/edit`.

### UI.2 T-5: Analytics Page

**URL:** `/teacher/scenarios/{id}/analytics?group_id=N`

**Layout:** вертикально сверху вниз:

```
┌────────────────────────────────────────────────────┐
│  Header: [Back] Сценарий · Группа [Select▼]  [Export▼]  │
├────────────────────────────────────────────────────┤
│  KPI tiles (4 шт):                                  │
│  [Прошли: 18/20] [Средний: 72%] [Время: 42 мин] [Правильный путь: 14]  │
├────────────────────────────────────────────────────┤
│  Tab bar: [Тепловая карта] [Распределение] [Рейтинг] [Слабые узлы]  │
├────────────────────────────────────────────────────┤
│  Контент вкладки                                    │
└────────────────────────────────────────────────────┘
```

**Вкладка «Тепловая карта»:** React Flow readonly с графом сценария, узлы окрашены по `visit_count` / `avg_score_pct`. Клик на узел → модал с детальной статистикой.

**Вкладка «Распределение»:** Recharts bar chart по бинам `[0-20, 20-40, 40-60, 60-80, 80-100]`.

**Вкладка «Рейтинг»:** таблица студентов с сортировкой по score/duration.

**Вкладка «Слабые узлы»:** список узлов с avg_score < 50%, сортировка по `visit_count` DESC.

**Кнопки Export:**
- «Скачать Excel» → `GET .xlsx`
- «Скачать PDF» → `GET .pdf`

### UI.3 T-6: Groups Page

**URL:** `/teacher/groups`

**Layout:**
```
┌────────────────────────────────────────────────────┐
│  Мои группы                                          │
├────────────────────────────────────────────────────┤
│  [Group Card]  [Group Card]  [Group Card]            │
│  ┌────────────────┐                                  │
│  │  Группа №4 воен.                                  │
│  │  25 студентов · 3 сценария назначено              │
│  │  Средний балл: 72%                                │
│  │  [Список студентов] [Назначить сценарий]          │
│  └────────────────┘                                  │
└────────────────────────────────────────────────────┘
```

**Клик на карточку** → детальная страница с:
- Список студентов группы (таблица)
- Список назначенных сценариев с дедлайнами
- Кнопка «Назначить ещё сценарий» → модал выбора из своих published сценариев

### UI.4 S-5: My Results

**URL:** `/student/results`

**Фильтры:** по дате (last 7/30/all), по статусу (все/пройденные/в процессе), по сценарию.

**Таблица:**
| Сценарий | Дата | Попытка | Балл | Время | Статус | |
|---|---|---|---|---|---|---|
| Гепатит А | 15.04 | #2 | 82% | 42:15 | ✓ Пройдено | [Открыть] |

Клик «Открыть» → `/student/attempts/{id}/result`.

### UI.5 A-2: Users Page

**URL:** `/admin/users`

**Верхняя панель:**
- Search input
- Filters: роль (all/student/teacher/admin), статус (active/locked)
- Кнопки: «Создать пользователя», «Импорт из CSV»

**Таблица:**
| Логин | ФИО | Роль | Группа | Статус | Последний вход | Действия |
|---|---|---|---|---|---|---|
| ivanov.i | Иванов И.И. | student | Группа №4 | Активен | 15.04 14:30 | [...] |

Контекстное меню `[...]`:
- Редактировать (Modal с формой UserUpdate)
- Сбросить пароль (Modal с вводом нового пароля)
- Заблокировать / Разблокировать
- Удалить (ConfirmDialog; soft delete)

**Bulk CSV Upload** (Modal):
1. Кнопка «Скачать шаблон» → CSV с заголовками
2. Drop zone для файла
3. Preview: первые 10 строк + счётчик валидных/невалидных
4. Кнопка «Загрузить» → POST → результат (successes + errors per row)

### UI.6 A-3: System Page

**URL:** `/admin/system`

**Секции:**

1. **Сведения о системе** — плашка с `db_size_mb`, `version`, `uptime`, `python_version`, `maintenance_mode` индикатор.

2. **Бэкапы** — список + кнопка «Создать бэкап» (disabled 5 мин после последнего):
   | Имя файла | Размер | Создан | Возраст | Действия |
   |---|---|---|---|---|
   | backup_20260416_030000.sql.gz | 12.4 MB | 16.04 03:00 | 11 ч назад | [Скачать] [Восстановить] [Удалить] |

   **Восстановление** — triple-confirm:
   - ConfirmDialog 1: «Это заменит все данные текущей БД данными из бэкапа. Все активные попытки будут прерваны.»
   - Modal 2: «Введите название бэкапа для подтверждения: `backup_20260416_030000`»
   - ConfirmDialog 3 (danger): «ПОДТВЕРДИТЕ: восстановление из бэкапа»

3. **Логи системы** — таблица с фильтром по уровню, пагинация, экспорт в CSV.

4. **Обслуживание** — тоггл `maintenance_mode` (баннер для всех пользователей).

---

## §D. Design System (C-01)

Полная спецификация визуальной идентичности, цветов, типографики, компонентов, UX-паттернов — в отдельных файлах:

- **`design/DESIGN_SYSTEM.md`** — текстовая спецификация (12 разделов)
- **`design/epicase-design-system.svg`** — визуальный референс с логотипом, палитрой, иконками

**Ключевые решения:**
- Палитра: `#5680E9` (royal, primary), `#84CEEB` (sky, info), `#5AB9EA` (cyan, secondary), `#C1C8E4` (lavender, surface), `#8860D0` (purple, accent) + утилитарные `#10B981` (success), `#F59E0B` (warning), `#EF4444` (danger)
- Логотип — абстрактный ветвящийся граф из 4 узлов
- Иконки — SVG sprite в `client/public/branding.svg` (6 типов узлов + 12 разделов + 8 статусов)
- Типографика — системный стек (офлайн-деплой), шкала от `text-xs` до `text-display`
- Компоненты — спецификация Button/Card/Badge/Input/Modal/Toast/ConfirmDialog/EmptyState/Table в §6 DESIGN_SYSTEM.md
- Tailwind v4 `@theme` конфигурация в DESIGN_SYSTEM §10.1

**Все UI-разработчики (Codex GPT 5.4 `frontend-developer`, `ui-scaffolder`) обязаны читать `DESIGN_SYSTEM.md` перед каждой задачей этапов 5–9.**

---

## Application path

После того, как этот аддендум одобрен:

1. Claude Opus 4.7 мерджит §X, §R, §S, §T, §U, §A, §B, §E, §Q, §M, §UI, §D в основной `PROJECT_DESIGN_EPICASE_v1.md`, поднимает версию до **v1.1** в CHANGELOG.
2. Обновляет `MEMORY.md`: «Stage 0.5 — design system + addendum integrated».
3. Удаляет `PROJECT_DESIGN_ADDENDUM_v1.1.md`.
4. Переходит к Stage 1 с полным набором спецификаций.
