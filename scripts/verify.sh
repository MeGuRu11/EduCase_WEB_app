#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# EpiCase — verify.sh (ADR-012, ADR-Ruff+Pytest+Vitest+TSC)
# Запускается перед любым commit или push.
# Ничего не меняет, только проверяет. Exit 0 = can commit.
# ══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
pass() { echo -e "${GREEN}✓ $1${NC}"; }
step() { echo -e "${BLUE}▸ $1${NC}"; }

step "[1/5] Python lint: ruff check server/"
ruff check server/ || fail "ruff found issues"
pass "ruff clean"

step "[2/5] Python tests: pytest server/tests/"
cd server && pytest tests/ -v --tb=short || fail "pytest failures"
cd ..
pass "all pytest green"

step "[3/5] TypeScript check: cd client && npx tsc --noEmit"
cd client && npx tsc --noEmit || fail "tsc errors"
pass "tsc clean"

step "[4/5] Frontend tests: npx vitest run"
npx vitest run || fail "vitest failures"
cd ..
pass "all vitest green"

step "[5/5] No hardcoded colors in client (DESIGN_SYSTEM §12)"
# Грепаем hex-цвета в tsx/ts файлах, исключая tokens.css
if grep -rnE '#[0-9A-Fa-f]{6}' client/src --include='*.tsx' --include='*.ts' \
    --exclude-dir=node_modules 2>/dev/null | grep -v '// allow-hex'; then
    fail "hardcoded hex colors found — use tokens from styles/tokens.css"
fi
pass "no hardcoded colors"

step "[EXTRA] No correct_value leak in client (ADDENDUM §T.3)"
if grep -rnE '(correct_value|correct_values|is_correct|grade_answer|check_answer)' \
    client/src --include='*.ts' --include='*.tsx' --exclude-dir=node_modules 2>/dev/null; then
    fail "SECURITY: correct_value / is_correct leaked into client code"
fi
pass "no answer leaks"

step "[EXTRA] No SQL injection via f-strings in text() (BEST_PRACTICES §B.2.2 E-20)"
if grep -rnE 'text\(f["'"'"']' server/ --include='*.py' 2>/dev/null; then
    fail "SECURITY: f-string inside text() — use parameterized queries"
fi
pass "no SQL injection risks"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ALL CHECKS PASSED — commit allowed${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
