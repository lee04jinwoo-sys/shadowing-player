from fastapi import APIRouter
from pydantic import BaseModel
from backend.ai_bridge import get_ai_explanation

router = APIRouter(prefix="/api/ai")

class SentenceModel(BaseModel):
    sentence: str

@router.post("/explain")
def explain_sentence(data: SentenceModel):
    res = get_ai_explanation(data.sentence)
    return res
