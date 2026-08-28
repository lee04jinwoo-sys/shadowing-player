"""AnkiConnect REST API wrapper.

Communicates with Anki desktop app via AnkiConnect plugin (http://localhost:8765).
"""
import re
import logging
import requests

from backend.anki_core.config import ANKI_URL

logger = logging.getLogger(__name__)


def _get_anki_url() -> str:
    try:
        from backend.app_dirs import load_settings
        return load_settings().get("anki_url", ANKI_URL) or ANKI_URL
    except Exception:
        return ANKI_URL


class AnkiConnector:
    """Static wrapper for AnkiConnect REST API."""

    @staticmethod
    def invoke(action: str, **params) -> dict | None:
        """Send a request to AnkiConnect and return the result."""
        url = _get_anki_url()
        try:
            response = requests.post(
                url,
                json={"action": action, "version": 6, "params": params},
                timeout=10,
            ).json()
            if "error" in response and response["error"]:
                raise Exception(response["error"])
            return response["result"]
        except Exception as e:
            if "duplicate" in str(e).lower():
                raise
            raise Exception(f"AnkiConnect 에러: {e}")

    @classmethod
    def add_note(
        cls,
        deck_name: str,
        model_name: str,
        fields: dict[str, str],
        tags: list[str] | None = None,
        options: dict | None = None,
    ) -> int | None:
        """Add a single note to Anki."""
        note = {
            "deckName": deck_name,
            "modelName": model_name,
            "fields": fields,
            "tags": tags or [],
            "options": options or {"allowDuplicate": False},
        }
        return cls.invoke("addNote", note=note)

    @classmethod
    def add_notes(cls, notes: list[dict]) -> list | None:
        """Add multiple notes to Anki."""
        return cls.invoke("addNotes", notes=notes)

    @classmethod
    def find_notes(cls, query: str) -> list[int]:
        """Find note IDs matching a query."""
        return cls.invoke("findNotes", query=query) or []

    @classmethod
    def get_notes_info(cls, note_ids: list[int]) -> list[dict]:
        """Get detailed info for a list of note IDs."""
        return cls.invoke("notesInfo", notes=note_ids) or []

    @classmethod
    def update_note_fields(cls, note_id: int, fields: dict[str, str]) -> None:
        """Update fields of an existing note."""
        cls.invoke("updateNoteFields", note={"id": note_id, "fields": fields})

    @classmethod
    def get_deck_names(cls) -> list[str]:
        """Get all deck names."""
        return cls.invoke("deckNames") or []

    @classmethod
    def ensure_model_fields(cls, model_name: str, fields_to_add: list[str]) -> None:
        """Ensure a model has the specified fields, adding any missing ones."""
        try:
            current_fields = cls.invoke("modelFieldNames", modelName=model_name) or []
            for field in fields_to_add:
                if field not in current_fields:
                    cls.invoke("modelFieldAdd", modelName=model_name, fieldName=field)
        except Exception as e:
            logger.warning(f"Failed to ensure model fields for {model_name}: {e}")

    @classmethod
    def get_existing_vocab_words(cls, model_vocab_name: str) -> list[str]:
        """Get a list of all existing vocabulary words for deduplication."""
        existing: set[str] = set()
        try:
            note_ids = cls.find_notes(query=f'"note:{model_vocab_name}"')
            if note_ids:
                notes_info = cls.get_notes_info(note_ids)
                for note in notes_info:
                    if "단어" in note["fields"]:
                        clean = re.sub("<[^<]+?>", "", note["fields"]["단어"]["value"]).strip().lower()
                        existing.add(clean)
        except Exception:
            pass
        return list(existing)
