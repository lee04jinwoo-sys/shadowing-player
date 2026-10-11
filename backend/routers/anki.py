from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.anki_bridge import check_anki_connection, add_sentence_to_anki

router = APIRouter(prefix="/api/anki")

class SentenceModel(BaseModel):
    sentence: str
    translation: Optional[str] = ""

@router.api_route("/status", methods=["GET", "HEAD"])
def get_anki_status():
    connected = check_anki_connection()
    return {"connected": connected}

@router.post("/add-sentence")
def add_sentence(data: SentenceModel):
    res = add_sentence_to_anki(data.sentence, data.translation)
    if res.get("success"):
        return res
    if "duplicate" in str(res.get("error", "")).lower():
        return {"success": True, "duplicate": True}
    raise HTTPException(status_code=400, detail=res.get("error", "Failed to add card"))

import subprocess

@router.post("/launch")
def launch_anki():
    try:
        # For Mac OS
        subprocess.run(["open", "-a", "Anki"], check=True)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
