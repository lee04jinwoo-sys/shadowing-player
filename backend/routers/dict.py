import json
import logging
import os
import re
import sqlite3
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types

from backend.anki_bridge import add_vocab_to_anki
from backend.anki_core import normalize_vocab_placeholders
from backend.app_dirs import DICT_CACHE_DB_PATH, ensure_directories, get_google_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dict")

# Local SQLite Cache for sub-millisecond dictionary lookups
ensure_directories()

# 조회 결과 형식(카드 룰)이 바뀌면 올린다. 옛 룰로 캐시된 항목은 다시 조회한다.
# v2 (2026-10-11): Anki Manager 룰 반영 — 유의어 없음, 설명 2단계, 품사 n/v/adj/adv/idiom
DICT_CACHE_VERSION = "v2"


def init_db() -> None:
    conn = sqlite3.connect(str(DICT_CACHE_DB_PATH))
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
        conn = sqlite3.connect(str(DICT_CACHE_DB_PATH))
        cur = conn.cursor()
        cur.execute("SELECT data_json FROM dict_cache WHERE word_key = ?", (word.lower().strip(),))
        row = cur.fetchone()
        conn.close()
        if row:
            return json.loads(row[0])
    except Exception as e:
        logger.warning(f"Cache read error: {e}")
    return None


def set_cached_word(word: str, data: dict) -> None:
    try:
        conn = sqlite3.connect(str(DICT_CACHE_DB_PATH))
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO dict_cache (word_key, data_json) VALUES (?, ?)", 
                    (word.lower().strip(), json.dumps(data, ensure_ascii=False)))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Cache write error: {e}")


def clean_vocab_example(example: str) -> str:
    """Removes any Korean translations or bracketed Korean notes from English example sentences."""
    if not example:
        return ""
    # Remove (한글...), [한글...]
    cleaned = re.sub(r"\s*[\(\[][^()\[\]]*[가-힣]+[^()\[\]]*[\)\]]", "", example)
    # Remove - 한글... or : 한글... at end
    cleaned = re.sub(r"\s*[-:]\s*[가-힣\s,.~!?]+$", "", cleaned)
    return cleaned.strip()


class WordLookupRequest(BaseModel):
    word: str
    context: Optional[str] = ""

@router.api_route("/lookup", methods=["POST", "GET", "HEAD"])
def lookup_word(req: WordLookupRequest):
    raw_word = req.word.strip()
    cleaned_word = re.sub(r"^[^\w\s'-]+|[^\w\s'-]+$", "", raw_word).strip().lower()
    if not cleaned_word:
        raise HTTPException(status_code=400, detail="Invalid word or expression")

    # Apply placeholder normalization (e.g. someone/sth -> A, B, V-ing)
    cleaned_word = normalize_vocab_placeholders(cleaned_word)

    cache_key = f"{DICT_CACHE_VERSION}:{cleaned_word}"
    cached = get_cached_word(cache_key)
    if cached:
        cached.pop("synonyms", None)
        if "example" in cached and cached["example"]:
            cached["example"] = clean_vocab_example(cached["example"])
        return cached

    api_key = get_google_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")

    try:
        client = genai.Client(api_key=api_key)
        
        prompt = f"""
당신은 Anki Manager의 전문 어휘 학습 자료 제작 강사입니다.
대화 문맥 "{req.context}" 속 영단어/숙어/표현 "{cleaned_word}"를 분석하여 JSON 객체를 반환하십시오.

[작성 규칙] (Anki Manager 카드 작성 규칙과 동일):
1. "word": 원본 영단어 또는 숙어. 대상 플레이스홀더(누가/무엇을)는 sb/sth/someone/something 대신 대문자 'A, B, C' 및 'V-ing' 사용 (예: spring A on B, prevent A from V-ing)
2. "lemma": 기본 사전형
3. "phonetic": IPA 발음기호 (긴 숙어나 구문인 경우 "-")
4. "pos": n, v, adj, adv, idiom 중 하나 (복합 품사는 콤마 구분, 예: 'n, v'). 'v phr', 'n phr', 'collocation', 'phrase' 등 비표준 태그 절대 사용 금지 (숙어/구/연어는 무조건 'idiom')
5. "meaning": 문맥에 맞는 정확한 한국어 뜻 (슬래시(/) 절대 사용 금지, 반드시 쉼표(,)와 공백으로 구분. 예: '비판하다, 비난하다')
6. "explanation" (2단계 필수):
   - ① "[단어]는 '[뜻]'이라는 의미로, [뉘앙스/구체적 쓰임새]를 나타냅니다."
   - ② "자주 쓰이는 표현으로는 '[표현](한글뜻)' 등이 있습니다." (콜로케이션)
   - 다른 단어와 비교하는 내용은 넣지 마십시오.
7. "example": 해당 표현이 사용된 자연스러운 실생활 영어 예문 (단어에 A, B가 있다면 예문에서는 실제 단어로 대체할 것. 괄호나 한국어 번역은 절대 넣지 말고 100% 순수 영어 문장으로만 작성할 것)
8. "related_phrase": 단어가 문맥 속 더 큰 숙어/구동사에 포함되어 있다면 {{"phrase": "...", "meaning": "..."}}, 그렇지 않다면 null.

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
        data.pop("synonyms", None)
        if "example" in data and data["example"]:
            data["example"] = clean_vocab_example(data["example"])
        set_cached_word(cache_key, data)
        return data

    except Exception as e:
        logger.error(f"Dictionary lookup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class VocabAddRequest(BaseModel):
    word: str
    meaning: str
    pos: Optional[str] = ""
    synonyms: Optional[str] = ""  # 예전 클라이언트 호환용. 보내지 않는다 (유의어 금지 룰)
    example: Optional[str] = ""
    explanation: Optional[str] = ""

@router.post("/add-to-anki")
def add_vocab_card(req: VocabAddRequest):
    """단어 카드를 Anki Manager 게이트웨이로 보낸다.

    플레이스홀더 정규화, 유의어 비우기, 오디오, 링크 인덱싱은 Anki Manager가 맡는다.
    """
    return add_vocab_to_anki(
        req.word,
        req.meaning,
        pos=req.pos or "",
        example=clean_vocab_example(req.example or ""),
        explanation=req.explanation or "",
    )
