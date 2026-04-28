"""Pre-Stage-4 hardening — ``audit_logs`` table.

Why now: Stage 4 analytics joins on ``actor_id`` for "who published / who
blocked / who assigned". Without a dedicated audit table it cannot answer
those questions. See ``docs/RETRO_AUDIT_STAGE0-3.md`` priority 1.

Revision 005 chains directly off 004 (system tables).

Revision ID: 005
Revises: 004
Create Date: 2026-04-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "actor_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_audit_logs_actor_id"),
            nullable=True,
        ),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column(
            "meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_audit_logs_actor_created",
        "audit_logs",
        ["actor_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_audit_logs_entity",
        "audit_logs",
        ["entity_type", "entity_id"],
    )
    op.create_index(
        "idx_audit_logs_action_created",
        "audit_logs",
        ["action", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_audit_logs_action_created", table_name="audit_logs")
    op.drop_index("idx_audit_logs_entity", table_name="audit_logs")
    op.drop_index("idx_audit_logs_actor_created", table_name="audit_logs")
    op.drop_table("audit_logs")
