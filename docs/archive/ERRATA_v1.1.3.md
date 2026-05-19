# EpiCase — ERRATA v1.1.1

> Список изменений от v1.1 → v1.1.1.
> Производитель: Claude Opus 4.7 · Дата: 2026-04-17
>
> **Две группы изменений:**
> 1. Смена ведущей модели: **Claude Opus 4.6 → Claude Opus 4.7** (вышел 2026-04-16)
> 2. Вторичный аудит пакета на ошибки и неточности — **найдено и исправлено 12 проблем**

---

## Часть 1. Смена модели на Claude Opus 4.7

### 1.1 Что известно о новой модели

Claude Opus 4.7 выпущен Anthropic 16 апреля 2026 года. Model-string в API: `claude-opus-4-7`. Цена та же, что у 4.6: $5/$25 за миллион токенов. Ключевые отличия относительно 4.6, релевантные для проекта EpiCase:

| Изменение | Влияние на EpiCase |
|---|---|
| **+13% на coding benchmark**, 3x больше решённых production-задач | Основная рабочая метрика — код будет писаться увереннее |
| **Новый tokenizer**: тот же вход → 1.0–1.35× токенов | Не влияет на архитектуру; бюджеты token consumption могут вырасти |
| **Breaking change**: `temperature`, `top_p`, `top_k`, extended thinking budgets → 400 ошибка | В проекте не используются (в Claude Code — adaptive thinking by default), действий не требуется |
| **Новый effort level `xhigh`** между high и max | Anthropic рекомендует `xhigh` для coding и agentic задач — подходит для нашего Stage 1+ |
| **Улучшенная file-system memory** для multi-session работы | Полностью соответствует нашему паттерну `MEMORY.md` |
| **Vision up to 3.75 MP** (было 1.15) | Важно для обработки изображений в `data`-узлах (фото пациентов, таблицы результатов) — **уточнение в DESIGN_SYSTEM §5.3** не требуется, но в `node_image` limit 10 MB это уже покрыто |

### 1.2 Где меняется строка идентификации модели

Обновлены ВСЕ упоминания в пакете + три файла самого проекта:

| Файл | Было | Стало |
|---|---|---|
| `README.md` | Claude Opus 4.6 | Claude Opus 4.7 |
| `docs/AUDIT_REPORT.md` | Claude Opus 4.6 (15 мест) | Claude Opus 4.7 |
| `docs/AGENT_TASKS.md` | Claude Opus 4.6 (8 мест) | Claude Opus 4.7 |
| `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md` | Claude Opus 4.6 (5 мест) | Claude Opus 4.7 |
| `epicase/CLAUDE.md` | `Your Role (Claude Opus 4.6)` | `Your Role (Claude Opus 4.7)` |
| `epicase/AGENTS.md` | `Claude Opus 4.6` | `Claude Opus 4.7` |
| `epicase/.claude/settings.json` | `"model": "claude-opus-4-6"` | `"model": "claude-opus-4-7"` |
| `epicase/MEMORY.md` | — | Новая запись Stage 0.5 |

В `epicase/docs/PROJECT_DESIGN_EPICASE_v1.md` (оригинальный документ) упоминания 4.6 **не трогаются** — этот документ помечен как устаревший в части §20, новая правда в `PROJECT_DESIGN_ADDENDUM_v1.1.md §X`.

### 1.3 Что делать пользователю

После применения пакета:
1. Убедиться, что в `.claude/settings.json` стоит `"model": "claude-opus-4-7"`
2. Claude Code сам подхватит новую модель при следующем запуске
3. Действия по миграции кода не требуются (никакого API-кода с `temperature`/`top_p` в проекте нет)

---

## Часть 2. Найденные ошибки и неточности — исправлено 12 штук

### E-01 (🔴 техническая ошибка) — Forward reference в Pydantic
**Где:** `PROJECT_DESIGN_ADDENDUM_v1.1.md §R.5`
**Проблема:** `AttemptStartOut` использует `NodeOut` через строку-forward-reference, но `NodeOut` определён в другом модуле (`schemas/scenario.py`). Без явного импорта или `model_rebuild()` Pydantic v2 упадёт в runtime с `PydanticUndefinedAnnotation`.
**Исправление:** Добавлен явный импорт в пример кода + комментарий о необходимости `AttemptStartOut.model_rebuild()` после регистрации обоих классов.

