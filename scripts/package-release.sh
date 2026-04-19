#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# EpiCase — package-release.sh (ADR-012)
# Упаковывает Docker-образы + конфиги в tar.gz для переноса
# на изолированный сервер ВМедА через флешку.
# ══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
RELEASE_DIR="dist/epicase-$VERSION"

echo -e "${BLUE}▸ Packaging release: $VERSION${NC}"
mkdir -p "$RELEASE_DIR"

echo -e "${BLUE}▸ [1/4] Saving Docker images${NC}"
docker save $(docker compose config --images | grep -v postgres) \
    -o "$RELEASE_DIR/epicase-app.tar"

# Postgres тянем отдельно (не из compose, чтобы получить версию по имени)
docker pull postgres:16-alpine
docker save postgres:16-alpine -o "$RELEASE_DIR/postgres-16-alpine.tar"

echo -e "${BLUE}▸ [2/4] Copying config files${NC}"
cp docker-compose.yml "$RELEASE_DIR/"
cp .env.example      "$RELEASE_DIR/"
cp -r nginx/         "$RELEASE_DIR/"
cp scripts/deploy-on-server.sh "$RELEASE_DIR/"
chmod +x "$RELEASE_DIR/deploy-on-server.sh"

echo -e "${BLUE}▸ [3/4] Computing checksums${NC}"
cd "$RELEASE_DIR"
sha256sum *.tar > checksums.sha256
cd - > /dev/null

echo -e "${BLUE}▸ [4/4] Creating tarball${NC}"
cd dist/
tar -czf "epicase-$VERSION.tar.gz" "epicase-$VERSION/"
SIZE=$(du -h "epicase-$VERSION.tar.gz" | cut -f1)
cd - > /dev/null

echo ""
echo -e "${GREEN}✓ Release packaged${NC}"
echo -e "  File:   ${BLUE}dist/epicase-$VERSION.tar.gz${NC}"
echo -e "  Size:   ${BLUE}$SIZE${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Copy ${BLUE}dist/epicase-$VERSION.tar.gz${NC} to a USB drive"
echo -e "  2. Transfer to VMedA server"
echo -e "  3. On server: ${BLUE}tar -xzf epicase-$VERSION.tar.gz && cd epicase-$VERSION/ && ./deploy-on-server.sh${NC}"
