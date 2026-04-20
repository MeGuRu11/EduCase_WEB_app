from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import init_dirs, MEDIA_DIR

init_dirs()

app = FastAPI(title="EpiCase API", version="1.0.0", docs_url="/api/docs", redoc_url=None)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

# TODO: Include routers as implemented (see §6)
# from server.routers import auth, users, groups, scenarios, nodes, attempts, analytics, media, admin
# app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
# ...

@app.get("/api/ping")
def ping():
    return {"status": "ok", "version": "1.0.0"}
