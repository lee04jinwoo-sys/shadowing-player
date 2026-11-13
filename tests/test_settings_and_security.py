"""Regression & hardening tests for app settings, API keys, Anki completer, and route validation."""
import io
import json
import urllib.request
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import app_dirs
from backend.anki_core import completer as completer_module
from backend.routers import auth as auth_router
from backend.routers import dict as dict_router
from backend.routers import settings as settings_router
from backend.routers import youtube as youtube_router


def _patch_app_dirs(tmp_path: Path, monkeypatch) -> Path:
    settings_file = tmp_path / "settings.json"
    monkeypatch.setattr(app_dirs, "APP_SUPPORT_DIR", tmp_path)
    monkeypatch.setattr(app_dirs, "SETTINGS_PATH", settings_file)
    monkeypatch.setattr(app_dirs, "LOG_DIR", tmp_path / "logs")
    monkeypatch.setattr(app_dirs, "SUBTITLE_CACHE_DIR", tmp_path / "subtitle_cache")
    monkeypatch.setattr(app_dirs, "LOG_FILE_PATH", tmp_path / "logs" / "app.log")
    return settings_file


def test_load_settings_preserves_custom_video_dir_without_mp4(tmp_path: Path, monkeypatch):
    settings_file = _patch_app_dirs(tmp_path, monkeypatch)
    proj_videos = tmp_path / "proj_videos"
    proj_videos.mkdir()
    (proj_videos / "demo.mp4").write_bytes(b"mp4")
    monkeypatch.setattr(app_dirs, "_PROJECT_VIDEOS_DIR", proj_videos)

    custom_dir = tmp_path / "custom_avi_library"
    custom_dir.mkdir()
    (custom_dir / "classic.avi").write_bytes(b"avi")

    settings_file.write_text(json.dumps({"video_dir": str(custom_dir)}), encoding="utf-8")

    loaded = app_dirs.load_settings()

    assert loaded["video_dir"] == str(custom_dir)
    persisted = json.loads(settings_file.read_text(encoding="utf-8"))
    assert persisted["video_dir"] == str(custom_dir)


def test_load_settings_falls_back_when_saved_video_dir_missing(tmp_path: Path, monkeypatch):
    settings_file = _patch_app_dirs(tmp_path, monkeypatch)
    proj_videos = tmp_path / "proj_videos"
    proj_videos.mkdir()
    (proj_videos / "demo.mp4").write_bytes(b"mp4")
    monkeypatch.setattr(app_dirs, "_PROJECT_VIDEOS_DIR", proj_videos)

    missing_dir = tmp_path / "nonexistent_dir"
    settings_file.write_text(json.dumps({"video_dir": str(missing_dir)}), encoding="utf-8")

    loaded = app_dirs.load_settings()

    assert loaded["video_dir"] == str(proj_videos)


def test_settings_post_ignores_masked_api_key(tmp_path: Path, monkeypatch):
    settings_file = _patch_app_dirs(tmp_path, monkeypatch)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setattr("backend.services.episode_service.get_episodes", lambda force_refresh=False: [])

    app = FastAPI()
    app.include_router(settings_router.router)
    client = TestClient(app)

    res1 = client.post("/api/settings/", json={"google_api_key": "AIzaRealSecret9876"})
    assert res1.status_code == 200

    res2 = client.post("/api/settings/", json={"google_api_key": "**************9876"})
    assert res2.status_code == 200

    saved = json.loads(settings_file.read_text(encoding="utf-8"))
    assert saved["google_api_key"] == "AIzaRealSecret9876"
    assert app_dirs.get_google_api_key() == "AIzaRealSecret9876"


def test_note_completer_uses_settings_api_key_when_env_unset(tmp_path: Path, monkeypatch):
    settings_file = _patch_app_dirs(tmp_path, monkeypatch)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    settings_file.write_text(json.dumps({"google_api_key": "AIzaCompleterKey456"}), encoding="utf-8")

    seen: list[str] = []

    class FakeClient:
        def __init__(self, api_key: str):
            seen.append(api_key)

    monkeypatch.setattr(completer_module.genai, "Client", FakeClient)

    completer_module.NoteCompleter()

    assert seen == ["AIzaCompleterKey456"]


def test_dict_lookup_rejects_get_and_youtube_validates_ids():
    app = FastAPI()
    app.include_router(dict_router.router)
    app.include_router(youtube_router.router)
    client = TestClient(app)

    res_get_lookup = client.get("/api/dict/lookup")
    assert res_get_lookup.status_code == 405

    res_bad_vid = client.get("/api/youtube/subtitles/bad-id")
    assert res_bad_vid.status_code == 400

    res_bad_chan = client.get("/api/youtube/subscriptions/channel/bad$chan")
    assert res_bad_chan.status_code == 400


def test_oauth_callback_restricts_postmessage_to_same_origin(tmp_path: Path, monkeypatch):
    _patch_app_dirs(tmp_path, monkeypatch)
    monkeypatch.setattr(
        auth_router,
        "load_settings",
        lambda: {"google_client_id": "cid", "google_client_secret": "csec"},
    )
    monkeypatch.setattr(auth_router, "save_settings", lambda s: None)
    monkeypatch.setattr(auth_router, "fetch_user_subscriptions", lambda token: [])

    class FakeResp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        lambda req, timeout=10: FakeResp(json.dumps({"access_token": "tok"}).encode("utf-8")),
    )

    app = FastAPI()
    app.include_router(auth_router.router)
    client = TestClient(app)

    res = client.get("/api/auth/google/callback?code=sample-code", headers={"host": "127.0.0.1:8080"})
    assert res.status_code == 200
    assert "window.location.origin" in res.text
    assert "'*'" not in res.text
