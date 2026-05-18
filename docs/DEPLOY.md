# EpiCase v1.0.0 — инструкция по развёртыванию (DEPLOY.md)

Аудитория: IT-отдел ВМедА. Целевая инфраструктура — изолированный LAN без выхода в интернет.
Способ доставки — USB-флешка с архивом `epicase-<version>.tar.gz`.

Источник: ADR-012, ADDENDUM §SCALE.4.

---

## 1. Pre-deployment checklist

### Требования к серверу ВМедА
- ОС: Ubuntu Server 22.04 LTS или RHEL 9 (x86_64).
- CPU: 4 ядра, RAM: 8 ГБ, диск: 100 ГБ SSD (минимум).
- Установленные пакеты: `docker` (>=24.0), `docker compose plugin` (>=2.20), `curl`, `tar`, `coreutils` (sha256sum), `cron`.
- Учётная запись с правами sudo для развёртывания.
- Подмонтированный том для бэкапов: `/var/lib/epicase/backups` (рекомендуется отдельный диск).

### Сетевые требования
- Открытые порты на сервере: **80/tcp** (Nginx), **8000/tcp** (FastAPI, можно закрыть для LAN), **5432/tcp** (PostgreSQL — закрыть наружу).
- Firewall (ufw / firewalld): разрешить 80/tcp с подсети студентов/преподавателей; запретить наружу всё, что не 80.
- DNS / hosts: единое имя `epicase.vmeda.local` → IP сервера.

### Что НЕ требуется
- Доступ в интернет (ни на dev-машине во время деплоя, ни на сервере).
- Сборка образов на сервере ВМедА (`docker compose build` запускается ТОЛЬКО на dev-машине).

---

## 2. На dev-машине: сборка и упаковка релиза

Dev-машина с интернетом, git, docker, тестовым прогоном.

```bash
# 1. Перед сборкой — полный прогон тестов
bash scripts/verify.sh

# 2. Собрать Docker-образы
bash scripts/build-images.sh

# 3. Упаковать релиз в tar.gz
bash scripts/package-release.sh
```

Результат: файл `dist/epicase-<version>.tar.gz` (~600–900 МБ).

Внутри архива:
```
epicase-<version>/
├── epicase-app.tar              # серверный + клиентский образы
├── postgres-16-alpine.tar       # образ БД
├── docker-compose.yml
├── .env.example
├── nginx/
├── deploy-on-server.sh
└── checksums.sha256
```

### Контрольная сумма архива

```bash
sha256sum dist/epicase-<version>.tar.gz
# скопировать вывод — потребуется на сервере
```

---

## 3. Перенос на сервер ВМедА

1. Скопировать `dist/epicase-<version>.tar.gz` на USB-флешку (FAT32 не подойдёт — нужен ext4/NTFS из-за размера).
2. Физически принести флешку в серверную ВМедА.
3. На сервере:
   ```bash
   sudo mkdir -p /opt/epicase/releases
   sudo cp /media/usb/epicase-<version>.tar.gz /opt/epicase/releases/
   sudo chown $USER:$USER /opt/epicase/releases/epicase-<version>.tar.gz
   ```
4. Сверить контрольную сумму с записанной с dev-машины:
   ```bash
   sha256sum /opt/epicase/releases/epicase-<version>.tar.gz
   ```
   При расхождении — отказаться от деплоя, повторить копирование.

---

## 4. На сервере ВМедА: распаковка → загрузка → запуск

```bash
cd /opt/epicase/releases
tar -xzf epicase-<version>.tar.gz
cd epicase-<version>/

# Запуск автоматического деплоя
./deploy-on-server.sh
```

Скрипт выполнит:
1. Проверку наличия `docker` и плагина `docker compose`.
2. Сверку `checksums.sha256` всех `*.tar` (FAIL → exit).
3. `docker load -i epicase-app.tar` и `docker load -i postgres-16-alpine.tar`.
4. Копирование `docker-compose.yml`, `nginx/` в `$INSTALL_DIR` (по умолчанию `/opt/epicase`).
5. При отсутствии `.env` — скопирует `.env.example` и попросит заполнить.

### Конфигурация `.env`

```bash
cd /opt/epicase
nano .env
```

Минимально обязательные ключи:
```env
POSTGRES_DB=epicase
POSTGRES_USER=epicase
POSTGRES_PASSWORD=<openssl rand -base64 24>
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGINS=http://epicase.vmeda.local
FIRST_ADMIN_PASSWORD=<временный_пароль_для_первого_admin>
```

Генерация секретов:
```bash
openssl rand -base64 24    # для POSTGRES_PASSWORD
openssl rand -hex 32       # для JWT_SECRET (минимум 32 символа)
```

После заполнения `.env` повторно запустить:
```bash
cd /opt/epicase
docker compose up -d
```

---

## 5. First-time setup

### Создание первого администратора (seed)

```bash
docker compose exec server python -m scripts.seed
# Создаёт пользователя admin с паролем из FIRST_ADMIN_PASSWORD
```

После первого входа администратор обязан сменить пароль через UI: профиль → «Сменить пароль».

### DNS / hosts entry

На LAN-DNS-сервере или в `hosts` на машинах студентов:
```
10.0.0.50    epicase.vmeda.local
```

### TLS (опционально)

Если IT отдел ВМедА выпускает внутренний CA — положить сертификат и ключ:
```bash
sudo cp epicase.vmeda.local.crt /opt/epicase/nginx/ssl/
sudo cp epicase.vmeda.local.key /opt/epicase/nginx/ssl/
```
Раскомментировать секцию `listen 443 ssl;` в `nginx/nginx.conf` и перезапустить:
```bash
docker compose restart client
```

---

## 6. Verification

