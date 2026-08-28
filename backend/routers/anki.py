from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from backend.anki_bridge import (
    check_anki_connection,
    add_sentence_to_anki,
    bulk_add_sentences_to_anki,
    add_vocab_to_anki,
    bulk_add_vocab_to_anki,
)

router = APIRouter(prefix="/api/anki")

class SentenceItem(BaseModel):
    sentence: str
    translation: Optional[str] = ""

class SentenceModel(BaseModel):
    sentence: str
    translation: Optional[str] = ""

class BulkSentenceModel(BaseModel):
    items: List[SentenceItem]

class VocabItem(BaseModel):
    word: str
    meaning: Optional[str] = ""
    pos: Optional[str] = ""
    synonyms: Optional[str] = ""
    example: Optional[str] = ""
    explanation: Optional[str] = ""

class VocabModel(BaseModel):
    word: str
    meaning: str = ""

class BulkVocabModel(BaseModel):
    items: List[VocabItem]

@router.api_route("/status", methods=["GET", "HEAD"])
def get_anki_status():
    connected = check_anki_connection()
    return {"connected": connected}

@router.post("/add-sentence")
def add_sentence(data: SentenceModel):
    res = add_sentence_to_anki(data.sentence, data.translation)
    if res["success"]:
        return res
    else:
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to add card"))

@router.post("/bulk-add")
def bulk_add_sentences(data: BulkSentenceModel):
    items = [{"sentence": item.sentence, "translation": item.translation} for item in data.items]
    res = bulk_add_sentences_to_anki(items)
    if res["success"]:
        return res
    else:
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to add cards in bulk"))

@router.post("/add-vocab")
def add_vocab(data: VocabModel):
    res = add_vocab_to_anki(data.word, data.meaning)
    if res["success"]:
        return res
    else:
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to add card"))

@router.post("/bulk-add-vocab")
def bulk_add_vocab(data: BulkVocabModel):
    items = [item.model_dump() for item in data.items]
    res = bulk_add_vocab_to_anki(items)
    if res["success"]:
        return res
    else:
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to add vocab cards in bulk"))

import subprocess

@router.post("/launch")
def launch_anki():
    try:
        # For Mac OS
        subprocess.run(["open", "-a", "Anki"], check=True)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
