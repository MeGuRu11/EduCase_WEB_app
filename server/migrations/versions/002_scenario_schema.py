"""Stage 2 — scenario schema (scenarios, scenario_nodes, scenario_edges,
scenario_groups, media_files) per PROJECT_DESIGN §8.1, ADDENDUM §MIG + §Q + §B.5.

Revision ID: 002
Revises: 001
Create Date: 2026-04-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "topic_id",
            sa.Integer(),
            sa.ForeignKey("topics.id", ondelete="SET NULL", name="fk_scenarios_topic_id"),
            nullable=True,
        ),
        sa.Column(
            "author_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_scenarios_author_id"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("disease_category", sa.String(length=100), nullable=True),
        sa.Column("cover_path", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column("time_limit_min", sa.Integer(), nullable=True),
        sa.Column("max_attempts", sa.Integer(), nullable=True),
        sa.Column(
            "passing_score",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("60"),
        ),
        sa.Column(
            "settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_scenarios_status",
        ),
    )
    op.create_index("idx_scenarios_author", "scenarios", ["author_id"])
    op.create_index("idx_scenarios_status", "scenarios", ["status"])
    # ADDENDUM §Q — partial index speeds up the student "only published" list.
    op.create_index(
        "idx_scenarios_published",
        "scenarios",
        ["updated_at"],
        postgresql_where=sa.text("status = 'published'"),
    )

    op.create_table(
        "scenario_nodes",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column(
            "scenario_id",
            sa.Integer(),
            sa.ForeignKey(
                "scenarios.id", ondelete="CASCADE", name="fk_nodes_scenario_id"
            ),
            nullable=False,
        ),
        sa.Column("node_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column(
            "position_x", sa.Float(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "position_y", sa.Float(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "node_data",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("color_hex", sa.String(length=7), nullable=True),
        sa.PrimaryKeyConstraint("id", "scenario_id", name="pk_scenario_nodes"),
        sa.CheckConstraint(
            "node_type IN ('start', 'data', 'decision', 'form', 'text_input', 'final')",
            name="ck_scenario_nodes_type",
        ),
    )
    op.create_index("idx_nodes_scenario", "scenario_nodes", ["scenario_id"])
    # ADDENDUM §Q — GIN index on JSONB node_data (keyword / correct_value search).
    op.execute(
        "CREATE INDEX idx_nodes_data_gin ON scenario_nodes USING GIN (node_data);"
    )

    op.create_table(
        "scenario_edges",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column(
            "scenario_id",
            sa.Integer(),
            sa.ForeignKey(
                "scenarios.id", ondelete="CASCADE", name="fk_edges_scenario_id"
            ),
            nullable=False,
        ),
        sa.Column("source_id", sa.String(length=50), nullable=False),
        sa.Column("target_id", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column(
            "is_correct",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "score_delta",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "condition",
            postgresql.JSONB(),
            nullable=True,
            comment="RESERVED for V2: conditional transitions based on previous answers",
        ),
        sa.PrimaryKeyConstraint("id", "scenario_id", name="pk_scenario_edges"),
    )
    op.create_index("idx_edges_scenario", "scenario_edges", ["scenario_id"])

    op.create_table(
        "scenario_groups",
        sa.Column(
            "scenario_id",
            sa.Integer(),
            sa.ForeignKey(
                "scenarios.id", ondelete="CASCADE", name="fk_sg_scenario_id"
            ),
            primary_key=True,
        ),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("groups.id", ondelete="CASCADE", name="fk_sg_group_id"),
            primary_key=True,
        ),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_scenario_groups_group", "scenario_groups", ["group_id"])

    op.create_table(
        "media_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.String(length=500), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("media_type", sa.String(length=30), nullable=False),
        sa.Column(
            "uploaded_by",
            sa.Integer(),
            sa.ForeignKey(
                "users.id", ondelete="SET NULL", name="fk_media_uploaded_by"
            ),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "media_type IN ('avatar', 'cover', 'node_image')",
            name="ck_media_files_type",
        ),
    )


def downgrade() -> None:
    op.drop_table("media_files")
    op.drop_index("idx_scenario_groups_group", table_name="scenario_groups")
    op.drop_table("scenario_groups")
    op.drop_index("idx_edges_scenario", table_name="scenario_edges")
    op.drop_table("scenario_edges")
    op.execute("DROP INDEX IF EXISTS idx_nodes_data_gin;")
    op.drop_index("idx_nodes_scenario", table_name="scenario_nodes")
    op.drop_table("scenario_nodes")
    op.drop_index("idx_scenarios_published", table_name="scenarios")
    op.drop_index("idx_scenarios_status", table_name="scenarios")
    op.drop_index("idx_scenarios_author", table_name="scenarios")
    op.drop_table("scenarios")
