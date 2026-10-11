"""Anki Core configuration constants.

TTS voices and AI prompt settings for the APKG export.
Card creation rules live in Anki Manager; NOTE_COMPLETOR_SYS_INSTRUCT is a copy of its prompt.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# --- AI model settings ---
NOTE_COMPLETOR_MODEL: str = os.getenv("NOTE_COMPLETOR_MODEL", "gemini-flash-lite-latest")
GEMINI_DEFAULT_TEMPERATURE: float = 0.3
NOTE_COMPLETOR_MAX_WORKERS: int = 2

# --- TTS voices (APKG export, sentence audio) ---
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

# --- Anki Manager System Instruction prompt ---
# Anki Manager/config.py의 NOTE_COMPLETOR_SYS_INSTRUCT와 같아야 한다 (2026-10-11 동기화).
NOTE_COMPLETOR_SYS_INSTRUCT: str = """전문 영어 학습 자료 제작자입니다. JSON 형식으로만 응답하세요.
[규칙]
1. 표기 표준화: 대상 플레이스홀더(누가/무엇을)는 sb/sth 대신 대문자 'A, B, C' 및 'V-ing' 사용 (예: spring A on B, prevent A from V-ing).
2. 단어 카드 (Vocabulary):
   - 단어: 영단어/숙어 (A, B 기호 포함 가능)
   - 뜻: 문맥에 맞는 정확한 한글 뜻 (슬래시(/) 절대 사용 금지, 반드시 쉼표(,)와 공백으로 구분. 예: '비판하다, 비난하다')
   - 품사: n, v, adj, adv, idiom 중 하나 (복합 품사는 콤마 구분, 예: 'n, v'). 'v phr', 'n phr', 'collocation', 'phrase' 등 비표준 태그 절대 사용 금지 (숙어/구/연어는 무조건 'idiom'으로 작성)
   - 예문: A, B를 실제 대상 단어로 바꾼 자연스러운 실생활 예문
   - 설명 (2단계 필수): ① "[단어]는 '[뜻]'이라는 의미로, [뉘앙스/구체적 쓰임새]를 나타냅니다." ② "자주 쓰이는 표현으로는 '[표현](한글뜻)' 등이 있습니다."
3. 문장 카드 (Sentence):
   - 문장: 오타 교정된 완전한 실생활 문장 (기호 A, B 노출 금지)
   - 해설: 문장의 자연스러운 한국어 직역/번역만 직접 작성 (~라는 뜻입니다 등 메타 설명 절대 금지)"""
