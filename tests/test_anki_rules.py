"""Shadowing Player must follow Anki Manager's current card rules.

Anki Manager rules (Anki Manager/config.py NOTE_COMPLETOR_SYS_INSTRUCT,
backend/services/card_service.py):
- Vocabulary cards go through the Anki Manager gateway (/api/cards/vocab),
  which normalizes placeholders, clears 유의어, queues audio and indexes links.
- 유의어 is always empty (zero-synonym rule).
- 설명 is 2 steps: ① meaning/nuance ② collocations. No synonym comparison.
- 품사 is one of n, v, adj, adv, idiom.
- 뜻 uses commas, never slashes.
"""
import csv
import io
import json

import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient

from backend import anki_bridge
from backend.routers import anki as anki_router
from backend.routers import dict as dict_router
from backend.routers import export as export_router


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class RecordingSession:
    trust_env = False

    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, json=None, timeout=None):
        self.calls.append((url, json))
        return self.response

    def get(self, url, timeout=None):
        raise AssertionError("unexpected GET")


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(dict_router.router)
    app.include_router(anki_router.router)
    return TestClient(app)


VOCAB_PAYLOAD = {
    "word": "spring something on someone",
    "meaning": "갑자기 꺼내다",
    "pos": "idiom",
    "synonyms": "surprise, ambush",
    "example": "She sprang the news on me.",
    "explanation": "① ... ② ...",
}


# --- 단어 카드 전송 경로 ---

def test_dict_add_to_anki_goes_through_gateway_without_synonyms(client, monkeypatch):
    session = RecordingSession(FakeResponse(200, {"success": True, "note_id": 123, "duplicate": False}))
    monkeypatch.setattr(anki_bridge, "_SESSION", session)

    res = client.post("/api/dict/add-to-anki", json=VOCAB_PAYLOAD)

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["note_id"] == 123
    assert len(session.calls) == 1
    url, sent = session.calls[0]
    assert url.endswith("/api/cards/vocab")
    assert sent["word"] == "spring something on someone"
    assert sent["meaning"] == "갑자기 꺼내다"
    assert sent["pos"] == "idiom"
    assert sent["example"] == "She sprang the news on me."
    assert sent["explanation"] == "① ... ② ..."
    assert not sent.get("synonyms")


def test_dict_add_to_anki_reports_duplicate(client, monkeypatch):
    session = RecordingSession(FakeResponse(200, {
        "success": True, "duplicate": True, "error": "이미 Anki에 등록된 단어/표현입니다 (중복 방지)",
    }))
    monkeypatch.setattr(anki_bridge, "_SESSION", session)

    body = client.post("/api/dict/add-to-anki", json=VOCAB_PAYLOAD).json()

    assert body["success"] is False
    assert body["duplicate"] is True


def test_dict_add_to_anki_reports_gateway_down(client, monkeypatch):
    import requests

    class DownSession(RecordingSession):
        def post(self, url, json=None, timeout=None):
            raise requests.exceptions.ConnectionError("refused")

    monkeypatch.setattr(anki_bridge, "_SESSION", DownSession(None))

    body = client.post("/api/dict/add-to-anki", json=VOCAB_PAYLOAD).json()

    assert body["success"] is False
    assert "Anki Manager" in body["error"]


def test_no_direct_ankiconnect_code_left():
    # 카드는 Anki Manager 게이트웨이로만 만든다
    import importlib.util
    assert importlib.util.find_spec("backend.anki_core.connector") is None


# --- 사전 조회 프롬프트 ---

class FakeGenai:
    """Stands in for genai.Client; records the prompt and returns a canned answer."""
    last_prompt = None
    answer = {}

    def __init__(self, api_key=None):
        self.models = self

    def generate_content(self, model, contents, config=None):
        FakeGenai.last_prompt = contents if isinstance(contents, str) else "\n".join(map(str, contents))

        class R:
            text = json.dumps(FakeGenai.answer, ensure_ascii=False)
        return R()


