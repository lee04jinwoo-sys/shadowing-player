"""Application directory management.

All data lives inside the project folder:
- Settings: cache/settings.json (holds tokens; written with owner-only permissions)
- Cache DB: cache/dict_cache.db
- Subtitle cache: cache/subtitle_cache/
- Logs: logs/app.log
"""
import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# --- Base directories ---
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_SUPPORT_DIR = _PROJECT_ROOT / "cache"
LOG_DIR = _PROJECT_ROOT / "logs"

# --- Specific paths ---
SETTINGS_PATH = APP_SUPPORT_DIR / "settings.json"
DICT_CACHE_DB_PATH = APP_SUPPORT_DIR / "dict_cache.db"
SUBTITLE_CACHE_DIR = APP_SUPPORT_DIR / "subtitle_cache"
LOG_FILE_PATH = LOG_DIR / "app.log"

# Known project videos directory (for seamless migration from web version)
_PROJECT_VIDEOS_DIR = _PROJECT_ROOT / "videos"


def get_default_video_dir() -> Path:
    """Return project videos directory if it has media, otherwise ~/Movies/Shadowing Player."""
    if _PROJECT_VIDEOS_DIR.exists() and any(_PROJECT_VIDEOS_DIR.glob("*.mp4")):
        return _PROJECT_VIDEOS_DIR
    return Path.home() / "Movies" / "Shadowing Player"


DEFAULT_VIDEO_DIR = get_default_video_dir()


def ensure_directories() -> None:
    """Create all required application directories if they don't exist."""
    dirs_to_create = [
        APP_SUPPORT_DIR,
        LOG_DIR,
        SUBTITLE_CACHE_DIR,
    ]
    for d in dirs_to_create:
        d.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Ensured directory exists: {d}")


def load_settings() -> dict[str, Any]:
    """Load application settings from settings.json.

    Returns a dict with keys:
        - google_api_key: str
        - video_dir: str
    """
    default_dir = str(get_default_video_dir())
    defaults: dict[str, Any] = {
        "google_api_key": os.getenv("GOOGLE_API_KEY", ""),
        "video_dir": default_dir,
    }
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            # Merge: saved values override defaults, but keep any new default keys
            merged = {**defaults, **saved}
            
            # Auto-fallback: if saved video_dir doesn't exist or has no mp4 files,
            # but the project videos folder has files, automatically switch to it!
            saved_dir = Path(merged.get("video_dir", ""))
            if (not saved_dir.exists() or not any(saved_dir.glob("*.mp4"))) and _PROJECT_VIDEOS_DIR.exists() and any(_PROJECT_VIDEOS_DIR.glob("*.mp4")):
                merged["video_dir"] = str(_PROJECT_VIDEOS_DIR)
                # Persist the update
                try:
                    with open(SETTINGS_PATH, "w", encoding="utf-8") as fw:
                        json.dump(merged, fw, ensure_ascii=False, indent=2)
                except Exception:
                    pass

            return merged
        except Exception as e:
            logger.warning(f"Failed to load settings from {SETTINGS_PATH}: {e}")
    return defaults


def save_settings(settings: dict[str, Any]) -> None:
    """Save application settings to settings.json."""
    ensure_directories()
    try:
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        os.chmod(SETTINGS_PATH, 0o600)  # tokens and API keys: owner only
        logger.info(f"Settings saved to {SETTINGS_PATH}")
    except Exception as e:
        logger.error(f"Failed to save settings to {SETTINGS_PATH}: {e}")
        raise


def get_video_dir() -> Path:
    """Get the configured video directory path."""
    settings = load_settings()
    video_dir = Path(settings.get("video_dir", str(DEFAULT_VIDEO_DIR)))
    video_dir.mkdir(parents=True, exist_ok=True)
    return video_dir


def get_google_api_key() -> str:
    """Get the Google API key from settings or environment."""
    # Environment variable takes priority
    env_key = os.getenv("GOOGLE_API_KEY", "")
    if env_key:
        return env_key
    settings = load_settings()
    return settings.get("google_api_key", "")
