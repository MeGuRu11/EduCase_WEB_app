"""FastAPI entrypoint. See §5.1 + §T.8 + E-17 + §U.3 (scheduler)."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import APP_VERSION, CORS_ORIGINS, ENV, MEDIA_DIR, init_dirs
from routers import admin as admin_router
from routers import analytics as analytics_router
from routers import attempts as attempts_router
from routers import auth as auth_router
from routers import groups as groups_router
from routers import media as media_router
from routers import nodes as nodes_router
from routers import scenarios as scenarios_router
from routers import users as users_router
from services.scheduler import shutdown_scheduler, start_scheduler

init_dirs()

# E-17 — hide /docs + /openapi in prod so attackers don't enumerate the API.
_docs_url = "/api/docs" if ENV == "dev" else None
_openapi_url = "/api/openapi.json" if ENV == "dev" else None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Tests use an in-process TestClient with a rolled-back DB — running
    # background jobs there causes spurious commits, so opt-out via env var.
    if os.getenv("DISABLE_SCHEDULER") != "1":
        start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="EpiCase API",
    version=APP_VERSION,
    docs_url=_docs_url,
    redoc_url=None,
    openapi_url=_openapi_url,
    lifespan=lifespan,
)

# §T.8 — explicit origin list, allow_credentials requires it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(groups_router.router)
app.include_router(scenarios_router.router)
app.include_router(nodes_router.router)
app.include_router(media_router.router)
app.include_router(attempts_router.router)
app.include_router(analytics_router.router)
app.include_router(admin_router.router)
app.include_router(admin_router.public_router)


@app.get("/api/ping")
def ping() -> dict[str, str]:
    return {"status": "ok", "version": APP_VERSION}
