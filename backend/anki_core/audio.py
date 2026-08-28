"""TTS audio generation and Anki media storage.

Uses gTTS for vocabulary cards and GCP Chirp3-HD for sentence cards.
"""
import base64
import html
import logging
import os
import random
import re
import uuid

from gtts import gTTS

from backend.anki_core.config import (
    TEMP_DIR,
    TTS_VOCAB_LANGUAGE,
    TTS_VOCAB_TLD,
    VOICE_LIST,
)
from backend.anki_core.connector import AnkiConnector

logger = logging.getLogger(__name__)


def clean_html(text: str) -> str:
    """Remove HTML tags and unescape HTML entities for clean TTS input."""
    if not text:
        return ""
    # 1. Unescape HTML entities (&#x27; -> ', &nbsp; -> space, etc.)
    text = html.unescape(text)
    # 2. Normalize curly quotes and special characters (prevents TTS glitches)
    text = text.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    # 3. Strip HTML tags
    return re.sub(r"<.*?>", "", text).strip()


class AnkiTTSFiller:
    """Generate TTS audio and store in Anki media collection."""

    @classmethod
    def generate_random_tts(cls, tts_client, text: str) -> tuple[str, str]:
        """Generate high-quality Chirp3-HD TTS audio via GCP.
        
        Returns (sound_tag, voice_name) tuple.
        """
        if not text:
            return "", "No Text"
        clean_text = clean_html(text)
        try:
            from google.cloud import texttospeech

            synthesis_input = texttospeech.SynthesisInput(text=clean_text)
            selected_voice_name = random.choice(VOICE_LIST)
            lang_code = "-".join(selected_voice_name.split("-")[:2])
            voice = texttospeech.VoiceSelectionParams(
                language_code=lang_code, name=selected_voice_name
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=1.1,
            )
            response = tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            filename = f"anki_gcp_{selected_voice_name}_{uuid.uuid4().hex[:8]}.mp3"
            b64_audio = base64.b64encode(response.audio_content).decode("utf-8")
            AnkiConnector.invoke("storeMediaFile", filename=filename, data=b64_audio)
            return f"[sound:{filename}]", selected_voice_name
        except Exception as e:
            logger.error(f"GCP TTS error: {e}")
            return "", "Error"

    @classmethod
    def generate_gtts(cls, text: str) -> tuple[str, str]:
        """Generate gTTS audio for vocabulary cards.
        
        Returns (sound_tag, method_name) tuple.
        """
        if not text:
            return "", "No Text"
        clean_text = clean_html(text)
        try:
            tts = gTTS(clean_text, lang=TTS_VOCAB_LANGUAGE, tld=TTS_VOCAB_TLD)
            filename = f"anki_gtts_{uuid.uuid4().hex[:8]}.mp3"
            path = os.path.join(TEMP_DIR, filename)
            tts.save(path)
            with open(path, "rb") as f:
                b64_audio = base64.b64encode(f.read()).decode("utf-8")
            AnkiConnector.invoke("storeMediaFile", filename=filename, data=b64_audio)
            # Clean up temp file
            if os.path.exists(path):
                os.remove(path)
            return f"[sound:{filename}]", "gTTS"
        except Exception as e:
            logger.error(f"gTTS error: {e}")
            return "", "Error"
