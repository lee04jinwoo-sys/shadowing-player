"""
YouTube API Router
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.youtube_fetcher import extract_video_id, fetch_youtube_info, fetch_youtube_subtitles

router = APIRouter(prefix="/api/youtube")


class YouTubeURLModel(BaseModel):
    url: str


@router.post("/info")
def get_youtube_info(data: YouTubeURLModel):
    result = fetch_youtube_info(data.url)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


@router.get("/subtitles/{video_id}")
def get_youtube_subtitles(video_id: str):
    subs = fetch_youtube_subtitles(video_id)
    return subs
