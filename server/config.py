import os
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://epicase:epicase@localhost:5432/epicase")

JWT_SECRET    = os.getenv("JWT_SECRET", "change-me-in-production-use-32-chars-min")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS  = 8
REFRESH_TOKEN_EXPIRE_DAYS  = 7

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

MEDIA_DIR  = Path(os.getenv("MEDIA_DIR", "data/media"))
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "data/backups"))

MEDIA_LIMITS = {
    "avatar":     {"max_mb": 2,  "formats": ["JPEG", "PNG", "WEBP"]},
    "cover":      {"max_mb": 5,  "formats": ["JPEG", "PNG", "WEBP"]},
    "node_image": {"max_mb": 10, "formats": ["JPEG", "PNG", "WEBP", "GIF"]},
}

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES    = 30

APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

def init_dirs():
    for d in [MEDIA_DIR, BACKUP_DIR,
              MEDIA_DIR / "avatars", MEDIA_DIR / "covers", MEDIA_DIR / "nodes"]:
        d.mkdir(parents=True, exist_ok=True)
