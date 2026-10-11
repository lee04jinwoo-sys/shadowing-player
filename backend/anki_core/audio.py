"""Text cleanup for TTS input (used by the APKG export)."""
import html
import re


def clean_html(text: str) -> str:
    """Remove HTML tags and unescape HTML entities for clean TTS input."""
    if not text:
        return ""
    # 1. Unescape HTML entities (&#x27; -> ', &nbsp; -> space, etc.)
    text = html.unescape(text)
    # 2. Normalize curly quotes and special characters (prevents TTS glitches)
    text = text.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    # 3. Strip HTML tags
    return re.sub(r"<.*?>", "", text).strip()