### E-02 (🔴 техническая ошибка) — Деление на ноль в partial scoring
**Где:** `ADDENDUM §B.3`, формула `max_score × (tp − fp) / len(correct_ids)`
**Проблема:** Если `correct_ids` пусто (невалидный но теоретически возможный кейс), — `ZeroDivisionError`.
**Исправление:** Добавлена защита: `if not correct_ids: return GradeResult(score=0, ..., is_correct=False, feedback="Узел некорректно настроен")`. Плюс validator на сохранение графа, запрещающий decision-узлы без хотя бы одного correct edge.

### E-03 (🔴 техническая ошибка) — Regex password policy пропускает «ё»
**Где:** `ADDENDUM §T.1`, regex `[A-Za-zА-Яа-я]`
**Проблема:** Символы Ё (U+0401) и ё (U+0451) находятся вне диапазона А-Я (U+0410–U+042F) и а-я (U+0430–U+044F). Русский пароль «Ёжик123!» не пройдёт validation, хотя букву содержит.
**Исправление:** Regex → `[A-Za-zА-ЯЁа-яё]`.

### E-04 (🟡 опасная процедура) — run_migrations после restore
**Где:** `ADDENDUM §T.5 шаг 9`: «Вызываем `run_migrations()` на случай, если бэкап старее текущей схемы»
**Проблема:** Если бэкап **свежее** текущего кода (например, откатили версию приложения), `alembic upgrade head` попытается применить уже применённые миграции и упадёт. Ещё хуже — если в бэкапе есть миграции из будущего.
**Исправление:** Шаг 9 теперь проверяет `alembic current` **до** и **после** restore: если `current > head` — лог WARNING «Backup contains newer migrations; application may not work correctly» и не даёт запускать `upgrade`. Если `current < head` — нормальный `upgrade head`.

### E-05 (🟡 missing detail) — SERIAL sequence после seed
**Где:** `ADDENDUM §S.4` — INSERT'ы с явными `id: 1, 2` в `form_templates`
**Проблема:** После явной вставки PK sequence `form_templates_id_seq` остаётся на 1. Следующий INSERT без id выдаст id=1 и `UniqueViolation`.
**Исправление:** Добавлен шаг в `seed.py`: после всех явных вставок — `SELECT setval('form_templates_id_seq', (SELECT MAX(id) FROM form_templates))`. То же для `disciplines_id_seq`, `topics_id_seq`, `roles_id_seq`.

### E-06 (🟡 несогласованность) — Миграция с `attempts.expires_at`
**Где:** `ADDENDUM §U.3`: «добавить поле в миграции 001»
**Проблема:** В §13 оригинала миграция 001 — это `initial_schema` (users/roles/groups). Attempt-таблица должна быть в отдельной миграции. Путаница с нумерацией.
**Исправление:** Переименование миграций в AGENT_TASKS:
- 001 — users/roles/groups/disciplines/topics/form_templates
- 002 — scenarios/nodes/edges/scenario_groups + GIN index + archived status
- 003 — attempts/attempt_steps (с expires_at сразу) + partial UNIQUE idx
- 004 — media_files/system_settings/system_logs

### E-07 (🟡 ambiguous terminology) — user_id vs actor_id
**Где:** `AUDIT_REPORT.md I-07`, `ADDENDUM §T.4`
**Проблема:** В одном месте называется `user_id`, в другом `actor_id`. Одно и то же поле в таблице `system_logs`.
**Исправление:** По всему пакету — везде `actor_id` (термин аудита) в прозе, а в SQL/Python — `user_id` (имя колонки). Чётко прописано в §T.4: «field name `user_id`, semantic meaning: actor_id».

