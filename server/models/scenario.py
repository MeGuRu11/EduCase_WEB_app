"""Scenario, ScenarioNode, ScenarioEdge, ScenarioGroup — per §8.1 + §9.

Note: composite PK (id, scenario_id) on nodes/edges matches the React-Flow
``node_id`` / ``edge_id`` string values that the editor authors on the client.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Scenario(Base):
    __tablename__ = "scenarios"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_scenarios_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="SET NULL")
    )
    author_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    disease_category: Mapped[str | None] = mapped_column(String(100))
    cover_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", server_default="draft"
    )
    time_limit_min: Mapped[int | None] = mapped_column(Integer)
    max_attempts: Mapped[int | None] = mapped_column(Integer)
    passing_score: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60, server_default="60"
    )
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ``author`` is opt-in-loaded via ``selectinload`` in list paths to avoid
    # N+1 (RETRO_AUDIT priority 3); ``lazy="raise"`` would force callers to
    # be explicit, but loading-by-pk on a single scenario is cheap, so we let
    # SQLAlchemy default lazy="select" keep ad-hoc reads working.
    author: Mapped[User | None] = relationship(  # type: ignore[name-defined] # noqa: F821
        "User",
        foreign_keys=[author_id],
    )
    nodes: Mapped[list[ScenarioNode]] = relationship(
        back_populates="scenario",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ScenarioNode.id",
    )
    edges: Mapped[list[ScenarioEdge]] = relationship(
        back_populates="scenario",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ScenarioEdge.id",
    )
    assignments: Mapped[list[ScenarioGroup]] = relationship(
        back_populates="scenario",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ScenarioNode(Base):
    __tablename__ = "scenario_nodes"
    __table_args__ = (
        PrimaryKeyConstraint("id", "scenario_id", name="pk_scenario_nodes"),
        CheckConstraint(
            "node_type IN ('start', 'data', 'decision', 'form', 'text_input', 'final')",
            name="ck_scenario_nodes_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(50), nullable=False)
    scenario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("scenarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    position_x: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0"
    )
    position_y: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0"
    )
    node_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    color_hex: Mapped[str | None] = mapped_column(String(7))

    scenario: Mapped[Scenario] = relationship(back_populates="nodes")


class ScenarioEdge(Base):
    __tablename__ = "scenario_edges"
    __table_args__ = (
        PrimaryKeyConstraint("id", "scenario_id", name="pk_scenario_edges"),
    )

    id: Mapped[str] = mapped_column(String(50), nullable=False)
    scenario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("scenarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_id: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str | None] = mapped_column(String(200))
    is_correct: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    score_delta: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0"
    )
    option_id: Mapped[str | None] = mapped_column(String(50))
    condition: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    scenario: Mapped[Scenario] = relationship(back_populates="edges")


class ScenarioGroup(Base):
    """Assignment of a scenario to a student group (§6.4 POST /assign)."""

    __tablename__ = "scenario_groups"

    scenario_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("scenarios.id", ondelete="CASCADE"),
        primary_key=True,
    )
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    scenario: Mapped[Scenario] = relationship(back_populates="assignments")
