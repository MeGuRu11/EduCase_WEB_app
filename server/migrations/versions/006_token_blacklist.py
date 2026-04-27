"""Pre-Stage-4 hardening — ``token_blacklist`` table.

Why now: ``POST /api/auth/logout`` was a no-op — JWT continued to authorise
for the rest of its 8-hour TTL. We now record revoked ``jti`` values and
``dependencies.get_current_user`` consults the blacklist on every request.

Refresh-token rotation is intentionally deferred to Stage 10 — see
``docs/RETRO_AUDIT_STAGE0-3.md`` "Pre-Stage-4 Hardening" notes.

Revision ID: 006
Revises: 005
Create Date: 2026-04-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "token_blacklist",
        sa.Column("jti", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_token_blacklist_user_id"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_token_blacklist_expires",
        "token_blacklist",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_token_blacklist_expires", table_name="token_blacklist")
    op.drop_table("token_blacklist")
