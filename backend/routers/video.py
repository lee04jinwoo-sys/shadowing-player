import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.services.episode_service import get_episodes, find_episode

router = APIRouter(prefix="/api")

@router.api_route("/files", methods=["GET", "HEAD"])
def get_episodes_api():
    try:
        return get_episodes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/video/{ep_key}")
def stream_video(ep_key: str):
    ep = find_episode(ep_key)
        
    video_path = ep["video_path"]
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
        
    return FileResponse(video_path, media_type="video/mp4")
