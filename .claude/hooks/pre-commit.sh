#!/bin/bash
# ═══════════════════════════════════════════
# EpiCase pre-commit hook
# BLOCKS commit unless ALL checks pass
# ═══════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Pre-commit: checking everything ==="

# 1. Python type check
echo "  [1/5] mypy..."
cd server && python -m mypy . --ignore-missing-imports --no-error-summary 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}  BLOCKED: mypy errors${NC}"
    exit 2
fi
cd ..

# 2. Python lint
echo "  [2/5] ruff..."
ruff check server/ --quiet
if [ $? -ne 0 ]; then
    echo -e "${RED}  BLOCKED: ruff errors${NC}"
    exit 2
fi

# 3. TypeScript check
echo "  [3/5] tsc..."
cd client && npx tsc --noEmit 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}  BLOCKED: TypeScript errors${NC}"
    exit 2
fi
cd ..

# 4. Backend tests
echo "  [4/5] pytest..."
cd server && pytest tests/ --quiet 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}  BLOCKED: pytest failures${NC}"
    exit 2
fi
cd ..

# 5. Frontend tests
echo "  [5/5] vitest..."
cd client && npx vitest run --silent 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}  BLOCKED: vitest failures${NC}"
    exit 2
fi
cd ..

echo -e "${GREEN}  ALL CHECKS PASSED — commit allowed${NC}"
exit 0
