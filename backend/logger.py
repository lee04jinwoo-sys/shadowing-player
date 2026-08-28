"""Centralized logging configuration for Shadowing Player.

Configures both console and file logging with rolling file handler.
Log files are written to ~/Library/Logs/ShadowingPlayer/app.log in production,
or to <project>/logs/app.log in development mode.
"""
import logging
import sys
from logging.handlers import RotatingFileHandler

from backend.app_dirs import LOG_FILE_PATH, ensure_directories


def setup_logging(level: int = logging.INFO) -> None:
    """Configure application-wide logging.

    Sets up:
    - Console handler (stderr) with concise format
    - Rotating file handler (10MB max, 3 backups) with detailed format
    """
    ensure_directories()

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Clear any existing handlers to avoid duplicates on re-init
    root_logger.handlers.clear()

    # --- Console handler ---
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(level)
    console_fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    console_handler.setFormatter(console_fmt)
    root_logger.addHandler(console_handler)

    # --- Rotating file handler ---
    try:
        file_handler = RotatingFileHandler(
            str(LOG_FILE_PATH),
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=3,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)  # File captures everything
        file_fmt = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        file_handler.setFormatter(file_fmt)
        root_logger.addHandler(file_handler)
        logging.getLogger(__name__).info(f"File logging initialized: {LOG_FILE_PATH}")
    except Exception as e:
        logging.getLogger(__name__).warning(
            f"Could not initialize file logging at {LOG_FILE_PATH}: {e}. "
            "Continuing with console logging only."
        )

    # Suppress noisy third-party loggers
    for noisy_logger in ["httpcore", "httpx", "urllib3", "hpack"]:
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)
