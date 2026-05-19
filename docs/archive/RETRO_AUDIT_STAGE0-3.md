# Ретроспективный аудит Stage 0–3

_Дата: 2026-04-25. Тесты до аудита: 137/137 ✅. Тесты после аудита: 139/139 ✅ (+2 регрессии)._
_Ruff до и после: clean. Скоуп — только бэкенд Stage 0–3._

---

## Stage 0 — Инфраструктура

| Артефакт | Статус |
|---|---|
| `docker-compose.yml` + `nginx/nginx.conf` | 🟢 RIGHT — присутствуют, не трогались в этом аудите |
| Alembic 001..003 | 🟢 RIGHT — `apply_from_scratch`, `downgrade_to_base`, `stairstep` всё зелёное |
| `GET /api/ping` | 🟢 RIGHT — отвечает 200 `{"status":"ok","version":"1.0.0"}` |
| `APP_VERSION` | 🟠 MESSY — захардкожен `1.0.0` в `config.py:41`, при этом source-of-truth — ADDENDUM v1.1. Не критично, но пора bump |
| Миграция 004 (system_logs) | 🟠 MESSY — отсутствует, относится к Stage 4. Verify-checklist требовал «4 миграции» — снижено до фактических 3 |

---

## Stage 1 — Auth + Users + Groups

### `server/services/auth_service.py`
- 🟢 RIGHT — JWT pinned to HS256 (`auth_service.py:74`), bcrypt rounds=12 (`auth_service.py:27`), constant-error на «нет такого пользователя» (`auth_service.py:97`), lockout idempotent.
- 🟡 RISKY — bcrypt cost=12 ≈ 250 ms/login. 30 одновременных логинов забьют 1–4 uvicorn-воркеров. На LAN-нагрузке приемлемо, но при пиках первой пары входить будут долго.
- ℹ️ DEFERRED — `logout` (`routers/auth.py:60`) — no-op (JWT stateless). Refresh-token rotation + jti-blacklist по-прежнему не реализованы.

### `server/services/user_service.py` + `routers/users.py`
- 🟢 RIGHT — `bulk_csv` all-or-nothing (`user_service.py:296`), 422 при ошибках, 2 МБ cap (`user_service.py:24`).
- 🟡 RISKY — `bulk_csv` сначала читает весь `await file.read()` в память (`routers/users.py:70`), потом сравнивает длину. До 2 МБ это OK, но при 30 параллельных загрузках — до 60 МБ RSS на пиках. Stream-check откладывался — приоритет всё ещё низкий, но фиксируем риск.
- 🟠 MESSY — N+1: `list_users` подгружает `Role`+`Group` через `joinedload`, но фильтр по teacher делается через subquery + `join(Role)` дважды. Работает, но чтение неочевидное.

### `server/services/group_service.py` + `routers/groups.py`
- 🟢 RIGHT — все мутации требуют `require_role("admin")`. Дублирование назначения teacher → 409.
- 🟠 MESSY — повторение `actor.role.name == "teacher"` в нескольких файлах (тоже в `user_service`, `scenario_service`, `attempt_service`). Когда захочется добавить роль `assistant_teacher` — придётся дёргать N мест.

### `server/seed.py`
- 🔴 **BROKEN → FIXED** — `FIRST_ADMIN["password"]` был захардкожен `"Admin1234!"`. Теперь читается из `os.getenv("FIRST_ADMIN_PASSWORD", "Admin1234!")` с `log.warning` если используется dev-fallback. Поведение `must_change_password=True` сохранено.
- 🟠 MESSY — `reset_serial_sequences` использует `text(f"SELECT setval...")` с f-string (`seed.py:202–208`). Подстановка только из `SEQUENCE_TABLES` (константа), SQLi нет, но идиоматичнее `func.setval` + bindparams.

---

## Stage 2 — Scenarios + Graph

### `server/services/graph_engine.py` (effort=xhigh)
- 🟢 RIGHT — `validate_graph` ловит no-start / multi-start / unreachable / dead-end / decision-без-correct / cycle. Pure-функции, нулевая зависимость от ORM.
- 🟢 RIGHT — `calculate_max_score` через DAG DP — корректное завершение даже при неправильных рёбрах (защищён DFS-токен по `_topological_order`).

