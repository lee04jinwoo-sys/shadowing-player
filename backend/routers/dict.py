import os
import json
import re
import io
import base64
import uuid
import logging
import sqlite3
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv('/Users/leejinwoo/Desktop/Projects/Anki Manager/.env')
load_dotenv()

# Add Anki Manager path
import sys
ANKI_MANAGER_PATH = "/Users/leejinwoo/Desktop/Projects/Anki Manager"
if ANKI_MANAGER_PATH not in sys.path:
    sys.path.append(ANKI_MANAGER_PATH)

try:
    from integrations.anki_connect import AnkiConnector
    from integrations.audio import AnkiTTSFiller
    from google.cloud import texttospeech
    _tts_client = texttospeech.TextToSpeechClient()
except Exception as e:
    _tts_client = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dict")

# Local SQLite Cache for sub-millisecond dictionary lookups
CACHE_DB_PATH = os.path.join("cache", "dict_cache.db")
os.makedirs("cache", exist_ok=True)

def init_db():
    conn = sqlite3.connect(CACHE_DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dict_cache (
            word_key TEXT PRIMARY KEY,
            data_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

def get_cached_word(word: str) -> Optional[dict]:
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM dict_cache WHERE word_key = ?", (word.lower().strip(),))
        row = cur.fetchone()
        conn.close()
        if row:
            return json.loads(row[0])
    except Exception as e:
        logger.warning(f"Cache read error: {e}")
    return None

def set_cached_word(word: str, data: dict):
    try:
        conn = sqlite3.connect(CACHE_DB_PATH)
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO dict_cache (word_key, data_json) VALUES (?, ?)", 
                    (word.lower().strip(), json.dumps(data, ensure_ascii=False)))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Cache write error: {e}")

class WordLookupRequest(BaseModel):
    word: str
    context: Optional[str] = ""

@router.api_route("/lookup", methods=["POST", "GET", "HEAD"])
def lookup_word(req: WordLookupRequest):
    raw_word = req.word.strip()
    cleaned_word = re.sub(r"^[^\w\s'-]+|[^\w\s'-]+$", "", raw_word).strip().lower()
    if not cleaned_word:
        raise HTTPException(status_code=400, detail="Invalid word or expression")

    cache_key = f"{cleaned_word}"
    cached = get_cached_word(cache_key)
    if cached:
        return cached

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")

    try:
        client = genai.Client(api_key=api_key)
        
        prompt = f"""
Analyze the English word or multi-word expression "{cleaned_word}" based on this dialogue context: "{req.context}".
Return a JSON object with these EXACT keys:
- "word": original word/phrase
- "lemma": base/dictionary form (e.g. "pull a fast one on A" or "run")
- "phonetic": IPA pronunciation (or "-" if it is a multi-word phrase)
- "pos": primary part of speech ("n", "v", "adj", "adv", "idiom", "prep", "conj")
- "meaning": clear Korean meaning tailored to context (e.g. "당황스러운, 쑥스러운" or "~를 속이다")
- "explanation": a concise 1-2 sentence Korean explanation of the nuance and practical usage.
- "synonyms": list of 2-4 English synonym words or expressions
- "example": a short, natural practical English example sentence with Korean translation in parentheses.
- "related_phrase": if this single word is part of a larger idiom or phrasal verb in the context dialogue, return {{"phrase": "...", "meaning": "..."}}, otherwise null.

Keep your response strictly valid JSON.
"""
        response = client.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2
            )
        )

        data = json.loads(response.text)
        set_cached_word(cache_key, data)
        return data

    except Exception as e:
        logger.error(f"Dictionary lookup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class VocabAddRequest(BaseModel):
    word: str
    meaning: str
    pos: Optional[str] = ""
    synonyms: Optional[str] = ""
    example: Optional[str] = ""
    explanation: Optional[str] = ""

@router.post("/add-to-anki")
def add_vocab_card(req: VocabAddRequest):
    global _tts_client
    sound_tag = ""
    if _tts_client:
        try:
            sound_tag, voice = AnkiTTSFiller.generate_random_tts(_tts_client, req.word)
        except Exception as tts_err:
            logger.warning(f"GCP TTS for vocab error: {tts_err}")

    fields = {
        "단어": req.word,
        "뜻": req.meaning,
        "품사": req.pos or "",
        "유의어": req.synonyms or "",
        "예문": req.example or "",
        "설명": req.explanation or "",
        "소리": sound_tag
    }

    try:
        note = {
            "deckName": "1. Language::1.1. English::Vocabulary",
            "modelName": "English Vocabulary",
            "fields": fields,
            "options": {"allowDuplicate": False}
        }
        note_id = AnkiConnector.invoke("addNote", note=note)
        return {"success": True, "note_id": note_id, "word": req.word}
    except Exception as e:
        err_msg = str(e)
        if "duplicate" in err_msg.lower():
            return {"success": False, "error": "이미 Anki에 등록된 단어입니다 (중복 방지)", "duplicate": True}
        return {"success": False, "error": err_msg}
