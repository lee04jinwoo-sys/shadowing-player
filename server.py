import argparse
import os
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load env variables
load_dotenv()


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Shadowing Player Backend Server")
    parser.add_argument(
        "--port", type=int, default=int(os.getenv("PORT", "8000")),
        help="Port to listen on (default: 8000 or $PORT env var)",
    )
    # Only parse known args to avoid conflicts with uvicorn's own args
    args, _ = parser.parse_known_args()
    return args


def default_host() -> str:
    """Personal app: listen on loopback only unless HOST says otherwise."""
    return os.getenv("HOST", "127.0.0.1")


# Initialize centralized logging (file + console)
from backend.logger import setup_logging
setup_logging()

# Initialize application directories
from backend.app_dirs import ensure_directories
ensure_directories()

logger = logging.getLogger("ShadowingPlayer")

app = FastAPI(title="Shadowing Player")

# Only this Mac's own browser tab may call the API (no CORS, no other sites)
from backend.security import LocalOnlyMiddleware
app.add_middleware(LocalOnlyMiddleware)

# Import routers
from backend.routers import video, subtitle, anki, ai, youtube, export, dict as dict_router, auth as auth_router
from backend.routers import settings as settings_router

# Include routers
app.include_router(video.router)
app.include_router(subtitle.router)
app.include_router(anki.router)
app.include_router(ai.router)
app.include_router(youtube.router)
app.include_router(export.router)
app.include_router(dict_router.router)
app.include_router(settings_router.router)
app.include_router(auth_router.router)

_FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"

@app.middleware("http")
async def revalidate_frontend(request, call_next):
    """Browser must re-check JS/CSS/HTML on each load (ETag keeps it cheap), so updates show up."""
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith(("/js/", "/css/")):
        response.headers["Cache-Control"] = "no-cache"
    return response

# Mount static files (CRITICAL for CSS/JS to work)
app.mount("/css", StaticFiles(directory=str(_FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(_FRONTEND_DIR / "js")), name="js")

@app.api_route("/", methods=["GET", "HEAD"])
def read_root():
    return FileResponse(str(_FRONTEND_DIR / "index.html"))

@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    args = parse_args()
    host = default_host()
    logger.info(f"Starting Shadowing Player server on {host}:{args.port}")
    uvicorn.run(app, host=host, port=args.port)
