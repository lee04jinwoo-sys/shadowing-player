"""AI-powered note completion and vocabulary placeholder normalization.

Uses Google Gemini API to enrich vocabulary and sentence data for Anki cards.
"""
import concurrent.futures
import html
import json
import logging
import os
import re

from dotenv import load_dotenv
from google import genai
from google.genai import types

from backend.anki_core.config import (
    GEMINI_DEFAULT_TEMPERATURE,
    NOTE_COMPLETOR_MAX_WORKERS,
    NOTE_COMPLETOR_MODEL,
    NOTE_COMPLETOR_SYS_INSTRUCT,
)

load_dotenv()

logger = logging.getLogger(__name__)


def normalize_vocab_placeholders(word: str) -> str:
    """Normalize placeholders like someone, something, sb, sth to A, B, C.

    Examples:
        'spring something on someone' -> 'spring A on B'
        'prevent someone from doing something' -> 'prevent A from V-ing'
    """
    # 1. Normalize 'doing something' / 'doing sth' / 'doing' to 'V-ing'
    word = re.sub(r"\bdoing\s+(something|sth)\b", "V-ing", word, flags=re.IGNORECASE)
    word = re.sub(r"\bdoing\b", "V-ing", word, flags=re.IGNORECASE)

    # 2. Normalize 'sb', 'sth', 'someone', 'something', 'somebody', 'sbd' to A, B, C
    pattern = r"\b(someone|somebody|sb|sbd|something|sth)\b"
    placeholders = ["A", "B", "C"]
    placeholder_idx = 0

    def repl(match: re.Match) -> str:
        nonlocal placeholder_idx
        if placeholder_idx < len(placeholders):
            res = placeholders[placeholder_idx]
            placeholder_idx += 1
            return res
        return match.group(0)

    normalized = re.sub(pattern, repl, word, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


class NoteCompleter:
    """AI-powered note enrichment using Google Gemini."""

    def __init__(self) -> None:
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable is not set")
        self.client = genai.Client(api_key=api_key)
        self.model_id = NOTE_COMPLETOR_MODEL
        self.sys_instruct = NOTE_COMPLETOR_SYS_INSTRUCT

    def _generate(self, prompt: str) -> dict | None:
        """Generate structured JSON content via Gemini API."""
        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=[self.sys_instruct, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=GEMINI_DEFAULT_TEMPERATURE,
                ),
            )
            # strict=False allows unescaped control characters like literal newlines
            res = json.loads(response.text, strict=False)

            # Handle list responses
            if isinstance(res, list) and len(res) > 0:
                res = res[0]

            if not isinstance(res, dict):
                logger.warning(f"AI response format invalid (expected dict, got {type(res)})")
                return None

            # Handle nested wrapping: {'sentence': {...}} or {'vocabulary': {...}}
            if "sentence" in res and isinstance(res["sentence"], dict):
                res = res["sentence"]
            elif "vocabulary" in res and isinstance(res["vocabulary"], dict):
                res = res["vocabulary"]
            elif "vocab" in res and isinstance(res["vocab"], dict):
                res = res["vocab"]

            # Recursively unescape HTML entities in all string values
            def recursive_unescape(data):
                if isinstance(data, dict):
                    return {k: recursive_unescape(v) for k, v in data.items()}
                elif isinstance(data, list):
                    return [recursive_unescape(i) for i in data]
                elif isinstance(data, str):
                    return html.unescape(data)
                return data

            return recursive_unescape(res)
        except Exception as e:
            logger.error(f"AI analysis failed: {e}")
            return None

    def enrich_sentences(self, sentences: list[str | dict]) -> list[dict]:
        """Enrich a list of sentences with Korean translations via AI."""
        if not sentences:
            return []

        chunk_size = 10
        chunks = [sentences[i : i + chunk_size] for i in range(0, len(sentences), chunk_size)]
        all_results: list[dict] = []

        logger.info(f"Enriching {len(sentences)} sentences in {len(chunks)} chunks...")

        with concurrent.futures.ThreadPoolExecutor(max_workers=NOTE_COMPLETOR_MAX_WORKERS) as executor:
            prompt_template = """
            다음 문장들에 대해 자연스러운 한국어 번역을 포함한 JSON 객체 리스트를 'sentences' 키에 담아 반환하세요.
            '해설' 필드에는 '~라는 의미입니다'와 같은 부연 설명 없이, 문장 자체의 자연스러운 한국어 번역 결과만 직접적으로 작성하세요.
            만약 문장에 'A, B, V' 같은 플레이스홀더가 남아있다면 이를 자연스러운 실제 상황 단어로 대체하여 문장을 완성하세요.

            [데이터]:
            {}
            """
            futures = [
                (executor.submit(self._generate, prompt_template.format(chunk)), chunk)
                for chunk in chunks
            ]
            for future, chunk in futures:
                res = future.result()
                if res and "sentences" in res:
                    ai_items = res["sentences"]
                    if len(ai_items) == len(chunk):
                        for original_item, ai_item in zip(chunk, ai_items):
                            ai_item["문장"] = original_item
                    all_results.extend(ai_items)
        return all_results

    def enrich_vocab(self, vocab: list[str | dict]) -> list[dict]:
        """Enrich a list of vocabulary words with definitions, POS, examples via AI."""
        if not vocab:
            return []

        chunk_size = 10
        chunks = [vocab[i : i + chunk_size] for i in range(0, len(vocab), chunk_size)]
        all_results: list[dict] = []

        logger.info(f"Enriching {len(vocab)} vocabulary items in {len(chunks)} chunks...")

        with concurrent.futures.ThreadPoolExecutor(max_workers=NOTE_COMPLETOR_MAX_WORKERS) as executor:
            prompt_template = """
            다음 단어 데이터 리스트에 대해, 뜻, 품사, 예문, 설명을 포함한 JSON 객체 리스트를 'vocab' 키에 담아 반환하세요.
            이미 '뜻'이나 '단어' 정보가 있다면 이를 활용하여 내용을 완성하십시오.
            특히 '설명' 필드는 의미의 미세한 차이나 뉘앙스를 한국어로 상세히 설명해야 합니다.

            [데이터]:
            {}
            """
            futures = [
                (executor.submit(self._generate, prompt_template.format(chunk)), chunk)
                for chunk in chunks
            ]
            for future, chunk in futures:
                res = future.result()
                if res and "vocab" in res:
                    ai_items = res["vocab"]
                    if len(ai_items) == len(chunk):
                        for original_item, ai_item in zip(chunk, ai_items):
                            if isinstance(original_item, dict) and "단어" in original_item:
                                ai_item["단어"] = original_item["단어"]
                    all_results.extend(ai_items)
        return all_results