### E-08 (🟡 unclosed gap) — Зачем postgresql-client в Dockerfile
**Где:** `AUDIT_REPORT.md I-11` обещает «упомянуть в §T.5», но в ADDENDUM §T.5 упоминание отсутствовало.
**Исправление:** В §T.5 добавлен preamble: «`pg_dump` и `pg_restore` — утилиты PostgreSQL, поставляются в пакете `postgresql-client`, установлен в `server/Dockerfile`. Запускаются через `subprocess`, не через SQLAlchemy».

### E-09 (🟡 inconsistency) — Количество тестов для Stage 5
**Где:** `AGENT_TASKS.md` противоречие: в разделе Stage 5 написано «≥8 тестов» (Button, Input, LoginPage, ProtectedRoute), а в таблице метрик готовности — «15 тестов».
**Проблема:** UI kit — 12 компонентов × минимум 2 теста = ≥24 теста. Цифра 8 в Stage 5 занижена.
**Исправление:** В Stage 5 заменено на «≥24 тестов (12 UI компонентов × 2 минимум + LoginPage + ProtectedRoute + Layout)». В таблице метрик — «≥25».

### E-10 (🟡 misleading) — «all tests green» в Stage 0 commit
**Где:** `AGENT_TASKS.md`: первый коммит `feat: Stage 0 — infra + design system integrated [all tests green]`
**Проблема:** В Stage 0 тестов ещё нет. Маркер `[all tests green]` вводит в заблуждение.
**Исправление:** → `feat: Stage 0 — infrastructure verified + design system [no tests yet]`.

### E-11 (🔵 стилистика) — Повторное определение поля password
**Где:** `ADDENDUM §R.2`: `class UserCreate(PasswordValidator)` + `password: str = Field(...)`
**Проблема:** Наследуется `PasswordValidator.password` + переопределяется в `UserCreate` с другими ограничениями. В Pydantic v2 это работает (последнее определение побеждает), но неидиоматично.
**Исправление:** Переделано через `Annotated[str, AfterValidator(check_password_complexity)]` — более канонично для Pydantic v2. Код в §R.2 обновлён.

### E-12 (🔵 UX-детали) — Adaptive thinking в Claude Code
**Где:** CLAUDE.md, AGENTS.md не упоминают уровни reasoning.
**Проблема:** В Opus 4.7 новый default `xhigh` для сложных задач. Для `graph_engine` и `grader_service` — ожидаемо `xhigh`, для рутинного CRUD — `medium` достаточно.
**Исправление:** В CLAUDE.md добавлена секция «Effort levels»:
- `medium` — простой CRUD, модели, схемы
- `high` — роутеры, сервисы, integration
- `xhigh` — `graph_engine`, `grader_service`, `backup_service.restore`, security audit

---

## Часть 3. Интеграция system-design-primer — 8 дополнительных исправлений + ADR-013

Источник: `docs/BEST_PRACTICES.md` (системный audit API и security на основе [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer)). Из 15+ концепций применимо 5 (REST, OWASP, ACID, indexing, latency) — остальные отклонены в ADR-001..008.

### E-13 (🔴 REST нарушение) — `POST /toggle-active` неидемпотентен
**Где:** ADDENDUM §A.6, оригинал §6.2
**Проблема:** `POST /api/users/{id}/toggle-active` — два последовательных вызова приводят к разному состоянию. При сетевом retry админ может **случайно разблокировать** юзера.
**Исправление:** `PUT /api/users/{id}/status` с телом `{"is_active": bool}` — идемпотентный по определению PUT. Подробности: `BEST_PRACTICES.md §B.1.3`.

### E-14 (🟡 REST ambiguity) — publish/unpublish не идемпотентны
**Где:** оригинал §6.4
**Проблема:** `POST /publish` на уже published сценарий может упасть или вести себя недетерминированно.
**Исправление:** добавлено в §6.4 ADDENDUM: «Повторный вызов publish на published сценарии возвращает 200 с текущим объектом, не 409». То же для unpublish на draft.

### E-15 (🟡 REST mismatch) — PATCH вместо PUT для settings
**Где:** оригинал §6.8 `PATCH /api/admin/settings`
**Проблема:** UI всегда отправляет все настройки (одна форма). Семантически это replace, не partial update → `PUT` правильнее.
**Исправление:** `PUT /api/admin/settings`. PATCH зарезервирован для случаев, когда клиент отправляет только изменённые поля.

