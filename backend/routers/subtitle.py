import os
from fastapi import APIRouter, HTTPException
from backend.services.episode_service import find_episode
from backend.subtitle_parser import get_subtitles
from backend.subtitle_fetcher import fetch_subtitles_for_video

router = APIRouter(prefix="/api/subtitles")

@router.get("/{ep_key}")
def get_episode_subtitles(ep_key: str):
    ep = find_episode(ep_key)
    video_path = ep["video_path"]
    
    try:
        subtitles = get_subtitles(video_path)
        return subtitles
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{ep_key}/fetch")
def fetch_subtitles(ep_key: str):
    ep = find_episode(ep_key)
    video_path = ep["video_path"]
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
        
    try:
        # Clear existing cache for this episode if any
        base_name = os.path.basename(video_path)
        cache_path = os.path.join("cache", f"{base_name}.parsed.json")
        if os.path.exists(cache_path):
            os.remove(cache_path)
            
        success = fetch_subtitles_for_video(video_path)
        
        if success:
            return {"success": True}
        else:
            return {"success": False, "error": "No subtitles found online for this video."}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