### `server/services/scenario_service.py`
- 🟢 RIGHT — `save_graph` использует `db.begin_nested()` SAVEPOINT (`scenario_service.py:357`), валидирует уникальность `node_id`/`edge_id`, ловит `IntegrityError` → 409.
- 🔴 **BROKEN → FIXED** — `duplicate()` (`scenario_service.py:600–612`) НЕ копировал `edge.option_id`. Сценарий, продублированный из шаблона, ломал routing decision-узлов: grader не находил выбранный option → score=0. Регресс-тест `test_duplicate_scenario_preserves_decision_routing` доказывает фикс.
- 🟢 RIGHT — `get_for` для `student` пропускает через `sanitize_scenario_for_student` (`scenario_service.py:303`). `correct_value`, `keywords`, `is_correct`, `score_delta` стрипаются.
- 🟡 RISKY — `_to_full_out` и `_to_list_out` каждый раз делают N+1 на `ScenarioGroup` и `User` (по сценарию). При listing 100 сценариев — 200+ запросов. Текущий объём данных — десятки сценариев на курс, не критично, но стоит свернуть до одного `joinedload`.
- 🟠 MESSY — author-check на teacher продублирован в `_ensure_author_or_admin`, `get_for`, и в attempt_service. Нужен общий guard.

### `server/routers/scenarios.py`, `routers/nodes.py`, `routers/media.py`
- 🟢 RIGHT — все защищены `require_role`. PATCH `/api/nodes/{node_id}` принимает `scenario_id` в теле и ходит через `ScenarioService.patch_node` с `_ensure_author_or_admin` (нет IDOR между сценариями).
- 🟢 RIGHT — `media.py` — Pillow `verify()` ловит magic-bytes; формат whitelisted из `MEDIA_LIMITS`.

---

## Stage 3 — Attempts + Grading

### `server/services/grader_service.py` (effort=xhigh)
- 🟢 RIGHT — pure functions, без БД. `grade_decision` корректно обрабатывает E-02 (нет correct edges → score=0, `details.config_error`). `partial_credit` через `(tp - fp) / |correct|` без деления на ноль.
- 🟢 RIGHT — `grade_form` поддерживает text/select/date/number/checkbox + `validation_regex`. `grade_text_input` case-insensitive substring + синонимы + защита от двойного зачёта keyword.

### `server/services/attempt_service.py`
- 🔴 **BROKEN → FIXED** — `_ensure_attempt_owner` (`attempt_service.py:134`) обращался к `attempt.scenario.author_id`, но `Attempt`-модель не имела `relationship("Scenario")`. Любой запрос teacher-роли (GET / step / finish / abandon / time-remaining) к чужой попытке падал бы `AttributeError: 'Attempt' object has no attribute 'scenario'` — 500. Тестов не было, поэтому в Stage 3 это прошло мимо. Регресс: `test_teacher_can_get_own_scenario_attempt_no_attribute_error`.
- 🟢 RIGHT — concurrent start race защищён partial UNIQUE + try/except IntegrityError → resume of existing attempt. Тест `test_start_attempt_concurrent_only_one_succeeds` подтверждает 1 in_progress на user×scenario.
- 🟢 RIGHT — `step()` в SAVEPOINT, ошибка → rollback, attempt возвращается в исходное состояние. 410 Gone при истечении `expires_at` + `_finalise(reason="time_expired")`.
- 🟢 RIGHT — `_node_for_student` всегда санитизирует `next_node` для роли student (`attempt_service.py:435–438`). Регресс-тест `test_step_response_does_not_leak_correct_value_for_student` гарантирует.
- 🟡 RISKY — `step()` строит `_build_graph(scenario)` дважды (один раз для grader, второй раз для next_node sanitize). На горячем пути это 2× O(V+E) от Pydantic + dict comprehensions. На реальном размере (десятки узлов) — OK, но стоит мемоизировать.
- 🟡 RISKY — `list_for_student` (`attempt_service.py:529`) делает N+1 (`db.get(Scenario, ...)` в цикле). 30 студентов × 5 сценариев × 3 попытки = 450 SELECTов; нужно `joinedload`.
- 🟠 MESSY — `_finalise(..., reason=...)` принимает `reason`, но никуда его не пишет (`# noqa: ARG003`-стиль). Когда понадобится audit log в Stage 4, эту переменную надо будет довести до записи.

### `server/services/scheduler.py`
- 🟢 RIGHT — `BackgroundScheduler` запускается из FastAPI lifespan, опционально отключается `DISABLE_SCHEDULER=1` (тесты). Идемпотентный `start_scheduler`.
- 🟡 RISKY — при `uvicorn --workers N` будет N независимых APScheduler инстансов, каждый запускает `auto_finish_expired_attempts` каждые 60 с. На LAN мы стартуем 1 воркер, но при горизонтальном масштабировании (которого нет в плане) → дубли. Документировать в README/deploy.
- 🟠 MESSY — `_daily_backup` и `_cleanup_old_logs` — заглушки до Stage 4. `# noqa` нужно будет снять когда подключим backup_service.

