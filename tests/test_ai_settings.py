from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import ai_bridge, app_dirs
from backend.routers import ai as ai_router
from backend.routers import settings as settings_router


def test_ai_explain_uses_api_key_saved_via_settings_without_restart(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setattr(ai_bridge, "client", None, raising=False)
    monkeypatch.setattr(ai_bridge, "GOOGLE_API_KEY", None, raising=False)

    monkeypatch.setattr(app_dirs, "APP_SUPPORT_DIR", tmp_path)
    monkeypatch.setattr(app_dirs, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.setattr(app_dirs, "LOG_DIR", tmp_path / "logs")
    monkeypatch.setattr(app_dirs, "SUBTITLE_CACHE_DIR", tmp_path / "subtitle_cache")
    monkeypatch.setattr(app_dirs, "LOG_FILE_PATH", tmp_path / "logs" / "app.log")
    monkeypatch.setattr("backend.services.episode_service.get_episodes", lambda force_refresh=False: [])

    seen_keys: list[str] = []

    class FakeModels:
        def generate_content(self, model: str, contents: str):
            return SimpleNamespace(text="1. 뜻: 테스트\n2. 핵심: OK")

    class FakeClient:
        def __init__(self, api_key: str):
            seen_keys.append(api_key)
            self.models = FakeModels()

    monkeypatch.setattr(ai_bridge.genai, "Client", FakeClient)

    app = FastAPI()
    app.include_router(settings_router.router)
    app.include_router(ai_router.router)
    client = TestClient(app)

    save_res = client.post("/api/settings/", json={"google_api_key": "AIzaDynamicKey999"})
    assert save_res.status_code == 200

    explain_res = client.post("/api/ai/explain", json={"sentence": "Kids, breakfast!"})
    assert explain_res.status_code == 200
    body = explain_res.json()
    assert body["success"] is True
    assert "테스트" in body["explanation"]
    assert seen_keys == ["AIzaDynamicKey999"]
