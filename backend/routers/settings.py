"""Settings API router.

Provides endpoints for reading and writing application settings
(API keys, video directory, log file path) from the frontend.
"""
import logging
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app_dirs import (
    LOG_FILE_PATH,
    get_google_api_key,
    get_video_dir,
    load_settings,
    save_settings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings")


class SettingsResponse(BaseModel):
    """Current application settings."""
    google_api_key: str = ""
    video_dir: str = ""
    log_path: str = ""


class SettingsUpdateRequest(BaseModel):
    """Request body for updating settings."""
    google_api_key: Optional[str] = None
    video_dir: Optional[str] = None


@router.api_route("/", methods=["GET", "HEAD"])
def get_settings() -> SettingsResponse:
    """Get current application settings."""
    settings = load_settings()
    return SettingsResponse(
        google_api_key=_mask_api_key(settings.get("google_api_key", "")),
        video_dir=settings.get("video_dir", ""),
        log_path=str(LOG_FILE_PATH),
    )


@router.post("/")
def update_settings(req: SettingsUpdateRequest) -> dict:
    """Update application settings."""
    current = load_settings()

    if req.google_api_key is not None:
        # Don't save masked display values (e.g., "********9876") back over the real key
        if not _is_masked_api_key(req.google_api_key):
            current["google_api_key"] = req.google_api_key
            # Also update the environment variable for the current session
            os.environ["GOOGLE_API_KEY"] = req.google_api_key

    if req.video_dir is not None:
        video_path = Path(req.video_dir)
        if not video_path.exists():
            try:
                video_path.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot create video directory: {e}",
                )
        current["video_dir"] = str(video_path)

    save_settings(current)
    logger.info("Settings updated successfully")

    # Invalidate and immediately refresh the episode cache for the new folder
    try:
        from backend.services.episode_service import get_episodes
        get_episodes(force_refresh=True)
    except Exception as e:
        logger.warning(f"Could not refresh episode cache: {e}")

    return {"success": True, "message": "설정이 저장되었습니다."}


@router.post("/select-folder")
def select_folder_dialog() -> dict:
    """Opens a native macOS folder picker dialog using AppleScript."""
    import subprocess
    script = '''
    set chosenFolder to choose folder with prompt "비디오 및 자막이 있는 폴더를 선택하세요"
    POSIX path of chosenFolder
    '''
    try:
        res = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )
        folder_path = res.stdout.strip()
        if folder_path.endswith("/"):
            folder_path = folder_path[:-1]
        return {"folder_path": folder_path, "canceled": False}
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        # User canceled dialog or timed out
        return {"folder_path": None, "canceled": True}
    except Exception as e:
        logger.error(f"Error opening folder picker: {e}")
        return {"folder_path": None, "error": str(e), "canceled": True}


@router.api_route("/log-path", methods=["GET", "HEAD"])
def get_log_path() -> dict:
    """Get the log file path for the 'Open Log' feature."""
    return {
        "log_path": str(LOG_FILE_PATH),
        "exists": LOG_FILE_PATH.exists(),
    }


def _is_masked_api_key(val: str) -> bool:
    """Return True if val looks like a masked placeholder emitted by _mask_api_key()."""
    stripped = val.strip()
    return bool(stripped) and bool(re.fullmatch(r"\*+.{0,4}", stripped))


def _mask_api_key(key: str) -> str:
    """Mask an API key for safe display, showing only last 4 characters."""
    if not key or len(key) <= 8:
        return key
    return "*" * (len(key) - 4) + key[-4:]
