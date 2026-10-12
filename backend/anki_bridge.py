"""Anki bridge module for Shadowing Player.

Routes all card creation and synchronization requests to the Central Anki Manager Gateway
(/api/cards), ensuring a Single Source of Truth for:
- Card model & deck rules (English Vocabulary & English Sentence)
- TTS audio generation (Chirp3-HD / gTTS)
- Zero-synonym rule enforcement
- Automated 어휘 ↔ 문장 상호 연결 (links.db) indexing

Anki Manager runs on the Oracle server (oracle-quant). The Mac reaches it through the
SSH tunnel in infra/anki_tunnel: localhost:8011 -> server 127.0.0.1:8001.
"""
import os
import logging
from typing import List, Dict, Any, Optional
import requests

logger = logging.getLogger("ShadowingAnkiBridge")

DEFAULT_ANKI_MANAGER_URL = "http://127.0.0.1:8011"
ANKI_MANAGER_URL = os.getenv("ANKI_MANAGER_URL", DEFAULT_ANKI_MANAGER_URL).rstrip("/")
_TIMEOUT_SEC = 60
_UNREACHABLE = (f"Anki Manager 서버({ANKI_MANAGER_URL})에 연결할 수 없습니다. "
                "오라클 서버로 가는 SSH 터널(infra/anki_tunnel)이 떠 있는지 확인해주세요.")


def _new_session() -> requests.Session:
    # 요청마다 새 연결: 공유 Session은 SSH 터널 너머에서 두 번에 한 번 RemoteDisconnected로 끊긴다.
    # 로컬 터널이므로 프록시 환경변수(http_proxy 등)는 우회한다.
    session = requests.Session()
    session.trust_env = False
    return session


def _request(method: str, url: str, **kwargs):
    session = _new_session()
    try:
        return getattr(session, method)(url, **kwargs)
    finally:
        session.close()


def gateway_status() -> dict:
    """{"connected": bool, "reason": "ok" | "gateway_unreachable" | "anki_down"}"""
    try:
        res = _request("get", f"{ANKI_MANAGER_URL}/api/cards/status", timeout=5)
    except Exception as e:
        logger.warning(f"Anki Manager Gateway connection check failed: {e}")
        return {"connected": False, "reason": "gateway_unreachable"}
    if res.status_code != 200:
        return {"connected": False, "reason": "gateway_unreachable"}
    if not res.json().get("anki_connected", False):
        return {"connected": False, "reason": "anki_down"}
    return {"connected": True, "reason": "ok"}


def add_sentence_to_anki(sentence: str, translation: str = "") -> dict:
    """Delegates single sentence creation to Anki Manager Gateway."""
    clean_sentence = sentence.strip()
    if not clean_sentence:
        return {"success": False, "error": "문장이 비어있습니다."}

    url = f"{ANKI_MANAGER_URL}/api/cards/sentence"
    payload = {
        "sentence": clean_sentence,
        "translation": translation or "",
        "auto_enrich": True,
        "generate_audio": True
    }

    try:
        res = _request("post", url, json=payload, timeout=_TIMEOUT_SEC)
        data = res.json()
        if res.status_code == 200:
            if data.get("duplicate"):
                return {
                    "success": True,
                    "duplicate": True,
                    "added": [clean_sentence],
                    "translation": translation or (data.get("data") or {}).get("translation", "")
                }
            return {
                "success": True,
                "note_id": data.get("note_id"),
                "added": [clean_sentence],
                "translation": (data.get("data") or {}).get("translation", translation)
            }
        error_detail = data.get("detail", "Failed to add sentence card")
        if "duplicate" in str(error_detail).lower():
            return {"success": True, "duplicate": True, "added": [clean_sentence], "translation": translation}
        return {"success": False, "error": error_detail}
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": _UNREACHABLE}
    except Exception as e:
        logger.error(f"Error in add_sentence_to_anki gateway call: {e}")
        return {"success": False, "error": str(e)}


def add_vocab_to_anki(word: str, meaning: str = "", pos: str = "",
                      example: str = "", explanation: str = "") -> dict:
    """Delegates single vocabulary creation to Anki Manager Gateway.

    유의어는 보내지 않는다 (Anki Manager의 유의어 금지 룰).
    """
    clean_word = word.strip()
    if not clean_word:
        return {"success": False, "error": "단어가 비어있습니다."}

    url = f"{ANKI_MANAGER_URL}/api/cards/vocab"
    payload = {
        "word": clean_word,
        "meaning": meaning or "",
        "pos": pos or "",
        "example": example or "",
        "explanation": explanation or "",
        "auto_enrich": True,
        "generate_audio": True
    }

    try:
        res = _request("post", url, json=payload, timeout=_TIMEOUT_SEC)
        data = res.json()
        if res.status_code == 200:
            if data.get("duplicate"):
                return {
                    "success": False,
                    "duplicate": True,
                    "error": data.get("error") or "이미 Anki에 등록된 단어/표현입니다 (중복 방지)"
                }
            return {
                "success": True,
                "added": [clean_word],
                "note_id": data.get("note_id"),
                "word": (data.get("data") or {}).get("word", clean_word)
            }
        error_detail = data.get("detail", "Failed to add vocab card")
        if "duplicate" in str(error_detail).lower():
            return {
                "success": False,
                "duplicate": True,
                "error": "이미 Anki에 등록된 단어/표현입니다 (중복 방지)"
            }
        return {"success": False, "error": error_detail}
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": _UNREACHABLE}
    except Exception as e:
        logger.error(f"Error in add_vocab_to_anki gateway call: {e}")
        return {"success": False, "error": str(e)}
