"""Anki bridge module for Shadowing Player.

Provides high-level functions for adding sentences and vocabulary to Anki,
with AI translation enrichment and TTS audio generation.
"""
import io
import base64
import uuid
import logging
import concurrent.futures

import gtts

from backend.anki_core import (
    AnkiConnector,
    AnkiTTSFiller,
    NoteCompleter,
    DECK_SENTENCE,
    MODEL_SENTENCE,
)

logger = logging.getLogger(__name__)

# Initialize GCP TTS Client (optional - falls back to gTTS if unavailable)
_tts_client = None
try:
    from google.cloud import texttospeech
    _tts_client = texttospeech.TextToSpeechClient()
except Exception as e:
    logger.warning(f"GCP TTS Client init warning: {e}")


def check_anki_connection() -> bool:
    """Checks if Anki is running and AnkiConnect is accessible."""
    try:
        AnkiConnector.invoke('deckNames')
        return True
    except Exception:
        return False


def _generate_and_store_tts(sentence: str) -> str:
    """Generate high quality Chirp3-HD TTS audio via GCP or fallback to gTTS, and store in AnkiConnect."""
    clean_text = sentence.strip()
    if not clean_text:
        return ""

    # 1. Try GCP Chirp3-HD / Studio voices
    global _tts_client
    if _tts_client is not None:
        try:
            sound_tag, voice_name = AnkiTTSFiller.generate_random_tts(_tts_client, clean_text)
            if sound_tag:
                return sound_tag
        except Exception as gcp_err:
            logger.error(f"GCP TTS failed, falling back to gTTS: {gcp_err}")

    # 2. Fallback to gTTS
    try:
        tts = gtts.gTTS(clean_text, lang='en')
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        b64_audio = base64.b64encode(buf.read()).decode('utf-8')
        fname = f"shadowing_gtts_{uuid.uuid4().hex[:8]}.mp3"
        AnkiConnector.invoke("storeMediaFile", filename=fname, data=b64_audio)
        return f"[sound:{fname}]"
    except Exception as e:
        logger.error(f"gTTS fallback error for '{sentence}': {e}")
        return ""


def _ensure_translations(items: list) -> list:
    """If any items are missing translation, enrich with Gemini AI."""
    missing_indices = [i for i, item in enumerate(items) if not item.get("translation")]
    if not missing_indices:
        return items

    try:
        completer = NoteCompleter()
        to_enrich = [{"문장": items[i]["sentence"]} for i in missing_indices]
        enriched = completer.enrich_sentences(to_enrich)
        if enriched and len(enriched) == len(missing_indices):
            for orig_idx, enr in zip(missing_indices, enriched):
                if isinstance(enr, dict) and "해설" in enr:
                    items[orig_idx]["translation"] = enr["해설"]
    except Exception as e:
        logger.error(f"Translation enrichment error: {e}")

    return items


def add_sentence_to_anki(sentence: str, translation: str = "") -> dict:
    """Directly adds a sentence card to Anki with Chirp3-HD TTS audio and Korean translation."""
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running or AnkiConnect is not accessible"}

    try:
        # If translation is missing, enrich with Gemini
        if not translation:
            try:
                completer = NoteCompleter()
                res = completer.enrich_sentences([{"문장": sentence}])
                if res and isinstance(res[0], dict) and "해설" in res[0]:
                    translation = res[0]["해설"]
            except Exception as e:
                logger.warning(f"AI translation fallback error: {e}")

        sound_tag = _generate_and_store_tts(sentence)
        
        fields = {
            "문장": sentence,
            "해설": translation or "",
            "소리": sound_tag
        }
        
        # Adapt to exact model field names
        try:
            actual_fields = AnkiConnector.invoke('modelFieldNames', modelName=MODEL_SENTENCE) or []
            if actual_fields and "해설" not in actual_fields:
                if len(actual_fields) >= 2:
                    fields = {actual_fields[0]: sentence, actual_fields[1]: translation or ""}
                    if len(actual_fields) >= 3:
                        fields[actual_fields[2]] = sound_tag
        except Exception:
            pass

        note_id = AnkiConnector.add_note(
            deck_name=DECK_SENTENCE,
            model_name=MODEL_SENTENCE,
            fields=fields,
        )
        return {"success": True, "note_id": note_id, "added": [sentence], "translation": translation}

    except Exception as e:
        logger.error(f"Error adding sentence directly: {e}")
        return {"success": False, "error": str(e)}


