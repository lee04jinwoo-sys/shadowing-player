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
    from core.completer import NoteCompleter, normalize_vocab_placeholders
    from config import MODEL_VOCAB, DECK_VOCAB, NOTE_COMPLETOR_SYS_INSTRUCT
except Exception as e:
    logger.warning(f"Anki Manager module import error: {e}")
    NoteCompleter = None
    normalize_vocab_placeholders = lambda x: x

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

    # Apply Anki Manager placeholder normalization (e.g. someone/sth -> A, B, V-ing)
    if normalize_vocab_placeholders:
        cleaned_word = normalize_vocab_placeholders(cleaned_word)

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
당신은 Anki Manager의 전문 어휘 학습 자료 제작 강사입니다.
대화 문맥 "{req.context}" 속 영단어/숙어/표현 "{cleaned_word}"를 분석하여 JSON 객체를 반환하십시오.

[작성 규칙]:
1. "word": 원본 영단어 또는 숙어 (A, B, V, V-ing 등의 표준 플레이스홀더 사용)
2. "lemma": 기본 사전형
3. "phonetic": IPA 발음기호 (긴 숙어나 구문인 경우 "-")
4. "pos": 품사 ("n", "v", "adj", "adv", "idiom", "prep", "conj")
5. "meaning": 문맥에 맞는 자연스러운 한국어 뜻
6. "explanation": Anki Manager 3단계 공식 엄수 (3~4문장):
   - ① 의미/뉘앙스: "[단어]는 '[뜻]'이라는 의미로, [구체적 쓰임새]를 나타냅니다."
   - ② 유의어 비교: "[유의어]와 비슷하지만, [단어]는 [차이점]을 강조합니다."
   - ③ 콜로케이션: "자주 쓰이는 표현으로는 '[영어표현](한글뜻)' 등이 있습니다."
7. "synonyms": 2~4개의 영단어/유의어 리스트
8. "example": 해당 표현이 사용된 자연스러운 실용 영어 예문 (단어에 A, B가 있다면 예문에서는 실제 단어로 대체할 것) + 괄호 안 한국어 번역
9. "related_phrase": 단어가 문맥 속 더 큰 숙어/구동사에 포함되어 있다면 {{"phrase": "...", "meaning": "..."}}, 그렇지 않다면 null.

반드시 유효한 JSON 형식으로만 응답하십시오.
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
    # 1. Normalize placeholders like someone/something -> A, B, V-ing
    norm_word = normalize_vocab_placeholders(req.word.strip()) if normalize_vocab_placeholders else req.word.strip()

    # 2. English Vocabulary audio rule: generate gTTS audio via AnkiTTSFiller.generate_gtts
    sound_tag = ""
    try:
        sound_tag, method = AnkiTTSFiller.generate_gtts(norm_word)
    except Exception as tts_err:
        logger.warning(f"gTTS for English Vocabulary error: {tts_err}")

    # 3. Populate all English Vocabulary fields adhering to Anki Manager standards
    fields = {
        "단어": norm_word,
        "뜻": req.meaning,
        "품사": req.pos or "",
        "유의어": req.synonyms or "",
        "예문": req.example or "",
        "설명": req.explanation or "",
        "소리": sound_tag
    }

    # 4. Invoke AnkiConnect
    try:
        note = {
            "deckName": "1. Language::1.1. English::Vocabulary",
            "modelName": "English Vocabulary",
            "fields": fields,
            "options": {"allowDuplicate": False}
        }
        note_id = AnkiConnector.invoke("addNote", note=note)
        return {"success": True, "note_id": note_id, "word": norm_word, "sound": sound_tag}
    except Exception as e:
        err_msg = str(e)
        if "duplicate" in err_msg.lower():
            return {"success": False, "error": "이미 Anki에 등록된 단어/표현입니다 (중복 방지)", "duplicate": True}
        return {"success": False, "error": err_msg}
