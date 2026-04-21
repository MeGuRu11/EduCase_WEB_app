"""Form template ORM models (backing for node_type='form'). See §8.1 + §S.4."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class FormTemplate(Base):
    __tablename__ = "form_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    template_key: Mapped[str | None] = mapped_column(String(50), unique=True)

    fields: Mapped[list[FormTemplateField]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="FormTemplateField.order_index",
    )


class FormTemplateField(Base):
    __tablename__ = "form_template_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("form_templates.id", ondelete="CASCADE"), nullable=False
    )
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_label: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="text", server_default="text"
    )
    options_json: Mapped[Any | None] = mapped_column(JSONB)
    is_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    score_value: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0, server_default="1.0"
    )
    validation_regex: Mapped[str | None] = mapped_column(String(200))

    template: Mapped[FormTemplate] = relationship(back_populates="fields")
