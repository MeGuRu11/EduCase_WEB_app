"""Stage 1 — initial schema (roles, groups, users, teacher_groups, disciplines,
topics, form_templates, form_template_fields).

Revision ID: 001
Revises:
Create Date: 2026-04-21

See PROJECT_DESIGN §8.1, ADDENDUM §S.2 (must_change_password) and §MIG 001.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )

    op.create_table(
        "groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
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
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column(
            "role_id",
            sa.Integer(),
            sa.ForeignKey("roles.id", name="fk_users_role_id"),
            nullable=False,
        ),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("groups.id", ondelete="SET NULL", name="fk_users_group_id"),
            nullable=True,
        ),
        sa.Column("avatar_path", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="§S.2 — FIRST_ADMIN forces password change on first login",
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "login_attempts",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("idx_users_role", "users", ["role_id"])
    op.create_index("idx_users_group", "users", ["group_id"])
    op.create_index("idx_users_username", "users", ["username"])

    op.create_table(
        "teacher_groups",
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_tg_teacher_id"),
            primary_key=True,
        ),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("groups.id", ondelete="CASCADE", name="fk_tg_group_id"),
            primary_key=True,
        ),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_teacher_groups_teacher", "teacher_groups", ["teacher_id"])
    op.create_index("idx_teacher_groups_group", "teacher_groups", ["group_id"])

    op.create_table(
        "disciplines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "discipline_id",
            sa.Integer(),
            sa.ForeignKey("disciplines.id", ondelete="CASCADE", name="fk_topics_discipline_id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.create_table(
        "form_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_key", sa.String(length=50), nullable=True),
        sa.UniqueConstraint("template_key", name="uq_form_templates_template_key"),
    )

    op.create_table(
        "form_template_fields",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "template_id",
            sa.Integer(),
            sa.ForeignKey(
                "form_templates.id", ondelete="CASCADE", name="fk_ftf_template_id"
            ),
            nullable=False,
        ),
        sa.Column("field_key", sa.String(length=100), nullable=False),
        sa.Column("field_label", sa.String(length=200), nullable=False),
        sa.Column(
            "field_type",
            sa.String(length=30),
            nullable=False,
            server_default=sa.text("'text'"),
        ),
        sa.Column("options_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "is_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "order_index",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "score_value",
            sa.Float(),
            nullable=False,
            server_default=sa.text("1.0"),
        ),
        sa.Column("validation_regex", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("form_template_fields")
    op.drop_table("form_templates")
    op.drop_table("topics")
    op.drop_table("disciplines")
    op.drop_index("idx_teacher_groups_group", table_name="teacher_groups")
    op.drop_index("idx_teacher_groups_teacher", table_name="teacher_groups")
    op.drop_table("teacher_groups")
    op.drop_index("idx_users_username", table_name="users")
    op.drop_index("idx_users_group", table_name="users")
    op.drop_index("idx_users_role", table_name="users")
    op.drop_table("users")
    op.drop_table("groups")
    op.drop_table("roles")