def bulk_add_sentences_to_anki(items: list) -> dict:
    """Directly adds multiple sentence cards to Anki concurrently with Chirp3-HD TTS & Korean translation."""
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running"}

    if not items:
        return {"success": True, "count": 0}

    # Ensure all items have translations
    items = _ensure_translations(items)

    # Generate Chirp3-HD audio concurrently
    def process_item(item):
        s = item.get("sentence", "").strip()
        t = item.get("translation", "").strip()
        if not s:
            return None
        sound_tag = _generate_and_store_tts(s)
        return {
            "deckName": DECK_SENTENCE,
            "modelName": MODEL_SENTENCE,
            "fields": {
                "문장": s,
                "해설": t,
                "소리": sound_tag
            },
            "options": {"allowDuplicate": False}
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        notes = list(filter(None, executor.map(process_item, items)))

    if not notes:
        return {"success": True, "count": 0}

    try:
        res = AnkiConnector.invoke("addNotes", notes=notes)
        success_count = sum(1 for x in (res or []) if x is not None)
        return {"success": True, "count": success_count, "total": len(items)}
    except Exception as e:
        logger.error(f"Bulk add notes error: {e}")
        return {"success": False, "error": str(e)}


def add_vocab_to_anki(word: str, meaning: str = "") -> dict:
    """Adds a single vocabulary card, enriches it if needed, and generates gTTS audio."""
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running or AnkiConnect is not accessible"}

    try:
        from backend.anki_core import DECK_VOCAB, MODEL_VOCAB
        from backend.anki_core.completer import normalize_vocab_placeholders

        norm_word = normalize_vocab_placeholders(word.strip())
        if not norm_word:
            return {"success": False, "error": "단어가 비어있습니다."}

        # Enrich with AI if meaning is missing
        completer = NoteCompleter()
        enriched = completer.enrich_vocab([{"단어": norm_word, "뜻": meaning}])

        v = enriched[0] if (enriched and len(enriched) > 0) else {"뜻": meaning}
        
        # Rule: English Vocabulary MUST use gTTS
        sound_tag = ""
        try:
            sound_tag, _ = AnkiTTSFiller.generate_gtts(norm_word)
        except Exception as tts_err:
            logger.warning(f"gTTS for vocab error: {tts_err}")

        from backend.routers.dict import clean_vocab_example
        clean_ex = clean_vocab_example(v.get("예문", ""))

        fields = {
            "단어": norm_word,
            "뜻": v.get("뜻", meaning),
            "품사": v.get("품사", ""),
            "유의어": v.get("유의어", ""),
            "예문": clean_ex,
            "설명": v.get("설명", ""),
            "소리": sound_tag,
        }
        note_id = AnkiConnector.add_note(
            deck_name=DECK_VOCAB,
            model_name=MODEL_VOCAB,
            fields=fields,
        )
        return {"success": True, "added": [norm_word], "note_id": note_id}

    except Exception as e:
        err_msg = str(e)
        if "duplicate" in err_msg.lower():
            return {"success": False, "error": "이미 Anki에 등록된 단어/표현입니다 (중복 방지)", "duplicate": True}
        logger.error(f"Error adding vocab: {e}")
        return {"success": False, "error": err_msg}


def bulk_add_vocab_to_anki(items: list) -> dict:
    """Adds multiple vocabulary cards to Anki concurrently with gTTS and allowDuplicate: False."""
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running"}

    if not items:
        return {"success": True, "count": 0}

    from backend.anki_core import DECK_VOCAB, MODEL_VOCAB
    from backend.anki_core.completer import normalize_vocab_placeholders
    from backend.routers.dict import clean_vocab_example

    def process_vocab_item(item: dict):
        raw_word = item.get("word", "") or item.get("단어", "")
        norm_word = normalize_vocab_placeholders(raw_word.strip())
        if not norm_word:
            return None

        meaning = item.get("meaning", "") or item.get("뜻", "")
        pos = item.get("pos", "") or item.get("품사", "")
        synonyms = item.get("synonyms", "") or item.get("유의어", "")
        example = clean_vocab_example(item.get("example", "") or item.get("예문", ""))
        explanation = item.get("explanation", "") or item.get("설명", "")

        # Generate gTTS audio (English Vocabulary rule)
        sound_tag = ""
        try:
            sound_tag, _ = AnkiTTSFiller.generate_gtts(norm_word)
        except Exception as tts_err:
            logger.warning(f"gTTS error for '{norm_word}': {tts_err}")

        return {
            "deckName": DECK_VOCAB,
            "modelName": MODEL_VOCAB,
            "fields": {
                "단어": norm_word,
                "뜻": meaning,
                "품사": pos,
                "유의어": synonyms,
                "예문": example,
                "설명": explanation,
                "소리": sound_tag,
            },
            "options": {"allowDuplicate": False}
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        notes = list(filter(None, executor.map(process_vocab_item, items)))

    if not notes:
        return {"success": True, "count": 0}

    try:
        res = AnkiConnector.invoke("addNotes", notes=notes)
        success_count = sum(1 for x in (res or []) if x is not None)
        return {"success": True, "count": success_count, "total": len(items)}
    except Exception as e:
        logger.error(f"Bulk add vocab error: {e}")
        return {"success": False, "error": str(e)}

