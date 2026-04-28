"""Stage 4 — system tables (``system_settings``, ``system_logs``).

Schema follows PROJECT_DESIGN §8.1 + ADDENDUM §MIG (004) + §T.4 (logging
policy with retention) + §T.5 (``maintenance_mode`` setting consumed by
restore orchestration).

Indexes:
* ``idx_logs_level`` — list-by-level admin queries
* ``idx_logs_date`` — recent-logs admin queries (descending)
* ``idx_logs_errors`` — partial index for the health-check endpoint
  (only ``WARNING`` / ``ERROR`` / ``CRITICAL`` rows ordered by ``created_at``)

Revision ID: 004
Revises: 003
Create Date: 2026-04-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_by",
            sa.Integer(),
            sa.ForeignKey(
                "users.id",
                ondelete="SET NULL",
                name="fk_system_settings_updated_by",
            ),
            nullable=True,
        ),
    )

    op.create_table(
        "system_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("logger", sa.String(length=128), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_system_logs_user_id"),
            nullable=True,
        ),
        sa.Column(
            "meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "level IN ('DEBUG','INFO','WARNING','ERROR','CRITICAL')",
            name="ck_system_logs_level",
        ),
    )
    op.create_index("idx_logs_level", "system_logs", ["level"])
    op.create_index(
        "idx_logs_date", "system_logs", [sa.text("created_at DESC")]
    )
    op.create_index(
        "idx_logs_errors",
        "system_logs",
        [sa.text("created_at DESC")],
        postgresql_where=sa.text("level IN ('WARNING','ERROR','CRITICAL')"),
    )


def downgrade() -> None:
    op.drop_index("idx_logs_errors", table_name="system_logs")
    op.drop_index("idx_logs_date", table_name="system_logs")
    op.drop_index("idx_logs_level", table_name="system_logs")
    op.drop_table("system_logs")
    op.drop_table("system_settings")
