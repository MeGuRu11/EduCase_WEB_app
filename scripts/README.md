# EpiCase — Scripts

> Формализованный dev → prod workflow для проекта без облачного CI/CD (ADR-012).

## Обзор

4 bash-скрипта закрывают весь путь от локального commit до деплоя на изолированный сервер ВМедА:

```
   [dev machine, internet]                    [VMedA server, no internet]
   ─────────────────────────                  ────────────────────────────

   verify.sh  ──▶  build-images.sh  ──▶  package-release.sh
                                              │
                                              ▼
                                       epicase-vN.tar.gz
                                              │
                                          [USB drive]
                                              │
                                              ▼
                                       deploy-on-server.sh
```

## Скрипты

### `verify.sh` — локальная проверка перед commit

Запускает весь набор проверок:
1. `ruff check server/` — Python lint
2. `pytest server/tests/` — все backend-тесты
3. `npx tsc --noEmit` — TypeScript type check
4. `npx vitest run` — все frontend-тесты
5. Grep на hardcoded hex цвета (DESIGN_SYSTEM §12)
6. Grep на утечки `correct_value` в client-код (ADDENDUM §T.3)

Exit 0 → можно коммитить. Exit 1 → смотрите что не прошло.

**Когда запускать:** перед каждым commit. Можно подключить как git pre-commit hook.

### `build-images.sh` — сборка Docker-образов

Собирает `epicase-server` и `epicase-client` через `docker compose build`. Требует интернет (скачивание базовых образов и npm/pip пакетов).

**Когда запускать:** после `verify.sh`, перед созданием релиза.

### `package-release.sh` — упаковка релиза

Сохраняет все образы в tar-архивы, добавляет конфиги (`docker-compose.yml`, `.env.example`, `nginx/`), вычисляет checksums, создаёт итоговый `dist/epicase-vN.tar.gz`.

**Когда запускать:** после `build-images.sh`, когда готов релизить на сервер.

### `deploy-on-server.sh` — развёртывание на ВМедА

Запускается **на сервере** в папке с распакованным релизом.
- Проверяет checksums
- `docker load` образов
- Устанавливает конфиги в `/opt/epicase/` (или `$INSTALL_DIR`)
- Если `.env` отсутствует — создаёт из примера и даёт инструкции
- `docker compose up -d`
- Ждёт 60 секунд и проверяет `GET /api/ping`

**Требует:** sudo (для `/opt/epicase/`), Docker + Docker Compose plugin.

## Полный цикл

```bash
# ═══ На dev-машине ═══

# 1. Делаем изменения, коммитим
git add -A && git commit -m "feat: ..."

# 2. Проверяем
./scripts/verify.sh

# 3. Собираем
./scripts/build-images.sh

# 4. Упаковываем
./scripts/package-release.sh
# → dist/epicase-v1.0.0.tar.gz

# 5. Записываем на флешку, переносим на сервер


# ═══ На сервере ВМедА ═══

# 6. Распаковываем
tar -xzf epicase-v1.0.0.tar.gz
cd epicase-v1.0.0/

# 7. Первый раз — будет запрошен .env
./deploy-on-server.sh
# → редактируем /opt/epicase/.env
# → cd /opt/epicase && docker compose up -d

# 8. Последующие обновления — работает автоматически
./deploy-on-server.sh
```

## Права

После распаковки стартера:

```bash
chmod +x scripts/*.sh
```

## Подключение как git hook (опционально)

```bash
ln -sf ../../scripts/verify.sh .git/hooks/pre-commit
```

Теперь `verify.sh` запускается автоматически перед каждым `git commit`.
