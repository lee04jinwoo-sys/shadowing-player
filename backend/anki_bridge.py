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

def add_sentence_to_anki(sentence: str) -> dict:
    """
    Adds a sentence card, enriches it with Gemini AI translation,
    and runs the post-processing (TTS audio, organizer).
    """
    if not ANKI_AVAILABLE:
        return {"success": False, "error": "Anki Manager modules not loaded"}
    
    if not check_anki_connection():
        return {"success": False, "error": "Anki desktop app is not running or AnkiConnect is not accessible"}

    try:
        sentences_data = {"sentences": [sentence]}
        vocab_data = {"vocab": []}
        
        success, added_s, added_v = run_note_completion(sentences_data, vocab_data)
        
        if not added_s:
            logger.warning("AI note completion returned 0 items. Adding card directly via AnkiConnect fallback...")
            try:
                from config import DECK_SENTENCE, MODEL_SENTENCE
                AnkiConnector.add_note(DECK_SENTENCE, MODEL_SENTENCE, {"문장": sentence, "해석": ""})
                added_s = [sentence]
            except Exception as direct_err:
                logger.error(f"Direct AnkiConnect fallback failed: {direct_err}")
                return {"success": False, "error": f"Failed to add card to Anki: {direct_err}"}

        # Run post processing: TTS and organizer
        logger.info("Running TTS generation for new sentence card...")
        try:
            AnkiTTSFiller.run_audio_addition()
        except Exception as tts_err:
            logger.error(f"TTS generation error: {tts_err}")
            
        logger.info("Running deck organizer...")
        try:
            run_organizer()
        except Exception as org_err:
            logger.error(f"Organizer error: {org_err}")

        return {"success": True, "added": added_s}

    except Exception as e:
        logger.error(f"Error adding sentence: {e}")
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
