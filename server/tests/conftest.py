"""Shared pytest fixtures for Stage 1+ (auth / users / groups).

Strategy
--------
* If ``TEST_DATABASE_URL`` is set, we use that Postgres instance (CI + sandbox).
* Otherwise we spin up a disposable Postgres 16 container via testcontainers
  (developer laptops). See ADR-009 for the migration-test requirements.

The ``db_session`` fixture wraps every test in a SAVEPOINT so the test body
can ``commit()`` freely without leaking state across tests (transactional
rollback pattern from SQLAlchemy docs).

The ``client`` fixture overrides FastAPI's ``get_db`` dependency to yield the
same bound session, so assertions against the DB see exactly what the request
handler wrote.
"""

from __future__ import annotations

import os
from collections.abc import Generator, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _resolve_test_db_url() -> tuple[str, Iterator[None]]:
    env_url = os.getenv("TEST_DATABASE_URL")
    if env_url:

        def _noop() -> Iterator[None]:
            yield

        return env_url, _noop()

    # Lazy import — testcontainers is only required when env-var missing.
    from testcontainers.postgres import PostgresContainer  # type: ignore[import-not-found]

    container = PostgresContainer("postgres:16-alpine")
    container.start()

    def _stop() -> Iterator[None]:
        try:
            yield
        finally:
            container.stop()

    return container.get_connection_url().replace("psycopg2", "psycopg2"), _stop()


@pytest.fixture(scope="session")
def postgres_test_url() -> Generator[str, None, None]:
    url, stopper = _resolve_test_db_url()
    # Drive the stopper generator: one ``next`` → enter, final ``next`` → exit.
    next(stopper, None)
    try:
        yield url
    finally:
        next(stopper, None)


@pytest.fixture(scope="session")
def db_engine(postgres_test_url: str) -> Generator[Engine, None, None]:
    """Build the schema once per session via Alembic migrations (ADR-009)."""
    from alembic import command
    from alembic.config import Config

    engine = create_engine(postgres_test_url, pool_pre_ping=True, future=True)

    # Wipe any prior state (sandbox DB is re-used across runs).
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

    cfg = Config("server/alembic.ini")
    cfg.set_main_option("sqlalchemy.url", postgres_test_url)
    command.upgrade(cfg, "head")

    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine: Engine) -> Generator[Session, None, None]:
    """Transaction-per-test: outer BEGIN + nested SAVEPOINT that restarts on commit."""
    connection = db_engine.connect()
    outer_tx = connection.begin()
    session_factory = sessionmaker(bind=connection, autoflush=False, future=True)
    session = session_factory()
    session.begin_nested()

    from sqlalchemy import event

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess: Session, trans):  # type: ignore[no-untyped-def]
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()

    try:
        yield session
    finally:
        session.close()
        outer_tx.rollback()
        connection.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient backed by the same session as ``db_session``."""
    from database import get_db
    from main import app

    def _override_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)


# ─── Domain fixtures ─────────────────────────────────────────────────────────

@pytest.fixture()
def roles(db_session: Session) -> dict[str, int]:
    """Seed the three canonical roles and return a ``name → id`` map."""
    from models.user import Role

    mapping: dict[str, int] = {}
    for name, display in (
        ("student", "Обучаемый"),
        ("teacher", "Преподаватель"),
        ("admin", "Администратор"),
    ):
        existing = db_session.query(Role).filter_by(name=name).one_or_none()
        if existing:
            mapping[name] = existing.id
            continue
        role = Role(name=name, display_name=display)
        db_session.add(role)
        db_session.flush()
        mapping[name] = role.id
    return mapping


@pytest.fixture()
def admin_user(db_session: Session, roles: dict[str, int]):
    from models.user import User
    from services.auth_service import AuthService

    user = User(
        username="admin_fixture",
        password_hash=AuthService.hash_password("Admin1234!"),
        full_name="Фикс. Администратор",
        role_id=roles["admin"],
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture()
def teacher_user(db_session: Session, roles: dict[str, int]):
    from models.user import User
    from services.auth_service import AuthService

    user = User(
        username="teacher_fixture",
        password_hash=AuthService.hash_password("Teacher9#"),
        full_name="Фикс. Преподаватель",
        role_id=roles["teacher"],
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture()
def student_user(db_session: Session, roles: dict[str, int]):
    from models.user import User
    from services.auth_service import AuthService

    user = User(
        username="student_fixture",
        password_hash=AuthService.hash_password("Student1!"),
        full_name="Фикс. Студент",
        role_id=roles["student"],
    )
    db_session.add(user)
    db_session.flush()
    return user


def _login(client: TestClient, username: str, password: str) -> str:
    resp = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture()
def admin_token(client: TestClient, admin_user) -> str:
    return _login(client, "admin_fixture", "Admin1234!")


@pytest.fixture()
def teacher_token(client: TestClient, teacher_user) -> str:
    return _login(client, "teacher_fixture", "Teacher9#")


@pytest.fixture()
def student_token(client: TestClient, student_user) -> str:
    return _login(client, "student_fixture", "Student1!")


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