### E-16 (🟡 REST anti-pattern) — расширение файла в URL path
**Где:** ADDENDUM §E.1 `GET /scenario-stats.xlsx`, `.pdf`
**Проблема:** расширение в path создаёт 3 «разных» эндпоинта для одной операции. Правильный подход — content negotiation.
**Исправление:** `GET /api/analytics/teacher/scenario-stats?format=json|xlsx|pdf`. Query parameter проще `Accept` headers, читается в URL.

### E-17 (🔴 security OWASP A05) — `/api/docs` публично доступен
**Где:** `server/main.py` — по умолчанию FastAPI отдаёт Swagger UI всем.
**Проблема:** В LAN злоумышленник видит полную схему API без авторизации — help для SQLi и authz-атак.
**Исправление:** `docs_url=None` в prod через env:
```python
app = FastAPI(
    docs_url="/api/docs" if os.getenv("ENV") == "dev" else None,
    openapi_url="/api/openapi.json" if os.getenv("ENV") == "dev" else None,
)
```
Добавить `ENV=prod` в prod `.env`, `ENV=dev` в dev.

### E-18 (🟡 security OWASP A02) — JWT secret rotation не описана
**Где:** ADDENDUM §T.1, SCALE
**Проблема:** если `JWT_SECRET` скомпрометирован — нет документированной процедуры замены.
**Исправление:** добавлено в `BEST_PRACTICES.md §B.2.2 E-18` + в SCALE.5 ADDENDUM:
1. Сгенерировать новый `openssl rand -hex 32`
2. Обновить `.env`
3. `docker compose restart server`
4. Все токены становятся недействительными → клиенты автоматически получают 401 → logout.

### E-19 (🟡 security OWASP A02) — БД at-rest encryption не решено
**Где:** volume PostgreSQL не зашифрован.
**Проблема:** для военно-медицинского заведения — риск при физическом доступе к серверу.
**Исправление:** **ADR-013 (принятый риск)**: в MVP v1.0 не шифруем. План для V2 — LUKS на `/var/lib/postgresql`. Фиксация принятого решения предотвращает случайное накручивание сложности в V1, при этом риск явно задокументирован.

### E-20 (🔴 security OWASP A03) — grep-защита от SQL injection в `text()`
**Где:** `server/services/analytics_service.py`, `log_service.py`
**Проблема:** f-strings внутри `text()` → SQL injection. Может случайно просочиться при рефакторинге.
**Исправление:** добавлено правило в `scripts/verify.sh`:
```bash
if grep -rnE 'text\(f["\x27]' server/ --include='*.py'; then
    fail "SECURITY: f-string inside text() — use parameterized queries"
fi
```

### ADR-013 — At-rest БД encryption отложено до V2 (новый ADR)
**Контекст:** PostgreSQL volume хранится plain. Потенциальный риск при физическом доступе.
**Решение:** не шифруем в MVP. В V2 — LUKS на disk level (прозрачно для приложения, ключ вводит admin при boot).
**Обоснование:** IT-отдел ВМедА из 2 человек, процедура ввода LUKS-ключа после каждого ребута требует обучения. В контексте **изолированной** LAN риск несанкционированного доступа ниже, чем в публичных системах. Физическая безопасность серверной — ответственность академии.
**Когда пересматривать:** если регулятор потребует, либо при масштабировании на несколько академий.

---

---

## Часть 4. UX-дополнение — 1 исправление

### E-21 (🟡 UX gap) — Frontend 404 / not-found pattern не спроектирован

**Где:** `ADDENDUM §U.8`, оригинал §12 (клиентская архитектура), `AGENT_TASKS.md` Stage 5
**Проблема:** У нас в роутинге нет catch-all (`<Route path="*">`), нет `NotFoundPage`, нет `ForbiddenPage`, нет паттерна для API 404. При переходе на `/unknown-path` или после restore backup (bookmark на удалённый сценарий) пользователь видит пустую страницу — пугающий UX.

Backend 404 полностью покрыт (HTTP codes, REST rules в §B.1), но frontend не обрабатывает.

**Исправление:** 4 новых артефакта:

