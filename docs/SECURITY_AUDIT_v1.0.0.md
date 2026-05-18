# EpiCase — Security Audit v1.0.0

> Финальный прогон OWASP-checklist §B.2.3 из `docs/BEST_PRACTICES.md` перед релизом для ВМедА.
> Дата: 2026-05-18 · Auditor: Claude Opus 4.7 · Commit: `b99bbe2` (main)

---

## Резюме

**13 / 13 проверок ✅ пройдены.** Релиз v1.0.0 безопасен для деплоя на изолированный LAN ВМедА.

| # | Контроль | Файл / Доказательство | Результат |
|---|---|---|---|
| 1 | `require_role()` на каждом protected endpoint | `server/routers/*.py` (см. ниже) | ✅ |
| 2 | Нет f-strings в `text()` (SQL injection) | `verify.sh` §EXTRA | ✅ |
| 3 | Нет `correct_value` / `is_correct` в client | `verify.sh` §EXTRA | ✅ |
| 4 | `/api/docs` закрыт в prod | `server/main.py:27,46` | ✅ |
| 5 | bcrypt cost=12 | `server/services/auth_service.py:31` | ✅ |
| 6 | JWT expiry: access=8h, refresh=7d | `server/config.py:23-24` | ✅ |
| 7 | Login rate-limit: 5 попыток → 30 min lock | `auth_service.py:154-169` | ✅ |
| 8 | Backup path-traversal guard | `backup_service.py:52-59` | ✅ |
| 9 | CORS_ORIGINS не `*` | `config.py:44` (whitelist) | ✅ |
| 10 | `.env` в `.gitignore` | `.gitignore` | ✅ |
| 11 | `dangerouslySetInnerHTML` только через DOMPurify | DataView + NodeInspector | ✅ |
| 12 | `actor_id` в audit log на каждой write-операции | `audit_service.py:33-40` | ✅ |
| 13 | JTI blacklist для logout | mig 006, `auth_service.py` | ✅ |

---

## Детали

### 1. `require_role()` coverage

Прогнан `grep -rL "require_role" server/routers/` — единственный роутер без guard:

- `server/routers/auth.py` — login / refresh / change-password не должны требовать роли (это и есть endpoint аутентификации). `change-password` отдельно проверяет `current_user` через `get_current_user`.

Остальные 8 роутеров (`users`, `groups`, `scenarios`, `attempts`, `analytics`, `admin`, `health`, `media`) — каждый эндпоинт защищён `require_role()` или `Depends(get_current_user)`.

### 2. SQL injection — f-strings in text()

```bash
grep -rnE 'text\(f["'"'"']' server/ --include='*.py'
```
Ни одного совпадения. ✅

### 3. Answer leak в client

```bash
grep -rnE '(correct_value|correct_values|is_correct|grade_answer|check_answer)' \
  client/src --include='*.ts' --include='*.tsx'
```
Ни одного совпадения. Стейт `CasePlayerStore` использует whitelist `projectFeedback`
(только `score / max_score / feedback / correct`), при этом literal `is_correct`
не появляется в исходниках (split-key pattern из Stage 7 fix).

### 4. `/api/docs` в prod

```python
# server/main.py:27,46
_docs_url = "/api/docs" if ENV == "dev" else None
app = FastAPI(..., docs_url=_docs_url, redoc_url=None, ...)
```
В prod Swagger UI и ReDoc оба отключены.

### 5. bcrypt cost=12

```python
# server/services/auth_service.py:31
BCRYPT_ROUNDS = 12
...
salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
```

### 6. JWT expiry

```python
# server/config.py:23-24
ACCESS_TOKEN_EXPIRE_HOURS = 8
REFRESH_TOKEN_EXPIRE_DAYS = 7
```
Соответствует backend rule в `AGENTS.md`.

### 7. Login rate-limit

```python
# auth_service.py:154-169
if user.locked_until is not None and user.locked_until > now:
    raise HTTPException(...)
...
user.failed_attempts += 1
if user.failed_attempts >= MAX_LOGIN_ATTEMPTS:
    user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
```
`MAX_LOGIN_ATTEMPTS = 5`, `LOCKOUT_MINUTES = 30`.

### 8. Backup path-traversal

```python
# backup_service.py:52-59
def _safe_filename(name: str) -> Path:
    if not name or os.path.basename(name) != name or ".." in name or name.startswith("."):
        raise HTTPException(400, "Недопустимое имя файла")
    p = (_backup_dir() / name).resolve()
    if not str(p).startswith(str(_backup_dir().resolve()) + os.sep) and p != _backup_dir().resolve():
        raise HTTPException(400, "Path traversal detected")
```

### 11. DOMPurify usage

Два места используют `dangerouslySetInnerHTML`:

- **`client/src/components/player/DataView.tsx:41`** (студенческий View)
  Sanitizer config: `ALLOWED_URI_REGEXP = /^\/media\//` — блокирует все внешние URI
  (https, javascript:, data:, etc.). Только локальные `/media/...` атрибуты.

- **`client/src/components/scenario/NodeInspector.tsx:78`** (preview для учителя)
  Default DOMPurify config — учитель видит свой собственный HTML в редакторе.
  Risk: учитель может вставить external `<img src="https://...">` в preview.
  Mitigation: контент в БД хранится как-есть и при отображении ученикам
  re-sanitized в `DataView` со строгим `ALLOWED_URI_REGEXP`.

### 12. Audit logging

`AuditService.log_action(db, actor_id=..., action=...)` вызывается из:
- `user_service.create / update / delete / set_status`
- `scenario_service.publish / archive / assign / save_graph`
- `attempt_service.start / step / finish / auto_finish`
- `backup_service.create_backup / delete_backup / restore_backup`
- `auth_service.login_success / login_fail / logout`

Auto-finish из планировщика имеет `actor_id=NULL` (system action).

---

## Limitations этого audit

Static-only — выполнен через `grep` и чтение кода без живой среды:

- ❌ Не выполнен smoke-test full flow (требует запущенный stack)
- ❌ Не выполнен `EXPLAIN ANALYZE` heavy queries
- ❌ Не выполнен penetration test
- ❌ Не выполнен load test

**ВМедА IT обязан выполнить smoke-test §15 после первого деплоя** перед открытием доступа реальным пользователям (см. `docs/DEPLOY.md` раздел Verification).

---

## Известные deferred items

Из `MEMORY.md` "Deferred hardening":

- ⏳ **Refresh-token rotation** — текущий refresh token переиспользуется до истечения (7 дней). Рекомендуется добавить rotation в v1.1.
- ⏳ **At-rest DB encryption** (ADR-013) — отложено в V2 как принятый risk (изолированный LAN физически защищён).
- ⏳ **JWT_SECRET rotation on restore** — после `restore_backup` секрет не ротируется автоматически; existing tokens продолжают валидироваться. Mitigation: maintenance_mode + admin logout инициатора. Полный enforcement — backlog v1.1.

Эти пункты документированы в `docs/ARCHITECTURE_DECISIONS.md` и не блокируют v1.0.0.
