"""
YouTube API Router
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.app_dirs import load_settings
from backend.youtube_fetcher import extract_video_id, fetch_youtube_info, fetch_youtube_subtitles, search_youtube
from backend.youtube_subscriptions import DEFAULT_ENGLISH_CHANNELS, fetch_channel_recent_videos

router = APIRouter(prefix="/api/youtube")


class YouTubeURLModel(BaseModel):
    url: str


@router.get("/search")
def search_youtube_videos(q: str = "TED-Ed english", limit: int = 16):
    """키워드로 YouTube 영상 검색"""
    results = search_youtube(query=q, max_results=min(limit, 30))
    return {"success": True, "results": results}


@router.get("/subscriptions")
def get_user_subscriptions():
    """사용자의 영문 구독 채널 목록 반환 (미연동 시 추천 기본 영어 채널 반환)"""
    settings = load_settings()
    channels = settings.get("google_subscribed_channels", [])
    is_authenticated = bool(settings.get("google_access_token"))

    if not channels:
        channels = DEFAULT_ENGLISH_CHANNELS

    return {
        "success": True,
        "authenticated": is_authenticated,
        "channels": channels,
    }


@router.get("/subscriptions/channel/{channel_id}")
def get_channel_videos(channel_id: str, title: str = "", limit: int = 12):
    """특정 채널의 최신 영상 목록 조회"""
    videos = fetch_channel_recent_videos(channel_id=channel_id, channel_title=title, max_results=limit)
    return {"success": True, "results": videos}


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
