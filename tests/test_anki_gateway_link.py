"""Shadowing Player talks to the Anki Manager running on the Oracle server.

Since 2026-10-11 Anki Manager and Anki run on `oracle-quant`; the Mac reaches the
gateway through an SSH tunnel (localhost:8011 -> server 127.0.0.1:8001, see
infra/anki_tunnel). The Mac's own Anki and Anki Manager are not used.
"""
from pathlib import Path

import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import anki_bridge
from backend.routers import anki as anki_router

ROOT = Path(__file__).resolve().parents[1]


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class CountingSession:
    """A fresh fake per request; records whether it was closed."""
    trust_env = False
    made = []

    def __init__(self, response):
        self.response = response
        self.closed = False
        CountingSession.made.append(self)

    def get(self, url, timeout=None):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

    post = get

    def close(self):
        self.closed = True


def _use(monkeypatch, response):
    CountingSession.made = []
    monkeypatch.setattr(anki_bridge, "_new_session", lambda: CountingSession(response))


def _client():
    app = FastAPI()
    app.include_router(anki_router.router)
    return TestClient(app)


def test_default_gateway_is_the_server_tunnel():
    assert anki_bridge.DEFAULT_ANKI_MANAGER_URL == "http://127.0.0.1:8011"


def test_each_request_uses_its_own_connection(monkeypatch):
    # A shared requests.Session fails every other call through the SSH tunnel
    # (RemoteDisconnected, .handoff/STATUS.md 2026-10-11).
    _use(monkeypatch, FakeResponse(200, {"anki_connected": True}))
    anki_bridge.gateway_status()
    anki_bridge.gateway_status()
    assert len(CountingSession.made) == 2
    assert all(s.closed for s in CountingSession.made)


def test_status_reports_tunnel_down(monkeypatch):
    _use(monkeypatch, requests.exceptions.ConnectionError("refused"))
    body = _client().get("/api/anki/status").json()
    assert body["connected"] is False
    assert body["reason"] == "gateway_unreachable"


def test_status_reports_server_anki_down(monkeypatch):
    _use(monkeypatch, FakeResponse(200, {"anki_connected": False}))
    body = _client().get("/api/anki/status").json()
    assert body == {"connected": False, "reason": "anki_down"}


def test_status_ok(monkeypatch):
    _use(monkeypatch, FakeResponse(200, {"anki_connected": True}))
    assert _client().get("/api/anki/status").json() == {"connected": True, "reason": "ok"}


def test_no_route_opens_the_mac_anki_app():
    # Opening the Mac's Anki would create a second client editing the same
    # AnkiWeb collection as the server.
    assert _client().post("/api/anki/launch").status_code in (404, 405)
    for path in (ROOT / "backend").rglob("*.py"):
        assert '"open", "-a", "Anki"' not in path.read_text(), path
    assert "launchAnki" not in (ROOT / "frontend/js/api.js").read_text()
    assert "launchAnki" not in (ROOT / "frontend/js/app.js").read_text()
