import os
import tempfile
import csv
import io
import re
import uuid
import random
import logging
import shutil
import concurrent.futures
from typing import Optional

import genanki
import gtts
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from backend.anki_core.config import VOICE_LIST
from backend.anki_core.audio import clean_html
from backend.anki_core.completer import NoteCompleter, normalize_vocab_placeholders
from backend.routers.dict import clean_vocab_example

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export")

# Initialize GCP TTS Client (optional - falls back to gTTS if unavailable)
_tts_client = None
try:
    from google.cloud import texttospeech
    _tts_client = texttospeech.TextToSpeechClient()
except Exception as e:
    logger.warning(f"GCP TTS Client init warning for export: {e}")


def cleanup_directory(dir_path: str):
    """Safely removes a temporary directory and its contents."""
    try:
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path, ignore_errors=True)
    except Exception as e:
        logger.error(f"Failed to delete temp dir {dir_path}: {e}")


class ExportItem(BaseModel):
    sentence: Optional[str] = ""
    word: Optional[str] = ""
    meaning: Optional[str] = ""
    translation: Optional[str] = ""
    pos: Optional[str] = ""
    synonyms: Optional[str] = ""
    example: Optional[str] = ""
    explanation: Optional[str] = ""
    source: Optional[str] = ""
    item_type: Optional[str] = "sentence"  # "sentence" or "vocab"


class ExportRequest(BaseModel):
    items: list[ExportItem]
    deck_name: Optional[str] = "Shadowing Player Deck"


def _generate_sentence_audio(sentence: str, temp_dir: str) -> tuple[str, str]:
    """Generates GCP Chirp3-HD (or fallback gTTS) audio file in temp_dir.
    Returns (abs_filepath, sound_tag).
    """
    clean_text = clean_html(sentence)
    if not clean_text:
        return "", ""

    # 1. Try GCP Chirp3-HD / Studio voices
    global _tts_client
    if _tts_client is not None:
        try:
            from google.cloud import texttospeech
            selected_voice = random.choice(VOICE_LIST)
            lang_code = "-".join(selected_voice.split("-")[:2])
            synthesis_input = texttospeech.SynthesisInput(text=clean_text)
            voice = texttospeech.VoiceSelectionParams(language_code=lang_code, name=selected_voice)
            audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.1)
            response = _tts_client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)

            filename = f"sp_chirp3_{uuid.uuid4().hex[:8]}.mp3"
            filepath = os.path.join(temp_dir, filename)
            with open(filepath, "wb") as f:
                f.write(response.audio_content)
            return filepath, f"[sound:{filename}]"
        except Exception as e:
            logger.warning(f"GCP Chirp3-HD export audio failed, falling back to gTTS: {e}")

    # 2. Fallback to gTTS
    try:
        filename = f"sp_gtts_{uuid.uuid4().hex[:8]}.mp3"
        filepath = os.path.join(temp_dir, filename)
        tts = gtts.gTTS(clean_text, lang='en')
        tts.save(filepath)
        return filepath, f"[sound:{filename}]"
    except Exception as e:
        logger.error(f"gTTS sentence export failed for '{sentence}': {e}")
        return "", ""


def _generate_vocab_audio(word: str, temp_dir: str) -> tuple[str, str]:
    """Generates gTTS audio file for vocabulary cards in temp_dir.
    Returns (abs_filepath, sound_tag).
    """
    clean_text = clean_html(word)
    if not clean_text:
        return "", ""
    try:
        filename = f"sp_vocab_gtts_{uuid.uuid4().hex[:8]}.mp3"
        filepath = os.path.join(temp_dir, filename)
        tts = gtts.gTTS(clean_text, lang='en', tld='com')
        tts.save(filepath)
        return filepath, f"[sound:{filename}]"
    except Exception as e:
        logger.error(f"gTTS vocab export failed for '{word}': {e}")
        return "", ""


# Shared CSS for elegant Anki cards
CARD_CSS = """
.card {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #1e293b;
    background-color: #f8fafc;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    max-width: 600px;
    margin: 0 auto;
}
.card.nightMode {
    background-color: #0f172a;
    color: #f1f5f9;
}
.en-title {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    text-align: center;
    margin-bottom: 12px;
}
.card.nightMode .en-title {
    color: #f8fafc;
}
.kr-meaning {
    font-size: 18px;
    font-weight: 600;
    color: #10b981;
    text-align: center;
    margin: 12px 0;
}
.card.nightMode .kr-meaning {
    color: #34d399;
}
.meta-tag {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    color: #6366f1;
    background: #e0e7ff;
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 6px;
}
.card.nightMode .meta-tag {
    background: #312e81;
    color: #a5b4fc;
}
.section-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 12px;
    font-size: 14px;
}
.card.nightMode .section-box {
    background: #1e293b;
    border-color: #334155;
}
.example-en {
    font-weight: 600;
    color: #334155;
    margin-bottom: 4px;
}
.card.nightMode .example-en {
    color: #cbd5e1;
}
.explanation-text {
    color: #475569;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
}
.card.nightMode .explanation-text {
    color: #94a3b8;
}
hr#answer {
    border: none;
    border-top: 1px dashed #cbd5e1;
    margin: 18px 0;
}
.card.nightMode hr#answer {
    border-top-color: #334155;
}
"""


