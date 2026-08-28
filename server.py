import argparse
import os
import sys
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# --- CLI argument parsing (for Tauri sidecar: --port <PORT> --video-dir <DIR>) ---
def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for standalone/sidecar execution."""
    parser = argparse.ArgumentParser(description="Shadowing Player Backend Server")
    parser.add_argument(
        "--port", type=int, default=int(os.getenv("PORT", "8000")),
        help="Port to listen on (default: 8000 or $PORT env var)",
    )
    parser.add_argument(
        "--video-dir", type=str, default=None,
        help="Override the video directory path",
    )
    parser.add_argument(
        "--parent-pid", type=int, default=0,
        help="PID of the parent (Tauri) process to monitor for clean shutdown",
    )
    # Only parse known args to avoid conflicts with uvicorn's own args
    args, _ = parser.parse_known_args()
    return args

# Initialize centralized logging (file + console)
from backend.logger import setup_logging
setup_logging()

# Initialize application directories
from backend.app_dirs import ensure_directories
ensure_directories()

logger = logging.getLogger("ShadowingPlayer")

app = FastAPI(title="Shadowing Player")

# CORS setup to allow Mac and iPad connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Resolve frontend directory (works in dev, python script, and PyInstaller bundled binary)
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    _SERVER_DIR = Path(sys._MEIPASS)
else:
    _SERVER_DIR = Path(__file__).resolve().parent

_FRONTEND_DIR = _SERVER_DIR / "frontend"

# Mount static files (CRITICAL for CSS/JS to work)
app.mount("/css", StaticFiles(directory=str(_FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(_FRONTEND_DIR / "js")), name="js")

@app.api_route("/", methods=["GET", "HEAD"])
def read_root():
    return FileResponse(str(_FRONTEND_DIR / "index.html"))

@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    """Health check endpoint for Tauri sidecar startup verification."""
    return {"status": "ok"}

def start_parent_watchdog(parent_pid: int) -> None:
    """Monitors parent process and terminates sidecar if parent exits.

    PyInstaller creates a 2-level process (bootloader → Python), so we probe
    the original parent PID directly with ``os.kill(pid, 0)`` instead of
    relying on ``os.getppid()`` which only sees the immediate parent.
    """
    import signal
    import time
    import threading

    def _watch() -> None:
        while True:
            time.sleep(1)
            try:
                # Signal 0 checks if the process exists without sending anything.
                # If parent is gone, this raises ProcessLookupError / OSError.
                os.kill(parent_pid, 0)
            except (ProcessLookupError, OSError):
                os._exit(0)

    t = threading.Thread(target=_watch, daemon=True)
    t.start()

if __name__ == "__main__":
    import uvicorn
    args = parse_args()

    # Start parent watchdog if spawned as a sidecar process
    target_parent_pid = args.parent_pid if args.parent_pid > 0 else os.getppid()
    start_parent_watchdog(target_parent_pid)

    # If --video-dir is provided, override the settings
    if args.video_dir:
        from backend.app_dirs import save_settings, load_settings
        settings = load_settings()
        settings["video_dir"] = args.video_dir
        save_settings(settings)
        logger.info(f"Video directory overridden: {args.video_dir}")

    logger.info(f"Starting Shadowing Player server on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port)
