"""Health / version smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from config import APP_VERSION


def test_ping_returns_correct_version(client: TestClient) -> None:
    r = client.get("/api/ping")
    assert r.status_code == 200
    body = r.json()
    assert body == {"status": "ok", "version": APP_VERSION}
    assert APP_VERSION == "1.1.0"  # Pre-Stage-4 hardening Task 4 bump.
