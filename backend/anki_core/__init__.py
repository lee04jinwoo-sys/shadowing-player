"""Anki Core - helpers Shadowing Player still needs locally.

Card creation goes through the Anki Manager gateway (backend/anki_bridge.py).
What remains here is used by the APKG/CSV export and the dictionary lookup.
"""
from backend.anki_core.audio import clean_html
from backend.anki_core.completer import NoteCompleter, normalize_vocab_placeholders
from backend.anki_core.config import VOICE_LIST

__all__ = ["clean_html", "NoteCompleter", "normalize_vocab_placeholders", "VOICE_LIST"]
