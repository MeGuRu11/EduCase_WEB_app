"""Regression: get_db must commit on success and roll back on exception.

Bug: services use ``db.flush()`` but never ``db.commit()``. Without explicit
commit in the FastAPI dependency, ``Session.close()`` with ``autocommit=False``
performs an implicit rollback — every POST/PATCH/PUT silently loses its writes
in production. The transaction-per-test conftest masks this because it uses
the same session within the test scope and only rolls back at fixture teardown.

These tests exercise ``get_db`` directly so they would have caught the bug.
"""

from __future__ import annotations

import contextlib
from unittest.mock import MagicMock, patch

import pytest

from database import get_db


def test_get_db_commits_on_normal_exit() -> None:
    fake_session = MagicMock()
    with patch("database.SessionLocal", return_value=fake_session):
        gen = get_db()
        next(gen)
        with contextlib.suppress(StopIteration):
            next(gen)

    fake_session.commit.assert_called_once()
    fake_session.rollback.assert_not_called()
    fake_session.close.assert_called_once()


def test_get_db_rolls_back_on_exception() -> None:
    fake_session = MagicMock()
    with patch("database.SessionLocal", return_value=fake_session):
        gen = get_db()
        next(gen)
        with pytest.raises(RuntimeError, match="boom"):
            gen.throw(RuntimeError("boom"))

    fake_session.rollback.assert_called_once()
    fake_session.commit.assert_not_called()
    fake_session.close.assert_called_once()
