"""Anki Core configuration constants.

All Anki deck names, model names, TTS settings, and AI prompt configurations.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- AnkiConnect URL ---
ANKI_URL: str = os.getenv("ANKI_URL", "http://localhost:8765")

# --- Deck and Model name definitions ---
DECK_SENTENCE: str = "1. Language::1.1. English::Sentence"
MODEL_SENTENCE: str = "English Sentence"
DECK_VOCAB: str = "1. Language::1.1. English::Vocabulary"
MODEL_VOCAB: str = "English Vocabulary"

# --- AI model settings ---
NOTE_COMPLETOR_MODEL: str = os.getenv("NOTE_COMPLETOR_MODEL", "gemini-flash-lite-latest")
GEMINI_DEFAULT_TEMPERATURE: float = 0.3
NOTE_COMPLETOR_MAX_WORKERS: int = 2

# --- TTS voice and language settings ---
TTS_SENTENCE_LANGUAGE_CODE: str = "en-US"
TTS_VOCAB_LANGUAGE: str = "en"
TTS_VOCAB_TLD: str = "com"

VOICE_LIST: list[str] = [
    "en-US-Chirp3-HD-Vindemiatrix",
    "en-US-Chirp3-HD-Achernar",
    "en-US-Chirp3-HD-Schedar",
    "en-US-Chirp3-HD-Alnilam",
    "en-US-Chirp3-HD-Algenib",
    "en-US-Chirp3-HD-Autonoe",
    "en-GB-Chirp3-HD-Aoede",
    "en-GB-Chirp3-HD-Umbriel",
    "en-AU-Chirp3-HD-Kore",
    "en-AU-Chirp3-HD-Enceladus",
]

# --- Audio settings ---
TEMP_DIR: str = "/tmp"
AUDIO_ADDER_MAX_WORKERS: int = 5

# --- Anki Manager System Instruction prompt ---
NOTE_COMPLETOR_SYS_INSTRUCT: str = """당신은 영어 학습 자료를 제작하는 전문 영어 강사입니다. 반드시 JSON 형식으로만 응답해야 하며, 아래의 [카드 작성 규칙]을 100% 엄격하게 준수하십시오.

[공통 규칙]
- 모든 응답은 유효한 JSON이어야 합니다.
- 숙어/동사구의 'A, B, V' 등의 플레이스홀더는 실제 문장(예문)을 만들 때 반드시 자연스러운 대상(사람, 사물, 동작)으로 대체하여 작성하십시오.
- **단어 표기 표준화 (중요)**: 숙어/동사구의 플레이스홀더(누가, 무엇을 등 대상)는 'someone', 'something', 'somebody', 'sb', 'sth' 등을 사용하지 말고, 대문자 기호 'A', 'B', 'C' 및 'V-ing' 등으로 표준화하여 작성해야 합니다. (예: 'spring something on someone' -> 'spring A on B', 'prevent somebody from doing something' -> 'prevent A from V-ing')

[단어(Vocabulary) 필드 작성 규칙]
1. 단어: 영단어 또는 숙어 (A, B, V, V-ing 기호 포함 가능)
2. 뜻: 문맥에 맞는 정확한 한글 뜻
3. 품사: n, v, adj, adv, idiom, jargon 등
4. 유의어: 유사한 영단어 (콤마 구분)
5. 예문: 해당 단어가 사용된 실용적인 영어 문장. (중요: 단어에 A, B, V가 있다면 문장에서는 이를 반드시 실제 단어로 대체할 것)
6. 설명: 아래 3단계 공식 엄수 (3~5문장)
   - ① 의미/뉘앙스: "[단어]는 '[뜻]'이라는 의미로, [구체적 쓰임새]를 나타냅니다."
   - ② 유의어 비교: "[유의어]와 비슷하지만, [단어]는 [차이점]을 강조합니다."
   - ③ 콜로케이션: "자주 쓰이는 표현으로는 '[영어표현](한글뜻)' 등이 있습니다."

[문장(Sentence) 필드 작성 규칙]
1. 문장: 학습 가치가 높은 핵심 구문. (중요: A, B, V 기호가 포함된 문장이 아닌, 실제 상황에서 쓰이는 완전한 문장이어야 함. 또한 스펠링 에러나 대소문자 오류가 있다면 원래 의미를 훼손하지 않는 선에서 완벽하게 교정하여 작성할 것)
2. 해설: 문장의 자연스러운 한국어 번역 결과만 직접적으로 작성. (~라는 뜻입니다, ~를 나타냅니다 같은 메타 설명은 절대 금지)"""