@router.post("/apkg")
def export_apkg(data: ExportRequest, background_tasks: BackgroundTasks):
    if not data.items:
        raise HTTPException(status_code=400, detail="No items to export")

    temp_export_dir = tempfile.mkdtemp(prefix="sp_apkg_")
    background_tasks.add_task(cleanup_directory, temp_export_dir)

    try:
        import zlib
        deck_id = (zlib.crc32(data.deck_name.encode('utf-8')) % 1000000000) + 1000000000
        my_deck = genanki.Deck(deck_id, data.deck_name)

        # 1. Sentence Model
        sentence_model = genanki.Model(
            1607392319,
            'Shadowing Player Sentence Model (Audio + Translation)',
            fields=[
                {'name': 'English'},
                {'name': 'Korean'},
                {'name': 'Audio'},
                {'name': 'Source'},
            ],
            templates=[{
                'name': 'Card 1',
                'qfmt': '''
                <div class="card">
                    <div class="en-title">{{English}}</div>
                    <div style="text-align: center; margin-top: 10px;">{{Audio}}</div>
                </div>
                ''',
                'afmt': '''
                <div class="card">
                    <div class="en-title">{{English}}</div>
                    <div style="text-align: center; margin-top: 10px;">{{Audio}}</div>
                    <hr id="answer">
                    <div class="kr-meaning">{{Korean}}</div>
                    {{#Source}}
                    <div style="font-family: monospace; font-size: 11px; text-align: center; color: #94a3b8; margin-top: 16px;">
                        [{{Source}}]
                    </div>
                    {{/Source}}
                </div>
                ''',
            }],
            css=CARD_CSS
        )

        # 2. Vocabulary Model
        vocab_model = genanki.Model(
            1607392320,
            'Shadowing Player Vocabulary Model (Audio + AI 3-Step)',
            fields=[
                {'name': 'Word'},
                {'name': 'Meaning'},
                {'name': 'POS'},
                {'name': 'Synonyms'},
                {'name': 'Example'},
                {'name': 'Explanation'},
                {'name': 'Audio'},
            ],
            templates=[{
                'name': 'Card 1',
                'qfmt': '''
                <div class="card">
                    <div class="en-title">{{Word}}</div>
                    <div style="text-align: center; margin-top: 10px;">{{Audio}}</div>
                </div>
                ''',
                'afmt': '''
                <div class="card">
                    <div class="en-title">{{Word}}</div>
                    <div style="text-align: center; margin-top: 10px;">{{Audio}}</div>
                    <hr id="answer">
                    <div class="kr-meaning">
                        {{#POS}}<span class="meta-tag">{{POS}}</span>{{/POS}}
                        {{Meaning}}
                    </div>
                    {{#Synonyms}}
                    <div style="text-align: center; font-size: 13px; color: #64748b; margin-bottom: 12px;">
                        유의어: {{Synonyms}}
                    </div>
                    {{/Synonyms}}
                    {{#Example}}
                    <div class="section-box">
                        <div class="example-en">예문: {{Example}}</div>
                    </div>
                    {{/Example}}
                    {{#Explanation}}
                    <div class="section-box">
                        <div class="explanation-text">{{Explanation}}</div>
                    </div>
                    {{/Explanation}}
                </div>
                ''',
            }],
            css=CARD_CSS
        )

        media_files = []

        # Identify items needing AI translation / enrichment
        sentence_items = []
        vocab_items = []

        for item in data.items:
            is_vocab = (item.item_type == "vocab") or bool(item.word and not item.sentence)
            if is_vocab:
                vocab_items.append(item)
            else:
                sentence_items.append(item)

        # Enrich missing sentence translations via Gemini AI
        missing_sentence_indices = [i for i, item in enumerate(sentence_items) if not (item.translation or item.meaning)]
        if missing_sentence_indices:
            try:
                completer = NoteCompleter()
                to_enrich = [{"문장": sentence_items[i].sentence} for i in missing_sentence_indices]
                enriched = completer.enrich_sentences(to_enrich)
                if enriched and len(enriched) == len(missing_sentence_indices):
                    for orig_idx, enr in zip(missing_sentence_indices, enriched):
                        if isinstance(enr, dict) and "해설" in enr:
                            sentence_items[orig_idx].translation = enr["해설"]
            except Exception as e:
                logger.warning(f"Sentence AI translation enrichment error for APKG: {e}")

        # Enrich missing vocab meanings/explanations via Gemini AI
        missing_vocab_indices = [i for i, item in enumerate(vocab_items) if not (item.meaning or item.explanation)]
        if missing_vocab_indices:
            try:
                completer = NoteCompleter()
                to_enrich = [{"단어": vocab_items[i].word or vocab_items[i].sentence, "뜻": vocab_items[i].meaning or ""} for i in missing_vocab_indices]
                enriched = completer.enrich_vocab(to_enrich)
                if enriched and len(enriched) == len(missing_vocab_indices):
                    for orig_idx, enr in zip(missing_vocab_indices, enriched):
                        if isinstance(enr, dict):
                            vocab_items[orig_idx].meaning = enr.get("뜻", vocab_items[orig_idx].meaning)
                            vocab_items[orig_idx].pos = enr.get("품사", vocab_items[orig_idx].pos)
                            vocab_items[orig_idx].example = enr.get("예문", vocab_items[orig_idx].example)
                            vocab_items[orig_idx].explanation = enr.get("설명", vocab_items[orig_idx].explanation)
            except Exception as e:
                logger.warning(f"Vocab AI enrichment error for APKG: {e}")

        # Generate audio and build notes concurrently
        def process_sentence_export(item: ExportItem):
            s_text = (item.sentence or item.word or "").strip()
            if not s_text:
                return None
            k_text = (item.translation or item.meaning or "").strip()
            audio_path, sound_tag = _generate_sentence_audio(s_text, temp_export_dir)
            note = genanki.Note(
                model=sentence_model,
                fields=[s_text, k_text, sound_tag, item.source or ""]
            )
            return note, audio_path

        def process_vocab_export(item: ExportItem):
            raw_w = (item.word or item.sentence or "").strip()
            w_text = normalize_vocab_placeholders(raw_w)
            if not w_text:
                return None
            meaning = (item.meaning or item.translation or "").strip()
            pos = (item.pos or "").strip()
            synonyms = ""  # 유의어 금지 룰 (Anki Manager와 동일)
            clean_ex = clean_vocab_example(item.example or "")
            explanation = (item.explanation or "").strip()

            audio_path, sound_tag = _generate_vocab_audio(w_text, temp_export_dir)
            note = genanki.Note(
                model=vocab_model,
                fields=[w_text, meaning, pos, synonyms, clean_ex, explanation, sound_tag]
            )
            return note, audio_path

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            sentence_results = list(executor.map(process_sentence_export, sentence_items))
            vocab_results = list(executor.map(process_vocab_export, vocab_items))

        for res in (sentence_results + vocab_results):
            if res:
                note, audio_path = res
                my_deck.add_note(note)
                if audio_path and os.path.exists(audio_path):
                    media_files.append(audio_path)

        # Build APKG Package
        package = genanki.Package(my_deck)
        package.media_files = media_files

        out_apkg_path = os.path.join(temp_export_dir, "Shadowing_Deck.apkg")
        package.write_to_file(out_apkg_path)

        return FileResponse(
            out_apkg_path,
            filename="Shadowing_Deck.apkg",
            media_type="application/apkg",
            headers={"Content-Disposition": "attachment; filename=Shadowing_Deck.apkg"}
        )

    except Exception as e:
        logger.error(f"Error generating APKG with audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/csv")
