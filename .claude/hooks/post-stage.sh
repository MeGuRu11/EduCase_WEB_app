#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# EpiCase — post-stage hook (inspired by Ruflo hooks system)
#
# Запускается ПОСЛЕ успешного `git commit` на границе Stage.
# Автоматически:
# 1. Отмечает завершённый Stage в MEMORY.md (меняет [ ] на [x])
# 2. Обновляет "Last Updated" и счётчики тестов
# 3. Напоминает о необходимости обновить Next Action
#
# Вызов: передать номер только что завершённого stage:
#   bash .claude/hooks/post-stage.sh 1
# Или auto-detect из последнего git commit message:
#   bash .claude/hooks/post-stage.sh
# ══════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MEMORY="$ROOT/MEMORY.md"

if [[ ! -f "$MEMORY" ]]; then
    echo "✗ MEMORY.md not found at $MEMORY"
    exit 1
fi

# ── 1. Определить номер завершённого stage ────────────────────
STAGE="${1:-}"
if [[ -z "$STAGE" ]]; then
    # Auto-detect из последнего commit message: "feat: Stage N — ..."
    LAST_MSG=$(git -C "$ROOT" log -1 --pretty=%s 2>/dev/null || echo "")
    STAGE=$(echo "$LAST_MSG" | grep -oE 'Stage [0-9]+' | grep -oE '[0-9]+' | head -1 || echo "")
fi

if [[ -z "$STAGE" ]]; then
    echo "✗ Cannot determine stage number. Usage: $0 <N>"
    echo "  Or make sure last commit starts with 'feat: Stage N —'"
    exit 1
fi

echo "▸ Post-stage hook for Stage $STAGE"

# ── 2. Обновить MEMORY.md: [ ] → [x] ──────────────────────────
# Паттерн: `- [ ] STAGE {N} — ...`
if grep -qE "^- \[ \] STAGE $STAGE " "$MEMORY"; then
    # GNU sed (Linux) — на macOS sed -i требует backup suffix
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' -E "s/^- \[ \] (STAGE $STAGE .*)$/- [x] \1/" "$MEMORY"
    else
        sed -i -E "s/^- \[ \] (STAGE $STAGE .*)$/- [x] \1/" "$MEMORY"
    fi
    echo "  ✓ Marked Stage $STAGE as [x] completed"
else
    echo "  ⚠ Stage $STAGE already marked or not found in MEMORY.md"
fi

# ── 3. Обновить Last Updated дату ─────────────────────────────
TODAY=$(date +%Y-%m-%d)
if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' -E "s/^- Date: [0-9]{4}-[0-9]{2}-[0-9]{2}/- Date: $TODAY/" "$MEMORY"
else
    sed -i -E "s/^- Date: [0-9]{4}-[0-9]{2}-[0-9]{2}/- Date: $TODAY/" "$MEMORY"
fi
echo "  ✓ Updated 'Last Updated' to $TODAY"

# ── 4. Пересчитать тесты ──────────────────────────────────────
BACKEND_TESTS=0
FRONTEND_TESTS=0
[[ -d "$ROOT/server/tests" ]] && BACKEND_TESTS=$(grep -rhE '^def test_' "$ROOT/server/tests" 2>/dev/null | wc -l | tr -d ' ')
[[ -d "$ROOT/client/src" ]]   && FRONTEND_TESTS=$(grep -rhE '^\s*(it|test)\(' "$ROOT/client/src" 2>/dev/null | wc -l | tr -d ' ')

echo "  ✓ Counted tests: backend=$BACKEND_TESTS, frontend=$FRONTEND_TESTS"

# ── 5. Напомнить о Next Action ────────────────────────────────
echo ""
echo "  ⚠ ACTION REQUIRED: обновите секцию 'Next Action' в MEMORY.md"
echo "  ⚠ Текущая следующая цель:"
grep -A 3 "^## Next Action" "$MEMORY" | tail -n +2 | head -5 | sed 's/^/    /'

echo ""
echo "▸ Post-stage hook completed."
echo "  Commit MEMORY.md update:"
echo "    git add MEMORY.md && git commit --amend --no-edit"
