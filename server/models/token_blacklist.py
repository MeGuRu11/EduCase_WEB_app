"""``TokenBlacklist`` ORM — JWT revocation list (Task 2 of pre-Stage-4 hardening).

Cleanup is owned by ``services.scheduler._cleanup_expired_blacklist`` (hourly
cron). The TTL grace is 1 day past ``expires_at`` so ops can audit recent
revocations without losing context.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    jti: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