```bash
# Ping API
curl -sf http://localhost/api/ping
# → {"status":"ok"}

# Полная проверка здоровья
curl -sf http://localhost/api/health | jq
# → {"status":"ok","checks":{"db":"ok","disk":"ok","backups":"ok"}}

# Состояние контейнеров
docker compose ps
# Все три (db, server, client) должны быть в state "running (healthy)".
```

Smoke-test первого admin-логина:
```bash
curl -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<FIRST_ADMIN_PASSWORD>"}'
# Ожидаем 200 OK + access_token.
```

Открыть в браузере: `http://epicase.vmeda.local/` → логин `admin` → сменить пароль.

---

## 7. Routine operations

### Бэкапы — расписание

Cron-задача автоматического бэкапа БД запускается **внутри контейнера server** ежедневно в **02:00 UTC** (06:00 МСК).
Retention настраивается в Admin → Настройки (`backup_retention_days`, по умолчанию 90 дней).

Файлы бэкапов хранятся в volume `server_backups` (`/var/lib/docker/volumes/epicase_server_backups/_data`).

Рекомендуется настроить внешнее зеркалирование на NAS:
```bash
# /etc/cron.d/epicase-backup-mirror
30 2 * * * root rsync -a /var/lib/docker/volumes/epicase_server_backups/_data/ /mnt/nas/epicase-backups/
```

### Log rotation

FastAPI и Nginx пишут логи в stdout → Docker. Настроить `daemon.json`:
```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
```
Перезапустить: `sudo systemctl restart docker && docker compose up -d`.

Логи приложения (system_logs) хранятся в БД, доступ через Admin → Система → Логи (фильтр уровня + CSV export).

---

## 8. Upgrades (новая версия)

```bash
# 1. На dev-машине пересобрать релиз
bash scripts/verify.sh && bash scripts/build-images.sh && bash scripts/package-release.sh

# 2. На сервере: остановить compose, не удаляя volumes
cd /opt/epicase
docker compose down            # ВАЖНО: НЕ использовать -v, иначе потеряется БД и бэкапы

# 3. Создать защитный бэкап перед апгрейдом
# (через UI: Admin → Система → «Создать бэкап»)

# 4. Распаковать новый релиз и загрузить образы
cd /opt/epicase/releases
tar -xzf epicase-<new-version>.tar.gz
cd epicase-<new-version>/
sha256sum -c checksums.sha256
docker load -i epicase-app.tar
docker load -i postgres-16-alpine.tar
sudo cp docker-compose.yml /opt/epicase/

# 5. Запустить, миграции применятся автоматически (Alembic on startup)
cd /opt/epicase
docker compose up -d

# 6. Проверка
curl -sf http://localhost/api/health
docker compose logs server --tail=50 | grep -i "alembic\|error"
```

---

## 9. Rollback

Если новая версия неработоспособна:

```bash
cd /opt/epicase
docker compose down

# 1. Откатить образы (старые .tar остались в releases/)
docker load -i /opt/epicase/releases/epicase-<previous-version>/epicase-app.tar

# 2. Откатить docker-compose.yml
sudo cp /opt/epicase/releases/epicase-<previous-version>/docker-compose.yml /opt/epicase/

# 3. Восстановить БД из бэкапа, созданного перед апгрейдом
#    Способ A — через UI: войти как admin → Система → Бэкапы → Восстановить (triple-confirm).
#    Способ B — вручную:
docker compose up -d db
docker compose exec -T db psql -U epicase -d epicase < /var/lib/docker/volumes/epicase_server_backups/_data/<backup>.sql

# 4. Запустить старую версию
docker compose up -d
curl -sf http://localhost/api/health
```

Откатить миграции БД руками НЕ нужно — restore из дампа возвращает схему целиком.

---

## 10. Troubleshooting

### Port conflict (80/8000/5432 занят)
```bash
sudo ss -tlnp | grep -E ':80|:8000|:5432'
```
Остановить конфликтующий сервис (apache2, postgres-host и т.п.) или поменять mapping портов в `docker-compose.yml` (например, `"8080:80"`).

### `pg_isready` healthcheck не проходит
```bash
docker compose logs db --tail=100
```
Частая причина — несовпадение `POSTGRES_PASSWORD` со старым volume. Решение: либо подставить старый пароль в `.env`, либо очистить volume (ВНИМАНИЕ — удалит данные):
```bash
docker compose down
docker volume rm epicase_pgdata
docker compose up -d
```

### `JWT_SECRET missing` / `min 32 chars`
Сервер падает на старте, в логах: `JWT_SECRET must be at least 32 characters`.
Решение:
```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" >> /opt/epicase/.env
docker compose up -d server
```

### CORS-ошибки в браузере
Не совпадает `CORS_ORIGINS` с реальным URL клиента. Проверить:
```bash
grep CORS_ORIGINS /opt/epicase/.env
# должно равняться тому, что в адресной строке браузера (схема + хост + порт).
```

### `/api/health` отвечает `warning` или `error`
```bash
curl -s http://localhost/api/health | jq
```
- `db: error` → проблема с PostgreSQL, смотреть `docker compose logs db`.
- `disk: warning` → свободного места <10%, очистить старые бэкапы.
- `backups: warning` → последний автобэкап старше 48 ч; проверить cron внутри контейнера server.

### Контейнер `server` рестартует в цикле
```bash
docker compose logs server --tail=200
```
Часто: Alembic не смог применить миграцию (несовместимая БД от старой версии). Решение — восстановить из бэкапа (см. §9 Rollback).

---

## Контакты

- Технический владелец: команда EpiCase (`docs/AGENT_ROSTER.md`).
- Эскалация инцидентов: создать issue с тегом `[VMedA-incident]` (на dev-стороне).
