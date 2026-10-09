"""Anki bridge module for Shadowing Player.

Routes all card creation and synchronization requests to the Central Anki Manager Gateway
(http://127.0.0.1:8001/api/cards), ensuring a Single Source of Truth for:
- Card model & deck rules (English Vocabulary & English Sentence)
- TTS audio generation (Chirp3-HD / gTTS)
- Zero-synonym rule enforcement
- Automated 어휘 ↔ 문장 상호 연결 (links.db) indexing
"""
import os
import logging
from typing import List, Dict, Any, Optional
import requests

logger = logging.getLogger("ShadowingAnkiBridge")

ANKI_MANAGER_URL = os.getenv("ANKI_MANAGER_URL", "http://127.0.0.1:8001").rstrip("/")
_TIMEOUT_SEC = 60

# 로컬 통신이므로 프록시 환경변수(http_proxy 등) 우회
_SESSION = requests.Session()
_SESSION.trust_env = False


def check_anki_connection() -> bool:
    """Checks if Anki Manager Gateway is reachable and AnkiConnect is active."""
    try:
        url = f"{ANKI_MANAGER_URL}/api/cards/status"
        res = _SESSION.get(url, timeout=5)
        if res.status_code == 200:
            return bool(res.json().get("anki_connected", False))
        return False
    except Exception as e:
        logger.warning(f"Anki Manager Gateway connection check failed: {e}")
        return False


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
        res = _SESSION.post(url, json=payload, timeout=_TIMEOUT_SEC)
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
        return {
            "success": False,
            "error": "Anki Manager 서버(http://127.0.0.1:8001)에 연결할 수 없습니다. Anki Manager를 실행해주세요."
        }
    except Exception as e:
        logger.error(f"Error in add_sentence_to_anki gateway call: {e}")
        return {"success": False, "error": str(e)}


def bulk_add_sentences_to_anki(items: list) -> dict:
    """Delegates bulk sentence creation to Anki Manager Gateway."""
    if not items:
        return {"success": True, "count": 0}

    url = f"{ANKI_MANAGER_URL}/api/cards/sentence/bulk"
    formatted_items = [
        {"sentence": item.get("sentence", "").strip(), "translation": item.get("translation", "").strip()}
        for item in items
        if item.get("sentence", "").strip()
    ]

    payload = {
        "items": formatted_items,
        "auto_enrich": True,
        "generate_audio": True
    }

    try:
        res = _SESSION.post(url, json=payload, timeout=_TIMEOUT_SEC * 2)
        data = res.json()
        if res.status_code == 200:
            return {
                "success": True,
                "count": data.get("count", 0),
                "total": data.get("total", len(items))
            }
        return {"success": False, "error": data.get("detail", "Failed to bulk add sentences")}
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "error": "Anki Manager 서버(http://127.0.0.1:8001)에 연결할 수 없습니다. Anki Manager를 실행해주세요."
        }
    except Exception as e:
        logger.error(f"Error in bulk_add_sentences_to_anki gateway call: {e}")
        return {"success": False, "error": str(e)}


def add_vocab_to_anki(word: str, meaning: str = "") -> dict:
    """Delegates single vocabulary creation to Anki Manager Gateway."""
    clean_word = word.strip()
    if not clean_word:
        return {"success": False, "error": "단어가 비어있습니다."}

    url = f"{ANKI_MANAGER_URL}/api/cards/vocab"
    payload = {
        "word": clean_word,
        "meaning": meaning or "",
        "auto_enrich": True,
        "generate_audio": True
    }

    try:
        res = _SESSION.post(url, json=payload, timeout=_TIMEOUT_SEC)
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
                "note_id": data.get("note_id")
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
        return {
            "success": False,
            "error": "Anki Manager 서버(http://127.0.0.1:8001)에 연결할 수 없습니다. Anki Manager를 실행해주세요."
        }
    except Exception as e:
        logger.error(f"Error in add_vocab_to_anki gateway call: {e}")
        return {"success": False, "error": str(e)}


def bulk_add_vocab_to_anki(items: list) -> dict:
    """Delegates bulk vocabulary creation to Anki Manager Gateway."""
    if not items:
        return {"success": True, "count": 0}

    url = f"{ANKI_MANAGER_URL}/api/cards/vocab/bulk"
    formatted_items = []
    for item in items:
        w = item.get("word") or item.get("단어") or ""
        if not w.strip():
            continue
        formatted_items.append({
            "word": w.strip(),
            "meaning": item.get("meaning") or item.get("뜻") or "",
            "pos": item.get("pos") or item.get("품사") or "",
            "synonyms": "", # Forced empty
            "example": item.get("example") or item.get("예문") or "",
            "explanation": item.get("explanation") or item.get("설명") or ""
        })

    payload = {
        "items": formatted_items,
        "auto_enrich": False,
        "generate_audio": True
    }

    try:
        res = _SESSION.post(url, json=payload, timeout=_TIMEOUT_SEC * 2)
        data = res.json()
        if res.status_code == 200:
            return {
                "success": True,
                "count": data.get("count", 0),
                "total": data.get("total", len(items))
            }
        return {"success": False, "error": data.get("detail", "Failed to bulk add vocab cards")}
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "error": "Anki Manager 서버(http://127.0.0.1:8001)에 연결할 수 없습니다. Anki Manager를 실행해주세요."
        }
    except Exception as e:
        logger.error(f"Error in bulk_add_vocab_to_anki gateway call: {e}")
        return {"success": False, "error": str(e)}
