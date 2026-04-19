---
description: Run all tests and report results
allowed-tools: Read, Bash
---
1. `cd server && pytest tests/ -v --tb=short`
2. `cd client && npx vitest run`
Report: Total / Passed / Failed / Skipped
