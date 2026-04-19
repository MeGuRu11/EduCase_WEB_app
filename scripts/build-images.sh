#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# EpiCase — build-images.sh (ADR-012)
# Собирает Docker-образы на dev-машине (с интернетом).
# Запускается ПОСЛЕ scripts/verify.sh.
# ══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
echo -e "${BLUE}▸ Building EpiCase images, version: $VERSION${NC}"

mkdir -p dist/

echo -e "${BLUE}▸ [1/2] Building server image${NC}"
docker compose build server

echo -e "${BLUE}▸ [2/2] Building client image${NC}"
docker compose build client

echo ""
echo -e "${GREEN}✓ Images built${NC}"
docker images | grep -E "(epicase|REPOSITORY)"
echo ""
echo -e "Next: run ${BLUE}scripts/package-release.sh${NC} to create tar archives for VMedA."