@pytest.fixture
def fake_genai(monkeypatch):
    FakeGenai.last_prompt = None
    FakeGenai.answer = {
        "word": "sprint", "lemma": "sprint", "phonetic": "/sprɪnt/", "pos": "v",
        "meaning": "전력 질주하다", "explanation": "① ... ② ...",
        "synonyms": ["dash", "race"], "example": "He sprinted to the bus.",
        "related_phrase": None,
    }
    monkeypatch.setattr(dict_router.genai, "Client", FakeGenai)
    monkeypatch.setattr(dict_router, "get_google_api_key", lambda: "test-key")
    return FakeGenai


def test_lookup_prompt_follows_two_step_zero_synonym_rule(client, fake_genai):
    client.post("/api/dict/lookup", json={"word": "sprint", "context": "He sprinted."})
    prompt = fake_genai.last_prompt

    assert prompt is not None
    assert "유의어 비교" not in prompt
    assert "synonyms" not in prompt
    assert "2단계" in prompt
    assert "콜로케이션" in prompt
    assert "prep" not in prompt and "conj" not in prompt
    assert "슬래시" in prompt


def test_lookup_response_has_no_synonyms(client, fake_genai):
    body = client.post("/api/dict/lookup", json={"word": "sprint", "context": ""}).json()

    assert "synonyms" not in body
    assert body["meaning"] == "전력 질주하다"


def test_lookup_ignores_cache_entries_written_under_old_rules(client, fake_genai):
    # 옛 룰(유의어, 3단계 설명)로 캐시된 항목은 다시 쓰지 않는다
    dict_router.set_cached_word("sprint", {
        "word": "sprint", "meaning": "옛 뜻", "synonyms": ["dash"],
        "explanation": "① ... ② 유의어 비교 ... ③ ...",
    })

    body = client.post("/api/dict/lookup", json={"word": "sprint", "context": ""}).json()

    assert fake_genai.last_prompt is not None
    assert body["meaning"] == "전력 질주하다"


# --- anki_core 프롬프트 (APKG 내보내기 보강에 사용) ---

def test_anki_core_prompts_match_anki_manager_rules():
    from backend.anki_core import config, completer
    import inspect

    sys_instruct = config.NOTE_COMPLETOR_SYS_INSTRUCT
    assert "유의어" not in sys_instruct
    assert "2단계" in sys_instruct
    assert "슬래시" in sys_instruct
    assert "jargon" not in sys_instruct

    enrich_src = inspect.getsource(completer.NoteCompleter.enrich_vocab)
    assert "유의어" not in enrich_src


# --- 파일 내보내기 ---

def test_csv_export_leaves_synonyms_empty():
    req = export_router.ExportRequest(items=[export_router.ExportItem(
        word="sprint", meaning="전력 질주하다", synonyms="dash, race", item_type="vocab",
    )])

    res = export_router.export_csv(req)

    rows = list(csv.reader(io.StringIO(res.body.decode("utf-8-sig"))))
    header, row = rows[0], rows[1]
    if "Synonyms" in header:
        assert row[header.index("Synonyms")] == ""
    assert "dash" not in ",".join(row)


def test_apkg_export_leaves_synonyms_empty(monkeypatch):
    added = []
    monkeypatch.setattr(export_router, "_generate_vocab_audio", lambda w, d: ("", ""))
    monkeypatch.setattr(export_router.genanki.Deck, "add_note", lambda self, note: added.append(note))
    monkeypatch.setattr(export_router.genanki.Package, "write_to_file",
                        lambda self, path: open(path, "wb").close())

    req = export_router.ExportRequest(items=[export_router.ExportItem(
        word="sprint", meaning="전력 질주하다", synonyms="dash, race", item_type="vocab",
    )])
    export_router.export_apkg(req, BackgroundTasks())

    assert len(added) == 1
    fields = dict(zip([f["name"] for f in added[0].model.fields], added[0].fields))
    assert fields["Synonyms"] == ""
