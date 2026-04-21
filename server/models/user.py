"""User, Role, Group, TeacherGroup, Discipline, Topic — per §8.1."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)

    users: Mapped[list[User]] = relationship(back_populates="role")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    students: Mapped[list[User]] = relationship(back_populates="group")
    teacher_links: Mapped[list[TeacherGroup]] = relationship(
        back_populates="group", cascade="all, delete-orphan", passive_deletes=True
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id"), nullable=False, index=True
    )
    group_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="SET NULL"), index=True
    )
    avatar_path: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    login_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    role: Mapped[Role] = relationship(back_populates="users")
    group: Mapped[Group | None] = relationship(back_populates="students")
    taught_groups: Mapped[list[TeacherGroup]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan", passive_deletes=True
    )


class TeacherGroup(Base):
    """Many-to-many between teachers and groups (admin assigns)."""

    __tablename__ = "teacher_groups"

    teacher_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    teacher: Mapped[User] = relationship(back_populates="taught_groups")
    group: Mapped[Group] = relationship(back_populates="teacher_links")


class Discipline(Base):
    __tablename__ = "disciplines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    topics: Mapped[list[Topic]] = relationship(
        back_populates="discipline", cascade="all, delete-orphan", passive_deletes=True
    )


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    discipline_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("disciplines.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    discipline: Mapped[Discipline] = relationship(back_populates="topics")
