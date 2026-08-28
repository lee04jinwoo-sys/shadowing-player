"""Anki Core - Standalone Anki integration module for Shadowing Player.

Extracted from Anki Manager to make Shadowing Player fully self-contained.
"""
from backend.anki_core.connector import AnkiConnector
from backend.anki_core.audio import AnkiTTSFiller, clean_html
from backend.anki_core.completer import NoteCompleter, normalize_vocab_placeholders
from backend.anki_core.config import (
    ANKI_URL, DECK_SENTENCE, MODEL_SENTENCE, DECK_VOCAB, MODEL_VOCAB,
    VOICE_LIST, TTS_VOCAB_LANGUAGE, TTS_VOCAB_TLD,
    NOTE_COMPLETOR_MODEL, NOTE_COMPLETOR_SYS_INSTRUCT,
    GEMINI_DEFAULT_TEMPERATURE,
)
from backend.anki_core.pos import get_simple_pos, setup_nltk

__all__ = [
    "AnkiConnector", "AnkiTTSFiller", "clean_html",
    "NoteCompleter", "normalize_vocab_placeholders",
    "get_simple_pos", "setup_nltk",
    "ANKI_URL", "DECK_SENTENCE", "MODEL_SENTENCE", "DECK_VOCAB", "MODEL_VOCAB",
    "VOICE_LIST", "TTS_VOCAB_LANGUAGE", "TTS_VOCAB_TLD",
    "NOTE_COMPLETOR_MODEL", "NOTE_COMPLETOR_SYS_INSTRUCT",
    "GEMINI_DEFAULT_TEMPERATURE",
]