def export_csv(data: ExportRequest):
    if not data.items:
        raise HTTPException(status_code=400, detail="No items to export")

    try:
        output = io.StringIO()
        output.write('\ufeff')
        writer = csv.writer(output)
        writer.writerow(["Type", "English", "Korean", "POS", "Synonyms", "Example", "Explanation", "Source"])
        for item in data.items:
            is_vocab = (item.item_type == "vocab") or bool(item.word and not item.sentence)
            if is_vocab:
                raw_w = (item.word or item.sentence or "").strip()
                w_text = normalize_vocab_placeholders(raw_w)
                clean_ex = clean_vocab_example(item.example or "")
                writer.writerow([
                    "Vocabulary",
                    w_text,
                    item.meaning or item.translation or "",
                    item.pos or "",
                    "",  # Synonyms: 유의어 금지 룰
                    clean_ex,
                    item.explanation or "",
                    item.source or ""
                ])
            else:
                writer.writerow([
                    "Sentence",
                    item.sentence or "",
                    item.translation or item.meaning or "",
                    "",
                    "",
                    "",
                    "",
                    item.source or ""
                ])

        csv_content = output.getvalue()
        return Response(
            content=csv_content.encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=Shadowing_Items.csv"}
        )
    except Exception as e:
        logger.error(f"Error generating CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))

