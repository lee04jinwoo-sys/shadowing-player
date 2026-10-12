"""Test safety: no test may reach the real Anki collection or the Anki Manager server.

AnkiConnect (localhost:8765) is the user's live collection. Every network path
used by the Anki code is replaced with a stub that fails loudly; tests that need
a response install their own fake on top.
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class _BlockedSession:
    trust_env = False

    def post(self, *args, **kwargs):
        raise AssertionError(f"Unmocked Anki Manager POST: {args}")

    def get(self, *args, **kwargs):
        raise AssertionError(f"Unmocked Anki Manager GET: {args}")

    def close(self):
        pass


@pytest.fixture(autouse=True)
def block_anki_network(monkeypatch, tmp_path):
    import requests
    from backend import anki_bridge

    monkeypatch.setattr(anki_bridge, "_new_session", _BlockedSession)

    # 직접 AnkiConnect(8765)로 나가는 요청도 막는다
    def _blocked_post(self, url, *args, **kwargs):
        raise AssertionError(f"Unmocked HTTP POST: {url}")

    monkeypatch.setattr(requests.Session, "post", _blocked_post)
    monkeypatch.setattr(requests, "post", lambda url, *a, **k: _blocked_post(None, url))

    # 사전 캐시는 사용자의 실제 캐시 DB 대신 임시 파일을 쓴다
    from backend.routers import dict as dict_router
    db_path = tmp_path / "dict_cache.db"
    monkeypatch.setattr(dict_router, "DICT_CACHE_DB_PATH", db_path)
    dict_router.init_db()
