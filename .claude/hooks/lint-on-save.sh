#!/bin/bash
FILE="$1"
if echo "$FILE" | grep -q '\.py$'; then
    ruff format "$FILE" --quiet 2>/dev/null
elif echo "$FILE" | grep -qE '\.(ts|tsx)$'; then
    npx prettier --write "$FILE" 2>/dev/null
fi
