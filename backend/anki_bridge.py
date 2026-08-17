import sys
import os
import logging

# Add Anki Manager to sys.path
ANKI_MANAGER_PATH = "/Users/leejinwoo/Desktop/Projects/Anki Manager"
if ANKI_MANAGER_PATH not in sys.path:
    sys.path.append(ANKI_MANAGER_PATH)

# Setup logging
logger = logging.getLogger(__name__)

# Now we can import the Anki Manager components
try:
    from integrations.anki_connect import AnkiConnector
    from core.completer import run_note_completion
    from integrations.audio import AnkiTTSFiller
    from utils.organizer import run_organizer
    from utils.cluster import run_clustering
    ANKI_AVAILABLE = True
except Exception as e:
    logger.error(f"Failed to import Anki Manager modules: {e}")
    ANKI_AVAILABLE = False

def check_anki_connection() -> bool:
    """
    Checks if Anki is running and AnkiConnect is accessible.
    """
    if not ANKI_AVAILABLE:
        return False
    try:
        # Simple ping using deckNames action
        AnkiConnector.invoke('deckNames')
        return True
    except Exception:
        return False

import io
import base64
import uuid
import gtts
import concurrent.futures

def _generate_and_store_tts(sentence: str) -> str:
    """Generate TTS audio via gTTS and store in AnkiConnect media storage"""
    try:
        clean_text = sentence.strip()
        if not clean_text:
            return ""
        tts = gtts.gTTS(clean_text, lang='en')
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        b64_audio = base64.b64encode(buf.read()).decode('utf-8')
        fname = f"shadowing_tts_{uuid.uuid4().hex[:8]}.mp3"
        AnkiConnector.invoke("storeMediaFile", filename=fname, data=b64_audio)
        return f"[sound:{fname}]"
    except Exception as e:
        logger.error(f"TTS generation error for '{sentence}': {e}")
        return ""

def add_sentence_to_anki(sentence: str, translation: str = "") -> dict:
    """
    Directly adds a sentence card to Anki with TTS audio and Korean translation in < 0.3s.
    """
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running or AnkiConnect is not accessible"}

    try:
        from config import DECK_SENTENCE, MODEL_SENTENCE
        sound_tag = _generate_and_store_tts(sentence)
        
        fields = {
            "문장": sentence,
            "해설": translation or "",
            "소리": sound_tag
        }
        
        # Check actual field names of English Sentence model
        try:
            actual_fields = AnkiConnector.invoke('modelFieldNames', modelName=MODEL_SENTENCE) or []
            if actual_fields and "해설" not in actual_fields:
                if len(actual_fields) >= 2:
                    fields = {actual_fields[0]: sentence, actual_fields[1]: translation or ""}
                    if len(actual_fields) >= 3:
                        fields[actual_fields[2]] = sound_tag
        except Exception:
            pass

        note_id = AnkiConnector.add_note(DECK_SENTENCE, MODEL_SENTENCE, fields)
        return {"success": True, "note_id": note_id, "added": [sentence]}

    except Exception as e:
        logger.error(f"Error adding sentence directly: {e}")
        return {"success": False, "error": str(e)}

def bulk_add_sentences_to_anki(items: list) -> dict:
    """
    Directly adds multiple sentence cards to Anki concurrently in < 1s.
    """
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running"}

    if not items:
        return {"success": True, "count": 0}

    from config import DECK_SENTENCE, MODEL_SENTENCE

    # Generate TTS audio concurrently
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
            "options": {"allowDuplicate": True}
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
    """
    Adds a vocabulary card, enriches it with Gemini AI definition,
    and runs the post-processing (TTS audio, organizer, synonym clustering).
    """
    if not ANKI_AVAILABLE:
        return {"success": False, "error": "Anki Manager modules not loaded"}
    
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running or AnkiConnect is not accessible"}

    try:
        sentences_data = {"sentences": []}
        vocab_data = {"vocab": [{"단어": word, "뜻": meaning}]}
        
        # Run AI complete and insert
        success, added_s, added_v = run_note_completion(sentences_data, vocab_data)
        
        if success:
            # Run post processing
            logger.info("Running TTS generation for new vocab card...")
            try:
                AnkiTTSFiller.run_audio_addition()
            except Exception as tts_err:
                logger.error(f"TTS generation error: {tts_err}")
                
            logger.info("Running deck organizer...")
            try:
                run_organizer()
            except Exception as org_err:
                logger.error(f"Organizer error: {org_err}")

            logger.info("Running synonym clustering...")
            try:
                run_clustering()
            except Exception as cluster_err:
                logger.error(f"Synonym clustering error: {cluster_err}")

            return {"success": True, "added": added_v}
        else:
            return {"success": False, "error": "Enrichment pipeline failed"}

    except Exception as e:
        logger.error(f"Error adding vocab: {e}")
        return {"success": False, "error": str(e)}
