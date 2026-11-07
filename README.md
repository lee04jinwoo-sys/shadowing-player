# Shadowing Player

A personal, local-only web app for language shadowing practice. It runs a FastAPI backend on loopback (`127.0.0.1`) and serves a plain HTML/JS frontend.

## What it does

- Fetches YouTube videos and subtitles (`yt-dlp`, `subliminal`) and parses them into sentences.
- Uses Gemini for explanations and dictionary lookups.
- Sends cards to Anki (AnkiConnect or `genanki` export), with TTS via gTTS or Google Cloud TTS.

## Run

```bash
pip install -r requirements.txt
cp .env.example .env        # set GOOGLE_API_KEY (Google AI Studio)
python server.py --port 8000
```

Open http://127.0.0.1:8000. The server listens on loopback unless `HOST` is set.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Status

Personal project, used by one person. Not packaged and not tested beyond my own machine.