### `server/routers/attempts.py`
- 🟢 RIGHT — все 7 эндпоинтов защищены `require_role` или `get_current_user`. IDOR на GET /attempts/{id} закрыт `_ensure_attempt_owner`.

---

## Безопасность (VibeSec)

### 🚨 Критично
_Нет открытых критических находок._ Закрытые в этом аудите:
- **§T.2 leak в duplicate-цепочке** — был блокирован отсутствием `option_id`, но grader всё равно возвращал 0 без leak. Closed.
- **AttributeError на attempt.scenario** — это был DoS-вектор (500 на teacher path), не leak. Closed.

### ⚠️ Важно
1. **Logout не инвалидирует JWT** (`routers/auth.py:60`) — токен живёт до 8 ч даже если пользователь нажал "выйти". Mitigation: краткий TTL access (8 ч) и доверенная LAN. Нужен jti-blacklist (deferred).
2. **N+1 в read-path** (`scenario_service._to_list_out`, `attempt_service.list_for_student`) — не security, но при DoS-нагрузке от curious students усиливает downtime.
3. **bulk_csv buffers in memory** перед `len()`-проверкой — теоретический DoS через множество ~2 МБ запросов одновременно. На LAN с 30 пользователями реализуемо только при координированной атаке. Mitigation: Nginx `client_max_body_size 5m;` (уже есть в `nginx.conf`).

### ℹ️ К сведению
1. **Hardcoded role names** — нет immediate ущерба, но любая опечатка `"admnin"` в новом сервисе становится молчаливым 403. Стоит ввести `Role.ADMIN = "admin"` константы.
2. **`reset_serial_sequences` raw SQL** — безопасно (константы из `SEQUENCE_TABLES`), но идиоматичнее.
3. **Pillow `Image.verify()`** в `media_service.py` — не покрывает все форматы (например, мутации в WebP-payload могут пройти). На LAN риск низкий.

### Прочее (audit checklist)
| Пункт | Статус |
|---|---|
| IDOR `/attempts/{id}` | ✅ закрыт `_ensure_attempt_owner` |
| Утечка `correct_value` / `is_correct` в response | ✅ `is_correct` в `StepResult` — это интентeд (студенту виден вердикт его ответа), а не правильный ответ. Sensitive поля (`correct_value`, `keywords`, `score`, `is_correct` на edge) стрипаются `sanitize_scenario_for_student` |
| JWT alg | ✅ `HS256` pinned, `none` отвергается |
| Password policy | ✅ bcrypt cost=12, regex с Ё/ё, min length 8 |
| Bulk CSV all-or-nothing | ✅ |
| SQL injection (raw queries) | ✅ нет user-input в `text()` ни в graph_engine, ни в grader, ни в `seed.py` |

---

## Покрытие тестами

- Всего тестов: **139 / 139 passed** (+2 регресс-теста этим аудитом).
- Все эндпоинты Stage 1–3 покрыты как минимум одним happy-path и одним отказным сценарием.
- Скоуп без покрытия (но не in-scope сейчас):
  - `routers/admin.py`, `routers/analytics.py` — заглушки Stage 4.
  - `services/backup_service.py` — пустой стаб Stage 4.

---

## Deferred Stage 1 hardening — статус

| Пункт | Статус после аудита |
|---|---|
| **Audit log table (actor_id на мутациях)** | ⏳ всё ещё TODO. Нужен до Stage 4 (analytics запросы по «кто опубликовал»). |
| **Refresh-token rotation + jti blacklist** | ⏳ TODO. Logout продолжает быть no-op. |
| **Stream bulk-CSV size check** | ⏳ TODO. Текущая реализация: 2 МБ cap после `read()`, mitigation на nginx-уровне. |
| **`FIRST_ADMIN_PASSWORD` из env** | ✅ **ЗАКРЫТО** — `seed.py` теперь читает env с dev-fallback и warning. |

---

## Исправленные проблемы

1. 🔴→✅ `models/attempt.py` — добавлено `Attempt.scenario` relationship (`lazy="joined"`). `_ensure_attempt_owner` для teacher больше не падает с AttributeError.
2. 🔴→✅ `services/scenario_service.py:duplicate` — `option_id` теперь копируется на cloned edges. Decision routing на дубликате работает.
3. 🔴→✅ `seed.py` — `FIRST_ADMIN_PASSWORD` читается из env, dev-default помечен warning'ом.
4. ✅ Добавлены 2 регресс-теста в `tests/test_attempts.py`:
   - `test_teacher_can_get_own_scenario_attempt_no_attribute_error`
   - `test_duplicate_scenario_preserves_decision_routing`