1. **`NotFoundPage.tsx`** — страница для catch-all roule. Иконка search, сообщение «Страница не найдена», текущий URL, 2 кнопки («Назад», «На главную» — URL зависит от роли через authStore). Детали: §U.8 ADDENDUM.

2. **`ForbiddenPage.tsx`** — страница `/forbidden` для случаев когда `ProtectedRoute` не может сделать redirect (редкие кейсы, обычно toast+navigate достаточно). Иконка lock, описание, кнопка «Назад».

3. **`ResourceNotFound.tsx`** — обёртка над `<EmptyState>` с контекстом: «Кейс не найден», «Попытка не найдена» и т.д., + кнопка «К списку {context}». Используется в `*DetailPage` компонентах когда API вернул 404.

4. **`useResourceQuery<T>` hook** — универсальная обёртка над `useQuery` из TanStack Query: ловит 404, возвращает `null` вместо throw. Компоненты проверяют `data === null` → рендерят `ResourceNotFound`. Обычные error states (500, network) работают как раньше (throw).

**Catch-all в роутинге:**
```tsx
<Route path="*" element={<NotFoundPage />} />   {/* обязательно последним! */}
```

**Правила code-reviewer:**
- Каждый `*DetailPage.tsx` обязан проверять `data === null` → `<ResourceNotFound>`
- Axios interceptor НЕ перехватывает 404 на GET (это делает hook)
- Axios interceptor ПЕРЕХВАТЫВАЕТ 404 на POST/PUT/DELETE → toast
- `NotFoundPage` / `ForbiddenPage` — только router-level

**Новые задачи в Stage 5:**
- `NotFoundPage.tsx` + test (render + кнопки)
- `ForbiddenPage.tsx` + test
- `ResourceNotFound.tsx` + test
- `useResourceQuery.ts` + test (404 → null, 500 → throw)
- Catch-all route в `App.tsx`

Итого: +4 компонента, +4 теста. Обновлён целевой счётчик Stage 5: `≥26` → `≥30` тестов.

---

## Часть 5. Обновлённая сводка

**Итого исправлено:** 12 (v1.1.1) + 8 (v1.1.2) + 1 (v1.1.3) = **21 техническая проблема**.
**Итого ADR:** 12 + 1 (ADR-013) = **13**.
**Новые документы в пакете:** `BEST_PRACTICES.md` (5 разделов, ~500 строк).

---

## Что осталось как есть (проверено, ошибок не найдено)

- `design/epicase-design-system.svg` — валидный XML, все `<use>` ссылки корректны, цвета соответствуют палитре из задания
- `design/DESIGN_SYSTEM.md` — все 12 разделов согласованы, token-значения корректны, Tailwind v4 `@theme` синтаксис валиден
- Все эндпоинты API в ADDENDUM синхронизированы с §6 оригинала + добавленные в §A
- Схемы БД в §Q.1 (новые индексы) не конфликтуют с §8.1

---

## Перевыпущенные файлы пакета v1.1.1

| Файл | Статус |
|---|---|
| `README.md` | 🔄 обновлён |
| `design/epicase-design-system.svg` | ✓ без изменений |
| `design/DESIGN_SYSTEM.md` | ✓ без изменений |
| `docs/AUDIT_REPORT.md` | 🔄 обновлён (имя модели + I-07 actor_id) |
| `docs/PROJECT_DESIGN_ADDENDUM_v1.1.md` | 🔄 обновлён (12 исправлений + имя модели) |
| `docs/AGENT_TASKS.md` | 🔄 обновлён (имя модели + E-09, E-10) |
| `docs/ERRATA_v1.1.1.md` | ✨ новый (этот файл) |
| `docs/AGENT_ROSTER.md` | ✨ новый (компактный мастер-список) |
| `patches/CLAUDE.md` | ✨ новый (обновлённая версия корневого файла проекта) |
| `patches/AGENTS.md` | ✨ новый (обновлённая версия) |
| `patches/.claude/settings.json` | ✨ новый (model: claude-opus-4-7) |
| `patches/MEMORY.md` | ✨ новый (обновлённый для Stage 0.5) |
