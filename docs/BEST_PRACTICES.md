# EpiCase — Best Practices

> Проверочный документ, объединяющий 5 областей: REST API, security, ACID transactions, database indexing, latency reference.
> Вдохновлён [system-design-primer](https://github.com/donnemartin/system-design-primer), адаптирован под реальность EpiCase (30 пользователей, LAN ВМедА, одна PostgreSQL-инстанция).
>
> **Не переписывает архитектуру.** Отклонённые паттерны (Redis, sharding, microservices, CDN) см. `docs/ARCHITECTURE_DECISIONS.md`.
>
> Автор: Claude Opus 4.7 · Дата: 2026-04-17

---

## Оглавление

- [§B.1 REST API sanity check](#b1-rest-api-sanity-check)
- [§B.2 Security checklist (OWASP-aligned)](#b2-security-checklist-owasp-aligned)
- [§B.3 ACID transaction boundaries](#b3-acid-transaction-boundaries)
- [§B.4 Database indexing deep-dive](#b4-database-indexing-deep-dive)
- [§B.5 Latency reference для back-of-envelope](#b5-latency-reference-для-back-of-envelope)

---

## §B.1 REST API sanity check

### B.1.1 Правила HTTP verbs + status codes

| Verb | Когда | Idempotent | Safe | Типичные status codes |
|---|---|---|---|---|
| `GET` | Читать ресурс, без побочных эффектов | ✓ | ✓ | 200, 304, 404 |
| `POST` | Создать ресурс **или** триггер процесса | ✗ | ✗ | 201 (created), 202 (accepted async), 409 (conflict) |
| `PUT` | **Полная замена** ресурса или создание по known-id | ✓ | ✗ | 200, 201, 204 |
| `PATCH` | **Частичное** обновление полей ресурса | ✗ (строго — может быть ✓) | ✗ | 200, 204 |
| `DELETE` | Удалить ресурс | ✓ | ✗ | 200, 204 (no content), 404 |

### B.1.2 Правила для нас

- **Idempotent operations** (`GET`, `PUT`, `DELETE`): второй одинаковый запрос должен вернуть тот же результат без side effects. Защищает при retry из-за сетевых сбоев.
- **201 на успешный create**, не 200 — чтобы клиент понял, что ресурс появился.
- **202 на async операции** — например, `POST /api/admin/backups/{filename}/restore`, которая запускает background task.
- **204 No Content** — для успешных `DELETE` без тела ответа.
- **409 Conflict** — дубликаты, active attempts, попытка логина заблокированного юзера.
- **422 Unprocessable Entity** — валидация прошла, но business rule нарушен (невалидный граф при publish, превышен max_attempts).

### B.1.3 Аудит 37 наших эндпоинтов

Прошёл по каждому. Результат — **4 нарушения**, которые выношу в ERRATA v1.1.2:

#### ❌ E-13: `POST /api/users/{id}/toggle-active` — неидемпотентный глагол

**Сейчас:** `POST /api/users/42/toggle-active` — два последовательных вызова приведут к разному состоянию (active → blocked → active).

**Проблема:** При сетевом сбое клиент ретраит → состояние юзера инвертируется дважды и возвращается к исходному, но admin **думает**, что заблокировал. Явный баг.

**Правильно:** два явных эндпоинта с `PUT` (идемпотентно):

```
PUT /api/users/{id}/status
Body: {"is_active": false}
Response 200: UserOut
```

Или два отдельных endpoint с понятной семантикой:

```
POST /api/users/{id}/block       → UserOut   (идемпотентно семантически: если уже blocked — ok)
POST /api/users/{id}/unblock     → UserOut
```

**Рекомендация:** `PUT /api/users/{id}/status` с телом `{"is_active": bool}` — проще в реализации, идемпотентно по определению PUT. Заменить везде в документации.

#### ❌ E-14: `POST /api/scenarios/{id}/unpublish` — должен быть `POST /publish` с флагом

**Сейчас:** три отдельных эндпоинта: `publish`, `unpublish`, `assign`.

**Проблема:** это state transitions. `/unpublish` нарушает принцип «resource-based URL». Плюс идемпотентность: если сценарий уже unpublished, повторный POST может упасть.

**Правильно (вариант A — состояние как ресурс):**
```
PUT /api/scenarios/{id}/status
Body: {"status": "published" | "draft" | "archived"}
Response 200: ScenarioFullOut
Errors: 422 если переход недопустим (draft → archived запрещено напрямую)
```

**Вариант B (оставить как есть, но сделать идемпотентным):**
- Если сценарий уже в целевом состоянии → 200 с текущим объектом (не 409)
- Добавить явно в документацию: «re-calling is safe»

**Рекомендация:** вариант A — чище для state machine. Но вариант B менее инвазивный для существующего кода. **Выбираю вариант B** как компромисс + добавляю `POST /archive` в §A.6 ADDENDUM (уже есть).

#### ❌ E-15: `PATCH /api/admin/settings` — полный replace, должен быть PUT

**Сейчас:** `PATCH /api/admin/settings` с телом вида `{"institution_name": "...", "idle_timeout_min": 20}`.

**Проблема:** PATCH семантически = частичное обновление. Если клиент отправит только `idle_timeout_min`, остальные настройки не должны тронуться. **Но в реальной реализации** админ обычно отдаёт форму целиком → это PUT-поведение, замаскированное под PATCH.

**Правильно:** явно решить:
- Если форма admin отправляет **все настройки** → `PUT /api/admin/settings` (заменить всё)
- Если клиент может отправлять **часть** (toggle одной настройки) → `PATCH /api/admin/settings` с явным null для «не трогать»

**Рекомендация:** в UI админа всегда отправляем все настройки (это одна форма). Поэтому → **`PUT /api/admin/settings`**.

#### ❌ E-16: `GET /api/analytics/teacher/scenario-stats.xlsx` — расширение в URL для content-negotiation

**Сейчас:** отдельные эндпоинты `scenario-stats.xlsx`, `scenario-stats.pdf`, `path-heatmap.xlsx` (ADDENDUM §E.1).

**Проблема:** это **content negotiation**, не разные ресурсы. Стандартный подход — один эндпоинт + заголовок `Accept`.

**Правильно:**
```
GET /api/analytics/teacher/scenario-stats?scenario_id=5&group_id=2
Accept: application/json      → JSON (default)
Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet  → XLSX
Accept: application/pdf       → PDF
```

**Прагматичное компромиссное решение:** query parameter `?format=json|xlsx|pdf` — работает, читается в URL, не требует от клиента настраивать `Accept` headers.

**Рекомендация:** `GET /api/analytics/teacher/scenario-stats?format=xlsx` — заменить в §E.1 ADDENDUM.

#### ✅ Остальные 33 эндпоинта соответствуют REST

Краткая сводка чистых эндпоинтов:

- **Auth** (`/api/auth/*`): `POST login/refresh/logout` — семантически корректно (create token), `GET /me` — чтение. ✓
- **Users/Groups**: `GET list`, `POST create`, `PATCH update`, `DELETE` — классический RESTful CRUD. ✓
- **Scenarios**: `GET`, `POST`, `PUT /graph` (полная замена графа — правильно PUT, не PATCH), `POST /duplicate` (создаёт новый ресурс — POST верно). ✓
- **Attempts**: `POST /start` (201 create), `POST /{id}/step` (side effects — POST верно), `POST /{id}/finish`, `POST /{id}/abandon` — state transitions на long-lived ресурсе. ✓
- **Admin backups**: `POST /backup` (создаёт) — 201; `POST /{filename}/restore` — 202 async; `DELETE /{filename}` — 204. ✓

### B.1.4 Новые правила для `backend-architect` суб-агента

Добавить в `.claude/agents/backend-architect.md`:

```
REST checklist BEFORE implementing endpoint:
1. Use GET for read-only operations (must be safe + idempotent)
2. Use POST for create OR for trigger-action with side effects
3. Use PUT for full replace (idempotent!) — including state changes if the whole resource is replaced
4. Use PATCH only for true partial updates
5. Use DELETE for removal (idempotent!)
6. Return 201 Created on successful resource creation, 202 Accepted on async operations, 204 No Content on delete
7. Never use a verb in the URL path that inverts state (toggle-*, flip-*) — use two explicit endpoints or PUT with body
8. content-negotiation: use ?format=... query parameter, not file extension in path
```

---

## §B.2 Security checklist (OWASP-aligned)

Расширяет существующий `.claude/agents/security-engineer.md`. Каждый пункт — проверяем перед Stage 10 release.

### B.2.1 OWASP Top 10 для EpiCase (2021 edition)

| OWASP | Категория | Статус в EpiCase | Что проверить |
|---|---|---|---|
| A01 | Broken Access Control | ⚠️ требует аудита | `require_role()` на каждом protected endpoint. Student не видит чужие попытки. Teacher — только свои группы. |
| A02 | Cryptographic Failures | ⚠️ требует решения | Пароли bcrypt cost=12 ✓. **JWT secret rotation** — не описан. **БД at-rest encryption** — не описан. |
| A03 | Injection | ✓ защищено | SQLAlchemy ORM везде. `text()` вызовы — только в analytics с параметризацией (проверить!). |
| A04 | Insecure Design | ✓ | Serverside validation, threat modeling в ADR. |
| A05 | Security Misconfiguration | ⚠️ | CORS=['*'] в стартере — исправлено в §T.8. FastAPI `/api/docs` — **доступен без auth** (!). |
| A06 | Vulnerable Components | ⚠️ | Pin versions в requirements.txt ✓. Но нет автоматической проверки CVE (нет интернета на prod). |
| A07 | Identification and Authentication Failures | ✓ | bcrypt, rate-limit login (5 попыток → lock), JWT expiration. |
| A08 | Software and Data Integrity Failures | ⚠️ | Checksums на backup ✓. Но нет подписей Docker-образов. |
| A09 | Security Logging and Monitoring | ✓ | `system_logs` + `actor_id` на write ops (§T.4). Health-check (ADR-010). |
| A10 | Server-Side Request Forgery | ✓ | Нет user-controlled URLs для fetch. |

### B.2.2 Найденные пробелы → ERRATA v1.1.2

#### ❌ E-17: `/api/docs` (Swagger UI) доступен без auth (OWASP A05)

**Сейчас:** FastAPI по умолчанию отдаёт `/api/docs` всем. Злоумышленник, попав в LAN, видит полную схему API.

**Правильно:** защитить docs через middleware или отключить в prod:

```python
# server/main.py
app = FastAPI(
    title="EpiCase API",
    version="1.1.0",
    docs_url="/api/docs" if os.getenv("ENV") == "dev" else None,  # отключить в prod
    redoc_url=None,
    openapi_url="/api/openapi.json" if os.getenv("ENV") == "dev" else None,
)
```

Или авторизовать через dependency:

```python
# Альтернатива — защитить docs паролем admin
@app.get("/api/docs", include_in_schema=False)
def custom_swagger(user: User = Depends(require_role("admin"))):
    return get_swagger_ui_html(openapi_url="/api/openapi.json", title="EpiCase API")
```

**Рекомендация:** первый вариант (отключить в prod через `ENV`). Добавить `ENV=prod` в prod `.env`.

#### ❌ E-18: JWT secret rotation не описана (OWASP A02)

**Сейчас:** `JWT_SECRET` в `.env` — один раз установили и забыли. Если скомпрометирован — все текущие токены надо инвалидировать, но механизма нет.

**Правильно:** документировать процедуру rotation:

1. Сгенерировать новый `JWT_SECRET=$(openssl rand -hex 32)`
2. Обновить `.env`
3. `docker compose restart server`
4. Все текущие токены инвалидируются автоматически (HS256 + новый secret = decode fails → 401)
5. Все юзеры будут вынуждены перелогиниться (клиент при 401 → refresh → тоже 401 → logout)

**Добавить в SCALE.5:** процедура secret rotation как часть admin runbook.

#### ❌ E-19: БД at-rest encryption — не решено

**Сейчас:** PostgreSQL volume на диске — plain. Если сервер украли — вся БД в открытую.

**Проблема:** военно-медицинские данные. Даже если академия не требует encryption, это хорошая практика.

**Варианты:**
- **LUKS** на уровне disk (Linux) — прозрачно, ничего не меняем в приложении. Ключ при boot вводит admin.
- **PostgreSQL pgcrypto** — шифрование полей. Избыточно для нашего объёма.
- **Не делать** — принять risk.

**Рекомендация:** отметить в ADR-013 (новый) как **принятый риск** для MVP v1.0, план для V2 — LUKS на /var/lib/postgresql. Фиксируем в ADR, что осознанно не делаем.

#### ❌ E-20: `text()` SQL в analytics — проверить параметризацию (OWASP A03)

**Сейчас:** в ADDENDUM §T.4 SQL cleanup:

```sql
DELETE FROM system_logs WHERE level = 'DEBUG'   AND created_at < NOW() - INTERVAL '7 days';
```

Если кто-то перепишет на динамический retention:

```python
# ❌ ПЛОХО — SQL injection
db.execute(text(f"DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '{days} days'"))
```

**Правильно всегда:**

```python
# ✓ ХОРОШО — параметризовано
db.execute(
    text("DELETE FROM system_logs WHERE created_at < NOW() - (:days || ' days')::interval"),
    {"days": days}
)
```

**Действие:** добавить grep-правило в `scripts/verify.sh`:

```bash
# Detect f-strings inside text() — potential SQL injection
if grep -rnE 'text\(f["\x27]' server/ --include='*.py'; then
    fail "SECURITY: f-string inside text() — use parameterized queries"
fi
```

### B.2.3 Security checklist перед каждым release

Чеклист `security-engineer` agent обязан прогнать:

- [ ] `require_role()` на каждом `/api/*` endpoint (grep по роутерам)
- [ ] Нет raw SQL кроме `text()` с параметрами
- [ ] Нет f-strings внутри `text(...)`
- [ ] Нет `dangerouslySetInnerHTML` в React (кроме HTML-контента data-узла — sanitized через DOMPurify)
- [ ] Пароли bcrypt cost=12, password policy в Pydantic
- [ ] JWT expiry 8h, refresh 7d (проверить в `config.py`)
- [ ] Rate limiting на login (5 попыток → 30 мин lock)
- [ ] CORS_ORIGINS не `*` в prod
- [ ] `docs_url=None` в prod
- [ ] Backup files: path traversal check (нет `..`, `/`, `\` в filename)
- [ ] File upload: MIME type + size limit + Pillow verify
- [ ] `actor_id` в `system_logs` для всех write-операций
- [ ] `.env` в `.gitignore` (не в git!)
- [ ] Checksums на Docker-образы (для deploy на ВМедА)
- [ ] Student view санитизирован (`correct_value`, `is_correct` скрыты)
- [ ] Admin-only endpoints: проверка `require_role("admin")`

### B.2.4 XSS защита для rich HTML в data-узлах

Data-узлы содержат `content_html` (HTML-контент, введённый teacher). При отображении в CasePlayer — **обязательная sanitization** через DOMPurify:

```tsx
// client/src/components/player/DataView.tsx
import DOMPurify from "dompurify";

function DataView({ node }: Props) {
  const safeHtml = useMemo(() => DOMPurify.sanitize(node.data.content_html, {
    ALLOWED_TAGS: ["p", "strong", "em", "ul", "ol", "li", "br", "h3", "h4", "table", "tr", "td", "th", "thead", "tbody", "img"],
    ALLOWED_ATTR: ["src", "alt", "class"],
    ALLOWED_URI_REGEXP: /^\/media\//,  // только локальные медиа
  }), [node.data.content_html]);

  return <div dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
```

**Добавить в `client/package.json`:** `"dompurify": "^3.2.3"` + `"@types/dompurify": "^3.2.0"`.

---

## §B.3 ACID transaction boundaries

Список мест, где **обязательна явная транзакция** (`with db.begin():` или декоратор). Pytest-тест на каждую операцию проверяет атомарность: при искусственном падении в середине — откат всех изменений.

### B.3.1 Операции, требующие транзакции

| Операция | Сервис | Файл | Почему атомарно |
|---|---|---|---|
| `save_graph(scenario_id, graph_in)` | scenario_service | `services/scenario_service.py` | DELETE всех старых nodes/edges + INSERT новых. При падении в середине — сценарий превращается в «половину графа», катастрофа. |
| `bulk_csv_upload(rows)` | user_service | `services/user_service.py` | Все N юзеров или ни одного. Если 50 из 100 создались и упало — admin не знает, кого повторять. |
| `start_attempt(user_id, scenario_id)` | attempt_service | `services/attempt_service.py` | Проверка active + INSERT attempt + INSERT первого step. Concurrent студент может создать две попытки (race condition). |
| `finish_attempt(attempt_id)` | attempt_service | `services/attempt_service.py` | UPDATE attempt (status, total_score, duration) + final INSERT step. Нельзя оставить completed attempt без финального шага. |
| `step(attempt_id, step_submit)` | attempt_service | `services/attempt_service.py` | Grade + INSERT step + UPDATE attempt.current_node_id + UPDATE attempt.total_score. Клиент может получить неконсистентный state. |
| `publish_scenario(scenario_id)` | scenario_service | `services/scenario_service.py` | validate_graph + UPDATE status + INSERT log. Если падение после validate но до UPDATE — сценарий навсегда «почти опубликован». |
| `restore_backup(filename)` | backup_service | `services/backup_service.py` | set maintenance_mode + abandon attempts + dispose engine + pg_restore. Детально в §T.5 ADDENDUM. |
| `delete_user(user_id)` | user_service | `services/user_service.py` | Soft delete + cascade удаление связей + log. Если упало между — юзер `is_active=false`, но остался в группах. |
| `assign_scenario(scenario_id, group_id)` | scenario_service | `services/scenario_service.py` | Проверка published + INSERT в scenario_groups + log. Нельзя оставить «наполовину назначенный». |

### B.3.2 Паттерн SQLAlchemy 2 для транзакции

```python
# server/services/scenario_service.py
from sqlalchemy.orm import Session

def save_graph(db: Session, scenario_id: int, graph_in: GraphIn, actor_id: int) -> ScenarioFullOut:
    """Полная замена графа атомарно."""
    with db.begin():  # контекст-менеджер гарантирует commit или rollback
        # 1. Проверить существование + право на редактирование
        scenario = db.query(Scenario).filter_by(id=scenario_id).with_for_update().one_or_none()
        if scenario is None:
            raise HTTPException(404, "Сценарий не найден")
        if scenario.status == "published":
            raise HTTPException(409, "Сначала снимите сценарий с публикации")

        # 2. Удалить старые узлы и рёбра (CASCADE через FK не используем — явнее здесь)
        db.query(ScenarioEdge).filter_by(scenario_id=scenario_id).delete(synchronize_session=False)
        db.query(ScenarioNode).filter_by(scenario_id=scenario_id).delete(synchronize_session=False)

        # 3. Вставить новые
        for node in graph_in.nodes:
            db.add(ScenarioNode(scenario_id=scenario_id, **node.model_dump()))
        for edge in graph_in.edges:
            db.add(ScenarioEdge(scenario_id=scenario_id, **edge.model_dump()))

        # 4. Обновить метаданные
        scenario.updated_at = datetime.utcnow()
        scenario.version += 1

        # 5. Лог
        db.add(SystemLog(
            level="INFO", message="Graph saved",
            user_id=actor_id,
            data={"scenario_id": scenario_id, "nodes": len(graph_in.nodes), "edges": len(graph_in.edges)},
        ))
        # commit происходит при выходе из with

    db.refresh(scenario)
    return ScenarioFullOut.model_validate(scenario)
```

Ключевые моменты:
- `with db.begin()` — транзакция на весь блок
- `with_for_update()` — SELECT FOR UPDATE защищает от concurrent изменений
- `synchronize_session=False` — оптимизация bulk delete
- Явное увеличение `version` — optimistic locking для клиента (React Flow показывает «Ваши изменения устарели» если version в ответе > version в state)

### B.3.3 Тест атомарности (паттерн)

```python
# server/tests/test_scenario_service.py
def test_save_graph_is_atomic_on_failure(db_session, sample_scenario):
    """Если что-то падает в середине save_graph — ни одного изменения в БД."""
    original_version = sample_scenario.version
    original_edges = db_session.query(ScenarioEdge).filter_by(scenario_id=sample_scenario.id).count()

    bad_graph = GraphIn(
        nodes=[NodeOut(id="node_1", type="start", position={"x": 0, "y": 0}, data={})],
        edges=[EdgeOut(id="edge_bad", source="node_1", target="node_99_nonexistent", label=None)],
    )

    # Искусственно ломаем вставку: ScenarioEdge с target на несуществующий node_id
    # (если FK constraint есть) или monkey-patch, чтобы упасть в середине
    with pytest.raises(Exception):
        save_graph(db_session, sample_scenario.id, bad_graph, actor_id=1)

    # Проверяем: ничего не изменилось
    db_session.refresh(sample_scenario)
    assert sample_scenario.version == original_version
    assert db_session.query(ScenarioEdge).filter_by(scenario_id=sample_scenario.id).count() == original_edges
```

### B.3.4 Concurrent access: UNIQUE INDEX защищает start_attempt

У нас есть **partial UNIQUE index** в §8.1:

```sql
CREATE UNIQUE INDEX idx_attempts_active
    ON attempts(user_id, scenario_id) WHERE status = 'in_progress';
```

Это гарантирует, что **никакой race condition** не создаст две активные попытки — PostgreSQL отклонит второй INSERT с `IntegrityError`, ловим и возвращаем 409:

```python
# server/services/attempt_service.py
def start_attempt(db: Session, user_id: int, scenario_id: int) -> AttemptStartOut:
    try:
        with db.begin():
            attempt = Attempt(user_id=user_id, scenario_id=scenario_id, status="in_progress", ...)
            db.add(attempt)
            db.flush()  # триггерит INSERT и ловим IntegrityError сразу
            # ... дальше INSERT первого step
    except IntegrityError:
        raise HTTPException(409, "У вас уже есть активная попытка по этому сценарию")
    return AttemptStartOut.model_validate(attempt)
```

---

## §B.4 Database indexing deep-dive

Расширяет `.claude/agents/database-optimizer.md`.

### B.4.1 Когда какой тип индекса

| Тип | Когда использовать | Когда НЕ использовать | У нас применяется |
|---|---|---|---|
| **B-tree** (default) | Equality (`=`), range (`<`, `>`, `BETWEEN`), `ORDER BY`, `LIKE 'abc%'` | Когда поле изменяется часто + редко фильтруется | все `idx_*` в §8.1 |
| **GIN** | JSONB, full-text search, array containment (`@>`) | Write-heavy таблицы (медленный INSERT) | `idx_nodes_data_gin` на `node_data` (§Q.1) |
| **BRIN** | Огромные таблицы с физической упорядоченностью по значению (например, `created_at`) | Маленькие таблицы, неупорядоченные данные | Потенциально — `system_logs.created_at` при росте |
| **GiST** | Геоданные, диапазоны | Для обычных equality запросов | — |
| **Hash** | Только equality, быстрее B-tree на сравнении | Любые range | — (B-tree универсальнее) |

### B.4.2 Когда индекс замедляет

B-tree индекс — это **дополнительное дерево**, которое PostgreSQL обновляет при каждом INSERT/UPDATE/DELETE. Слишком много индексов на write-heavy таблице → тормозит запись.

**Правило большого пальца:** начинаем с **индексов только на поля, которые реально фильтруются или сортируются**. Добавляем только по факту медленных запросов (профилирование через `EXPLAIN ANALYZE`).

Наши таблицы по write-intensity:

| Таблица | Write rate | Индексов в §8.1+§Q | Комментарий |
|---|---|---|---|
| `attempt_steps` | **Высокий** (каждый шаг студента) | 2 (`attempt_id`, composite `attempt_node`) | Минимум, норм |
| `attempts` | Средний | 4 + partial UNIQUE | Ok, partial UNIQUE — критичен |
| `system_logs` | **Высокий** (INFO+WARNING) | 2 (`level`, `date`) | **При росте >1 млн записей → рассмотреть BRIN на `created_at`** |
| `scenario_nodes` | Низкий (только при save_graph) | 1 + GIN | Ok |
| `users` | Низкий (редкие changes) | 3 | Ok |

### B.4.3 Правило NOT NULL для поисковых полей

PostgreSQL B-tree индекс **включает NULL значения**, но они скрывают оптимизации. Если поле NEVER NULL, объявить `NOT NULL` → планировщик знает и экономит работу на фильтрации:

```sql
-- ❌ Медленнее
email VARCHAR(200),
CREATE INDEX idx_email ON users(email);
SELECT * FROM users WHERE email = 'x';  -- planner считает NULL как возможное значение

-- ✓ Быстрее
email VARCHAR(200) NOT NULL,
CREATE INDEX idx_email ON users(email);
SELECT * FROM users WHERE email = 'x';  -- planner знает: нет NULL-записей
```

**Проверить в наших моделях:** все поля, указанные как `NOT NULL` в §8.1 (`roles.name`, `users.username`, `users.password_hash`, `scenarios.status`, и т.д.) — при создании через Alembic должны иметь `nullable=False`.

### B.4.4 Partial Index — мощный приём

Наш `idx_attempts_active` — отличный пример. Индексируем **только строки WHERE status='in_progress'**:

```sql
CREATE UNIQUE INDEX idx_attempts_active
    ON attempts(user_id, scenario_id) WHERE status = 'in_progress';
```

Преимущества:
- **Меньше размер** (только активные попытки — ~N студентов в моменте, ~30 записей)
- **UNIQUE constraint применяется только к активным** — у юзера может быть N completed/abandoned попыток, но только 1 in_progress
- **Быстрее** проверка при `start_attempt`

Ещё где можем добавить partial indexes:

```sql
-- Только для scenarios.status='published' — основной фильтр для студентов
CREATE INDEX idx_scenarios_published
    ON scenarios(updated_at DESC) WHERE status = 'published';

-- Только для ERROR+WARNING логов — admin смотрит только их
CREATE INDEX idx_logs_errors
    ON system_logs(created_at DESC) WHERE level IN ('WARNING', 'ERROR');
```

**Добавить в ADDENDUM §Q (update):** два partial index выше.

### B.4.5 EXPLAIN ANALYZE — обязательный инструмент

Для любого запроса в `analytics_service.py` при разработке:

```python
# В dev-режиме логируем планы запросов
result = db.execute(text("EXPLAIN ANALYZE " + raw_query), params)
for row in result:
    logger.debug(row[0])
```

Критерии приёмки:
- Analytics heatmap: `Execution Time < 500 ms` для 30 студентов × 100 узлов
- `GET /api/scenarios/` list: < 100 ms
- `start_attempt`: < 50 ms

### B.4.6 Connection pool tuning для 30 пользователей

В `database.py` (§5.2):

```python
engine = create_engine(
    DATABASE_URL,
    pool_size=10,        # постоянных соединений
    max_overflow=20,     # временных при пике
    pool_pre_ping=True,  # проверка живости перед использованием
    pool_recycle=3600,   # пересоздавать соединение раз в час
)
```

Total = 30 одновременных соединений. Совпадает с нашим максимумом пользователей. При пике (все 30 одновременно делают request) — хватит. При превышении — новые запросы встают в очередь.

**Проверка в тестах:** pytest фикстура не должна держать соединение дольше теста (обязательно `try/finally` с `db.close()`).

---

## §B.5 Latency reference для back-of-envelope

Ориентиры для принятия архитектурных решений. Числа для современного hardware (ориентировочно).

### B.5.1 Базовые latency numbers

| Операция | Время | Применимость в EpiCase |
|---|---|---|
| L1 cache ref | 0.5 ns | — |
| L2 cache ref | 7 ns | — |
| Main memory ref | 100 ns | In-memory dict lookup |
| Compress 1KB (Zippy) | 10 µs | Сжатие JSON перед gzip response |
| 1KB send over 1 Gbps | 10 µs | LAN response |
| Read 4KB from SSD | 150 µs | PostgreSQL row fetch |
| Read 1MB from memory | 250 µs | Загрузка всех nodes сценария в память |
| **Round trip LAN (ВМедА)** | **~500 µs** | Browser → Nginx → FastAPI |
| Read 1MB sequential from SSD | 1 ms | Загрузка media-файла |
| **PostgreSQL indexed SELECT** | **~5 ms** | типичный API endpoint |
| HDD seek | 10 ms | (у нас SSD) |
| **PostgreSQL complex JOIN без индекса** | **100-500 ms** | аналитика на множестве attempts |
| Render React page (first paint) | ~100 ms | Client-side |
| **Overall API request (браузер → ответ)** | **30-200 ms** | типичная LAN-операция |

### B.5.2 Наши конкретные таргеты

| Endpoint | Target p95 | Критерий |
|---|---|---|
| `GET /api/ping` | < 10 ms | Health check |
| `GET /api/auth/me` | < 30 ms | JWT decode + 1 SELECT |
| `POST /api/auth/login` | < 150 ms | bcrypt verify (~100 мс ожидается) |
| `GET /api/scenarios/` list | < 100 ms | С joinedload |
| `GET /api/scenarios/{id}` full graph | < 200 ms | ~50 nodes + ~100 edges |
| `PUT /api/scenarios/{id}/graph` | < 500 ms | DELETE + 50 INSERTs + COMMIT |
| `POST /api/attempts/{id}/step` | < 150 ms | grader + INSERT step + UPDATE attempt |
| `GET /api/analytics/.../heatmap` | < 800 ms | Aggregation over N attempts |
| `GET /api/admin/logs` (paginated) | < 200 ms | С индексом |
| `POST /api/admin/backup` | < 30 s | pg_dump на всю БД |

**p95** = 95-й перцентиль. 5% запросов могут быть медленнее — это ок.

### B.5.3 Когда оптимизировать

Правило: **не оптимизируй, пока не измерил**. Но если профилирование (EXPLAIN ANALYZE + browser DevTools Network tab) показывает:

- Backend response > 500 ms → проверить индексы, N+1 queries, добавить `joinedload`/`selectinload`
- Frontend-rendered page > 1 s → проверить размер bundle, lazy loading, React Flow viewport culling
- Client-server round trip > 2 s → там что-то сильно не так, смотреть в логи Nginx + server

### B.5.4 Back-of-envelope для архитектурных решений

**Пример 1:** «Нужен ли кэш для `GET /api/scenarios/`?»

- 30 студентов × ~10 запросов сценариев в занятии = 300 запросов / 45 минут = 7 req/min
- PostgreSQL с индексом: ~5 ms
- Нагрузка на БД: 7 × 5 = 35 мс DB-времени / минуту = **0.06% CPU**

Вывод: **кэш не нужен**. ADR-005 подтверждён.

**Пример 2:** «Успеет ли сгенерировать PDF отчёт за 3 секунды?»

- Reportlab: генерация ~10 страниц PDF ~500 мс
- 2 embedded PNG (гистограмма) через matplotlib: ~1 s
- Total: ~1.5 s ✓

Вывод: достаточно синхронной генерации, async не нужен.

**Пример 3:** «Выдержит ли PostgreSQL все 30 студентов, одновременно жмущих Submit?»

- 30 concurrent `POST /step` за 1 секунду
- Каждый: bcrypt skip (JWT уже decoded), grader ~10 ms, INSERT step ~5 ms, UPDATE attempt ~5 ms = ~20 ms DB-времени
- Pool size: 10 + 20 overflow = 30 → все разбираются за ~20 ms
- Total: ~20-30 мс на студента, worst case 30 мс × все = **все получают ответ за 30-50 мс**

Вывод: выдержит с большим запасом.

### B.5.5 Добавить в документ референс-карточку

Добавить в `docs/BEST_PRACTICES.md` раздел «Quick latency reference» для агентов. При любом вопросе «нужен ли кэш/очередь/async» — сначала back-of-envelope по этим числам.

---

## Сводка: что изменяется в проекте

### ADDENDUM обновления

| Раздел | Изменение |
|---|---|
| §A.6 | `PUT /api/users/{id}/status` вместо `POST /toggle-active` (E-13) |
| §6.4 публикация | Добавить: «Повторный publish/unpublish возвращает 200 если уже в целевом состоянии» (E-14) |
| §6.8 settings | `PUT /api/admin/settings` вместо `PATCH` (E-15) |
| §E.1 export | `GET ...?format=xlsx|pdf` вместо `.xlsx`/`.pdf` в URL (E-16) |
| §Q (update) | Добавить 2 partial index: `idx_scenarios_published`, `idx_logs_errors` |

### Новые ADR

- **ADR-013:** At-rest БД encryption отложено до V2 (LUKS). Принятый risk. (E-19)

### Обновления кода/конфигов

- `server/main.py`: `docs_url=None` в prod (E-17)
- `scripts/verify.sh`: добавить grep на f-strings внутри `text()` (E-20)
- `client/package.json`: `dompurify^3.2.3` + `@types/dompurify` (XSS в data-узлах)
- `.env.example`: добавить `ENV=prod` / `ENV=dev`

### Новые задачи в AGENT_TASKS.md

- Stage 4: `test_scenario_service::test_save_graph_is_atomic_on_failure` (B.3.3)
- Stage 3: `test_attempt_service::test_start_attempt_concurrent` (B.3.4)
- Stage 9: санитизация `content_html` через DOMPurify в `DataView.tsx`

### Обновления агентов

- `.claude/agents/backend-architect.md`: добавить REST checklist (B.1.4)
- `.claude/agents/security-engineer.md`: заменить на extended OWASP checklist (B.2.3)
- `.claude/agents/database-optimizer.md`: добавить правила B.4.1–B.4.4