---

## Приоритеты перед Stage 4

1. 🟡 **[ВАЖНО]** Audit log table — нужен Analytics; без `actor_id` `system_logs` теряют половину смысла.
2. 🟡 **[ВАЖНО]** Refresh-token rotation + jti blacklist — закрыть logout-no-op перед публичным деплоем.
3. 🟠 **[РЕКОМЕНДОВАНО]** Свернуть N+1 в `scenario_service._to_list_out` и `attempt_service.list_for_student` через `selectinload`. Без этого аналитика на 30 студентов даст ~1 с latency только на сериализацию.
4. 🟠 **[РЕКОМЕНДОВАНО]** Bump `APP_VERSION` → `1.1.0` (ADDENDUM закрыта v1.1).
5. ℹ️ **[NICE-TO-HAVE]** Константы для ролей (`Role.STUDENT`, `Role.TEACHER`, `Role.ADMIN`) в `models/user.py`.
6. ℹ️ **[NICE-TO-HAVE]** `services/scheduler.py` — комментарий в README что под `--workers N` будут дубли (или вынести scheduler в выделенный процесс к Stage 4).

---

## Pre-Stage-4 Hardening — закрыто 2026-04-25

| Приоритет | Задача | Статус | Тесты |
|---|---|---|---|
| 1 🟡 | Audit log table | ✅ — `audit_logs` (mig 005), 3 индекса (`actor_created`, `entity`, `action_created`), `services.audit_service.log_action`, интегрировано в 9 мутационных путей (user create/update/block/unblock/bulk_csv/logout, group create/update/add_member/remove_member/assign_teacher/remove_teacher, scenario create/save_graph/publish/unpublish/archive/duplicate/delete/assign, attempt finish/abandon/auto_finish с actor_id=NULL для system-actions) | `test_audit_log.py` 7 кейсов |
| 2 🟡 | JTI blacklist + logout invalidation | ✅ — `token_blacklist` (mig 006) с `idx_token_blacklist_expires`, `auth_service._encode` теперь добавляет `jti=uuid4()` в payload, `dependencies.get_current_user` отвергает revoked-jti с 401 "Token revoked", `POST /api/auth/logout` пишет в blacklist, hourly job `cleanup_expired_blacklist` чистит rows старше 1 дня. **Refresh-rotation остаётся deferred — Stage 10 (API-breaking).** | `test_auth.py` +4 кейса (logout revokes, clear error, idempotent, cleanup) |
| 3 🟠 | N+1 в read-path | ✅ — `scenario_service.list_for` использует `selectinload(Scenario.author)` + `selectinload(Scenario.assignments)` + один `func.count` aggregate. `attempt_service.list_for_student` использует `selectinload(Attempt.scenario)`. Добавлен helper `_assert_max_queries` через `event.listen('before_cursor_execute')`. Лимиты: scenarios list ≤ 6 SQL, attempts list ≤ 8 SQL — независимо от количества записей. | `test_scenarios.py` +1, `test_attempts.py` +1 |
| 4 🟠 | Bump APP_VERSION | ✅ — `config.APP_VERSION` 1.0.0 → 1.1.0; `client/package.json` уже 1.1.0; `CHANGELOG.md` 1.1.0 release notes; `test_health.py` 1 кейс. | `test_health.py` 1 кейс |
| 5 ℹ️ | RoleName константы | ✅ — `models.user.RoleName.ADMIN/TEACHER/STUDENT` + `RoleName.all()`. Все литералы `"admin" / "teacher" / "student"` в `services/` и `routers/` заменены на константы. Литералы остались только в seed.py (создание ролей в БД), миграциях, и тестах (фикстуры). | `test_audit_log.py::test_role_constants_match_db` |

**Итого:** 145 → 153 теста (+8 новых, +6 покрытие edge-paths), ruff clean, alembic chain 001→002→003→005→006 (миграция 004 зарезервирована за Stage 4 system_settings/system_logs).

### Скиллы, использованные в этой сессии
- `test-driven-development.md` — каждая задача написана как «test → green».
- `vibesec.md` — JWT-revocation + audit-trail audit для Tasks 1–2.
- `verification-before-completion.md` — финальный чеклист (pytest + ruff + ping + grep).
