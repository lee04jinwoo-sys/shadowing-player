"""Shadowing Player is for one user on this Mac only.

- The server binds to 127.0.0.1 by default.
- Requests whose Host is not localhost are refused (DNS rebinding).
- Requests from other websites are refused (Origin / Sec-Fetch-Site),
  except top-level navigations such as the Google OAuth redirect.
- No allow-all CORS.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def server_module():
    import server
    return server


@pytest.fixture
def client(server_module):
    return TestClient(server_module.app, base_url="http://localhost:8080")


def test_default_host_is_loopback(server_module, monkeypatch):
    monkeypatch.delenv("HOST", raising=False)
    assert server_module.default_host() == "127.0.0.1"


def test_local_host_is_served(client):
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize("host", ["127.0.0.1:8080", "[::1]:8080", "localhost"])
def test_loopback_host_variants_are_served(client, host):
    assert client.get("/health", headers={"host": host}).status_code == 200


def test_foreign_host_is_refused(client):
    res = client.get("/health", headers={"host": "evil.example.com"})
    assert res.status_code == 403


def test_cross_site_origin_is_refused(client):
    res = client.post("/api/settings/", json={}, headers={"origin": "https://evil.example.com"})
    assert res.status_code == 403


def test_same_origin_post_passes_the_guard(client, monkeypatch):
    from backend.routers import settings as settings_router
    saved = {}
    monkeypatch.setattr(settings_router, "load_settings", lambda: {})
    monkeypatch.setattr(settings_router, "save_settings", lambda s: saved.update(s))

    res = client.post("/api/settings/", json={}, headers={"origin": "http://localhost:8080"})
    assert res.status_code == 200


def test_cross_site_fetch_without_origin_is_refused(client):
    res = client.get("/api/settings/", headers={"sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors"})
    assert res.status_code == 403


def test_cross_site_navigation_is_allowed_for_oauth_redirect(client):
    res = client.get(
        "/api/auth/google/callback?error=access_denied",
        headers={"sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate"},
    )
    assert res.status_code == 200


def test_no_allow_all_cors(client):
    res = client.options("/api/settings/", headers={
        "origin": "https://evil.example.com",
        "access-control-request-method": "POST",
    })
    assert res.headers.get("access-control-allow-origin") not in ("*", "https://evil.example.com")


def test_oauth_callback_escapes_error(client):
    res = client.get("/api/auth/google/callback", params={"error": "<script>alert(1)</script>"})
    assert "<script>alert(1)</script>" not in res.text
    assert "&lt;script&gt;" in res.text


@pytest.mark.parametrize("name", ["render.yaml", "vercel.json", ".vercelignore", "Dockerfile", "Procfile"])
def test_public_deploy_configs_are_gone(name):
    assert not (ROOT / name).exists()


def test_frontend_files_are_revalidated(client):
    assert client.get("/js/app.js").headers.get("cache-control") == "no-cache"
