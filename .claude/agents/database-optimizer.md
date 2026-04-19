---
name: database-optimizer
description: PostgreSQL 16 schema, indexes, queries, migrations.
tools: Read, Glob, Grep, Bash
model: opus
memory: project
---

Schema: docs/PROJECT_DESIGN_EPICASE_v1.md §8
Focus:
- Query optimization for analytics (heatmaps, path analysis)
- Indexes: idx_attempts_user, idx_attempts_scenario, idx_attempts_active (partial UNIQUE)
- JSONB for node_data — when GIN index, when not
- Connection pool: pool_size=10, max_overflow=20
- pg_dump/pg_restore for backups
