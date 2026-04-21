"""Runtime configuration. All secrets live in env; sane defaults are dev-safe only."""

from __future__ import annotations

import os
from pathlib import Path

ENV = os.getenv("ENV", "dev")  # "dev" | "prod" — drives docs_url exposure (E-17)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://epicase:epicase@localhost:5432/epicase"
)

_JWT_SECRET_DEV_DEFAULT = "change-me-in-production-use-32-chars-min"  # noqa: S105
JWT_SECRET = os.getenv("JWT_SECRET", _JWT_SECRET_DEV_DEFAULT)
JWT_ALGORITHM = "HS256"

# Fail-closed in prod: never ship with the dev default secret.
if ENV == "prod" and JWT_SECRET == _JWT_SECRET_DEV_DEFAULT:
    raise RuntimeError(
        "JWT_SECRET env var must be set to a non-default value when ENV=prod"
    )
ACCESS_TOKEN_EXPIRE_HOURS = 8
REFRESH_TOKEN_EXPIRE_DAYS = 7

HOST = os.getenv("HOST", "0.0.0.0")  # noqa: S104 — binding all interfaces inside the container is intentional
PORT = int(os.getenv("PORT", "8000"))

MEDIA_DIR = Path(os.getenv("MEDIA_DIR", "data/media"))
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "data/backups"))

MEDIA_LIMITS = {
    "avatar": {"max_mb": 2, "formats": ["JPEG", "PNG", "WEBP"]},
    "cover": {"max_mb": 5, "formats": ["JPEG", "PNG", "WEBP"]},
    "node_image": {"max_mb": 10, "formats": ["JPEG", "PNG", "WEBP", "GIF"]},
}

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 30

APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

# §T.8 — explicit list, never "*". `allow_credentials=True` forbids wildcards.
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

FIRST_RUN = os.getenv("FIRST_RUN", "false").lower() == "true"


def init_dirs() -> None:
    for d in [
        MEDIA_DIR,
        BACKUP_DIR,
        MEDIA_DIR / "avatars",
        MEDIA_DIR / "covers",
        MEDIA_DIR / "nodes",
    ]:
        d.mkdir(parents=True, exist_ok=True)
