"""Alembic env.py — uses plain imports per ADR-015."""

from __future__ import annotations

from alembic import context
from sqlalchemy import engine_from_config, pool

from database import Base
from models import *  # noqa: F403 — ensure all models are registered on Base.metadata

target_metadata = Base.metadata


def run_migrations_online() -> None:
    config = context.config
    connectable = engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
