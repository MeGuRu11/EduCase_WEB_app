---
description: Review latest changes for bugs and security
allowed-tools: Read, Grep, Glob, Bash
---
Review latest changes:
1. `git diff HEAD~1` — see all changes
2. Security: hardcoded secrets, SQL injection, XSS, missing role checks
3. Performance: N+1 queries, re-renders
4. Quality: no `any`, functions < 50 lines, DRY
5. Output: | File | Line | Severity | Issue | Fix |
