#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# EpiCase — deploy-on-server.sh (ADR-012)
# Запускается на изолированном сервере ВМедА (без интернета).
# Предполагает, что текущая директория содержит распакованный
# релиз (epicase-app.tar, postgres-16-alpine.tar, и пр.)
# ══════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="${INSTALL_DIR:-/opt/epicase}"

echo -e "${BLUE}══ EpiCase deploy → $INSTALL_DIR ══${NC}"

# 1. Проверка утилит
command -v docker >/dev/null 2>&1 || { echo -e "${RED}✗ docker not installed${NC}"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo -e "${RED}✗ docker compose plugin missing${NC}"; exit 1; }

# 2. Проверка checksums
echo -e "${BLUE}▸ [1/5] Verifying checksums${NC}"
sha256sum -c checksums.sha256 || { echo -e "${RED}✗ Checksum verification FAILED${NC}"; exit 1; }
echo -e "${GREEN}  ✓ checksums ok${NC}"

# 3. Загрузка образов
echo -e "${BLUE}▸ [2/5] Loading Docker images${NC}"
docker load -i epicase-app.tar
docker load -i postgres-16-alpine.tar
echo -e "${GREEN}  ✓ images loaded${NC}"

# 4. Установка конфигов
echo -e "${BLUE}▸ [3/5] Installing configs to $INSTALL_DIR${NC}"
sudo mkdir -p "$INSTALL_DIR"
sudo cp docker-compose.yml "$INSTALL_DIR/"
sudo cp -rn nginx "$INSTALL_DIR/"   # -n: не перезаписывать локальные кастомизации
sudo chown -R "$USER:$USER" "$INSTALL_DIR"

# 5. Проверка .env
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    cp .env.example "$INSTALL_DIR/.env"
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ACTION REQUIRED:${NC}"
    echo -e "${YELLOW}  Edit ${INSTALL_DIR}/.env and set:${NC}"
    echo -e "${YELLOW}    POSTGRES_PASSWORD=<strong password>${NC}"
    echo -e "${YELLOW}    JWT_SECRET=<openssl rand -hex 32>${NC}"
    echo -e "${YELLOW}    CORS_ORIGINS=http://<server-ip-or-hostname>${NC}"
    echo -e "${YELLOW}${NC}"
    echo -e "${YELLOW}  Then re-run: cd $INSTALL_DIR && docker compose up -d${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════════════${NC}"
    exit 0
fi

cd "$INSTALL_DIR"

echo -e "${BLUE}▸ [4/5] Starting services${NC}"
docker compose up -d

echo -e "${BLUE}▸ [5/5] Waiting for /api/ping${NC}"
for i in 1 2 3 4 5 6; do
    sleep 10
    if curl -sf http://localhost/api/ping > /dev/null; then
        echo ""
        echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ Deployment successful${NC}"
        echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
        docker compose ps
        echo ""
        echo -e "Access: ${BLUE}http://$(hostname -I | awk '{print $1}')${NC}"
        exit 0
    fi
    echo -e "  attempt $i/6 failed, retrying in 10s..."
done

echo ""
echo -e "${RED}══════════════════════════════════════════════════${NC}"
echo -e "${RED}  ✗ Deployment verification FAILED${NC}"
echo -e "${RED}══════════════════════════════════════════════════${NC}"
echo -e "Troubleshoot: ${BLUE}cd $INSTALL_DIR && docker compose logs --tail=50${NC}"
exit 1
