#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# EpiCase — Claude Code statusline (inspired by Ruflo)
#
# Показывает в статусбаре Claude Code:
# - Текущая модель
# - Текущий Stage (из MEMORY.md)
# - Git branch
# - Использование context (если доступно из stdin)
# - Тесты: backend / frontend
#
# Claude Code пайпит JSON session-data через stdin после каждого
# assistant message. Этот скрипт читает его и комбинирует с
# локальными метриками проекта.
# ══════════════════════════════════════════════════════════════

# Корень проекта (рядом с .claude/)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── 1. Current Stage из MEMORY.md ─────────────────────────────
STAGE="?"
if [[ -f "$ROOT/MEMORY.md" ]]; then
    # Ищем последнюю незавершённую [ ] STAGE
    STAGE=$(grep -E '^\- \[ \] STAGE' "$ROOT/MEMORY.md" | head -1 \
            | sed -E 's/.*STAGE ([0-9]+).*/S\1/' || echo "?")
    # Если все выполнены — показываем завершённый последний
    if [[ "$STAGE" == "?" ]]; then
        STAGE=$(grep -E '^\- \[x\] STAGE' "$ROOT/MEMORY.md" | tail -1 \
                | sed -E 's/.*STAGE ([0-9]+).*/S\1✓/' || echo "?")
    fi
fi

# ── 2. Git branch ─────────────────────────────────────────────
BRANCH="-"
if [[ -d "$ROOT/.git" ]]; then
    BRANCH=$(git -C "$ROOT" symbolic-ref --short HEAD 2>/dev/null || echo "detached")
fi

# ── 3. Test counts (backend) ──────────────────────────────────
BACKEND_TESTS=0
if command -v find >/dev/null 2>&1 && [[ -d "$ROOT/server/tests" ]]; then
    BACKEND_TESTS=$(grep -rhE '^def test_' "$ROOT/server/tests" 2>/dev/null | wc -l | tr -d ' ')
fi

# ── 4. Test counts (frontend) ─────────────────────────────────
FRONTEND_TESTS=0
if [[ -d "$ROOT/client/src" ]]; then
    FRONTEND_TESTS=$(grep -rhE '^\s*(it|test)\(' "$ROOT/client/src" 2>/dev/null | wc -l | tr -d ' ')
fi

# ── 5. Session data из stdin (опционально) ────────────────────
# Claude Code может пайпить JSON. Читаем non-blocking.
MODEL="opus-4-7"
CTX="?"
if [[ ! -t 0 ]]; then
    # stdin не tty → возможно есть данные
    SESSION=$(timeout 0.2 cat 2>/dev/null || echo "{}")
    if command -v jq >/dev/null 2>&1 && [[ -n "$SESSION" ]] && [[ "$SESSION" != "{}" ]]; then
        MODEL=$(echo "$SESSION" | jq -r '.model // "opus-4-7"' 2>/dev/null | sed 's/claude-//;s/-20.*//')
        CTX_RAW=$(echo "$SESSION" | jq -r '.context_usage_pct // empty' 2>/dev/null)
        [[ -n "$CTX_RAW" ]] && CTX="${CTX_RAW}%"
    fi
fi

# ── 6. Output ──────────────────────────────────────────────────
# Формат (inspired by Ruflo): одна строка, без переносов
# Пример: ▊ EpiCase ● main │ opus-4-7 │ ctx:42% │ S1 │ 🧪 0/0 (→30/26)

printf "▊ EpiCase ● %s │ %s │ ctx:%s │ %s │ 🧪 %d/%d" \
    "$BRANCH" "$MODEL" "$CTX" "$STAGE" "$BACKEND_TESTS" "$FRONTEND_TESTS"
