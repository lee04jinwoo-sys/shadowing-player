from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.anki_bridge import gateway_status, add_sentence_to_anki

router = APIRouter(prefix="/api/anki")

class SentenceModel(BaseModel):
    sentence: str
    translation: Optional[str] = ""

@router.api_route("/status", methods=["GET", "HEAD"])
def get_anki_status():
    return gateway_status()

@router.post("/add-sentence")
def add_sentence(data: SentenceModel):
    res = add_sentence_to_anki(data.sentence, data.translation)
    if res.get("success"):
        return res
    if "duplicate" in str(res.get("error", "")).lower():
        return {"success": True, "duplicate": True}
    raise HTTPException(status_code=400, detail=res.get("error", "Failed to add card"))
