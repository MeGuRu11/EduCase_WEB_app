"""Stage 3 — attempt schema (attempts, attempt_steps) per PROJECT_DESIGN §8.1
+ ADDENDUM §MIG (003) + §U.3 (server-authoritative timer: ``expires_at``).

Indexes (§MIG): idx_attempts_user, idx_attempts_scenario, idx_attempts_status,
partial UNIQUE ``idx_attempts_active`` (one in_progress per user/scenario —
§B.3.4 concurrency guard), composite ``idx_attempts_completed`` for analytics
queries, ``idx_steps_attempt``, ``idx_steps_attempt_node``.

Revision ID: 003
Revises: 002
Create Date: 2026-04-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── extend scenario_edges with option_id (§B.3 — required by grader) ──
    op.add_column(
        "scenario_edges",
        sa.Column("option_id", sa.String(length=50), nullable=True),
    )

    op.create_table(
        "attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_attempts_user_id"),
            nullable=False,
        ),
        sa.Column(
            "scenario_id",
            sa.Integer(),
            sa.ForeignKey(
                "scenarios.id",
                ondelete="CASCADE",
                name="fk_attempts_scenario_id",
            ),
            nullable=False,
        ),
        sa.Column(
            "attempt_num",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'in_progress'"),
        ),
        sa.Column(
            "total_score",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "max_score",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("current_node_id", sa.String(length=50), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=True),
        # §U.3 — server-authoritative timer; nullable when scenario has no time_limit_min.
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="§U.3 — server-authoritative deadline; NULL if scenario has no time_limit_min.",
        ),
        sa.CheckConstraint(
            "status IN ('in_progress', 'completed', 'abandoned')",
            name="ck_attempts_status",
        ),
    )
    op.create_index("idx_attempts_user", "attempts", ["user_id"])
    op.create_index("idx_attempts_scenario", "attempts", ["scenario_id"])
    op.create_index("idx_attempts_status", "attempts", ["status"])
    op.create_index(
        "idx_attempts_active",
        "attempts",
        ["user_id", "scenario_id"],
        unique=True,
        postgresql_where=sa.text("status = 'in_progress'"),
    )
    op.create_index(
        "idx_attempts_completed",
        "attempts",
        ["scenario_id", "finished_at"],
        postgresql_where=sa.text("status = 'completed'"),
    )

    op.create_table(
        "attempt_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.Integer(),
            sa.ForeignKey(
                "attempts.id",
                ondelete="CASCADE",
                name="fk_attempt_steps_attempt_id",
            ),
            nullable=False,
        ),
        sa.Column("node_id", sa.String(length=50), nullable=False),
        sa.Column("edge_id", sa.String(length=50), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column(
            "answer_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "score_received",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "max_score",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("time_spent_sec", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_steps_attempt", "attempt_steps", ["attempt_id"])
    op.create_index(
        "idx_steps_attempt_node", "attempt_steps", ["attempt_id", "node_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_steps_attempt_node", table_name="attempt_steps")
    op.drop_index("idx_steps_attempt", table_name="attempt_steps")
    op.drop_table("attempt_steps")

    op.drop_index("idx_attempts_completed", table_name="attempts")
    op.drop_index("idx_attempts_active", table_name="attempts")
    op.drop_index("idx_attempts_status", table_name="attempts")
    op.drop_index("idx_attempts_scenario", table_name="attempts")
    op.drop_index("idx_attempts_user", table_name="attempts")
    op.drop_table("attempts")

    op.drop_column("scenario_edges", "option_id")
