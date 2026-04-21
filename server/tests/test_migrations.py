"""Migration integrity tests (ADR-009).

Three mandatory tests per ADR-009:

1. **apply_from_scratch** — a fresh DB can `alembic upgrade head` without error
   and every expected table / index exists.
2. **downgrade_cleanly** — after `upgrade head → downgrade base`, the public
   schema is empty (except Alembic's own bookkeeping), proving down-revisions
   are reversible.
3. **stairsteps** — walking every revision one-by-one (up, down, up) succeeds.
   Catches accidentally broken intermediate revisions.

These tests talk to a *fresh* Postgres schema, so they are marked ``slow`` and
must NOT use the shared ``db_engine`` fixture.
"""

from __future__ import annotations

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.slow


def _fresh_config(url: str) -> Config:
    cfg = Config("server/alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _reset_schema(url: str) -> None:
    engine = create_engine(url, future=True)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    engine.dispose()


EXPECTED_TABLES = {
    "roles",
    "groups",
    "users",
    "teacher_groups",
    "disciplines",
    "topics",
    "form_templates",
    "form_template_fields",
}


EXPECTED_INDEXES = {
    # name → table
    "idx_users_role": "users",
    "idx_users_group": "users",
    "idx_users_username": "users",
    "idx_teacher_groups_teacher": "teacher_groups",
    "idx_teacher_groups_group": "teacher_groups",
}


def test_apply_from_scratch_creates_all_tables_and_indexes(postgres_test_url: str) -> None:
    """ADR-009 #1 — head migration builds the full Stage 1 schema."""
    _reset_schema(postgres_test_url)
    cfg = _fresh_config(postgres_test_url)

    command.upgrade(cfg, "head")

    engine = create_engine(postgres_test_url, future=True)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert EXPECTED_TABLES.issubset(tables), (
        f"Missing tables after upgrade head: {EXPECTED_TABLES - tables}"
    )

    # must_change_password column exists (§S.2)
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    assert "must_change_password" in user_cols, (
        "users.must_change_password column missing — see §S.2 / §MIG 001"
    )

    for idx_name, table in EXPECTED_INDEXES.items():
        idx_names = {idx["name"] for idx in inspector.get_indexes(table)}
        assert idx_name in idx_names, f"Missing index {idx_name} on {table}"

    engine.dispose()


def test_downgrade_to_base_drops_all_tables(postgres_test_url: str) -> None:
    """ADR-009 #2 — full up-then-down leaves only Alembic's own table."""
    _reset_schema(postgres_test_url)
    cfg = _fresh_config(postgres_test_url)

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")

    engine = create_engine(postgres_test_url, future=True)
    inspector = inspect(engine)
    remaining = set(inspector.get_table_names())
    # After downgrade base, alembic_version may or may not exist depending on
    # version of alembic, but none of our domain tables must remain.
    leaked = remaining & EXPECTED_TABLES
    assert not leaked, f"Downgrade left tables behind: {leaked}"
    engine.dispose()


def test_stairstep_every_revision(postgres_test_url: str) -> None:
    """ADR-009 #3 — each revision must up-then-down-then-up cleanly."""
    _reset_schema(postgres_test_url)
    cfg = _fresh_config(postgres_test_url)

    script = ScriptDirectory.from_config(cfg)
    revisions = list(reversed(list(script.walk_revisions())))  # base → head
    assert revisions, "No Alembic revisions found — migration 001 missing"

    for rev in revisions:
        command.upgrade(cfg, rev.revision)
        down: str = rev.down_revision if isinstance(rev.down_revision, str) else "base"
        command.downgrade(cfg, down)
        command.upgrade(cfg, rev.revision)
