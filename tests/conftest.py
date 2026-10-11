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


@pytest.fixture(autouse=True)
def block_anki_network(monkeypatch, tmp_path):
    from backend import anki_bridge
    from backend.anki_core import connector

    monkeypatch.setattr(anki_bridge, "_SESSION", _BlockedSession())

    def _blocked_invoke(action, **params):
        raise AssertionError(f"Unmocked direct AnkiConnect call: {action}")

    monkeypatch.setattr(connector.AnkiConnector, "invoke", staticmethod(_blocked_invoke))

    # 사전 캐시는 사용자의 실제 캐시 DB 대신 임시 파일을 쓴다
    from backend.routers import dict as dict_router
    db_path = tmp_path / "dict_cache.db"
    monkeypatch.setattr(dict_router, "DICT_CACHE_DB_PATH", db_path)
    dict_router.init_db()
