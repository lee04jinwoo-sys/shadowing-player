"""
youtube_subscriptions.py — Google OAuth 기반 YouTube 구독 채널 조회 및 영문 채널 선별
"""
import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Any

from backend.app_dirs import load_settings, save_settings

logger = logging.getLogger(__name__)

# Default popular fallback English channels if no Google account connected yet
DEFAULT_ENGLISH_CHANNELS = [
    {"channel_id": "UCsooa4yRKGN_zEE8iknghZA", "title": "TED-Ed", "handle": "@TEDEd"},
    {"channel_id": "UCV61VqLdH0lE2xx_qB0kJkg", "title": "BBC Learning English", "handle": "@bbclearningenglish"},
    {"channel_id": "UCi7GJNg51C3jgmYTUwqoUXA", "title": "Team Coco", "handle": "@TeamCoco"},
    {"channel_id": "UC9MAhZQQd9egwWCxrwSIs3w", "title": "EnglishClass101", "handle": "@EnglishClass101"},
    {"channel_id": "UC7cgqB_u2YyqHq8J5B9z8yQ", "title": "Learn English with TV Series", "handle": "@LearnEnglishWithTVSeries"},
    {"channel_id": "UC29ju8bIPH5as8OGnQzwJyA", "title": "CrashCourse", "handle": "@crashcourse"},
]


def is_english_channel_title(title: str) -> bool:
    """
    채널명이 영어인지 판별
    - 한글([가-힣])이 포함되어 있으면 False
    - 영문자([a-zA-Z])가 최소 1자 이상 포함되어 있으면 True
    """
    if not title:
        return False
    # 한글이 포함된 경우 제외
    if re.search(r'[가-힣]', title):
        return False
    # 영문자가 포함된 경우 통과
    if re.search(r'[a-zA-Z]', title):
        return True
    return False


def fetch_user_subscriptions(access_token: str) -> list[dict[str, Any]]:
    """
    Google OAuth access_token을 사용하여 사용자의 구독 채널 목록을 조회하고
    영문 채널만 필터링하여 반환.
    """
    if not access_token:
        return []

    url = "https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50"
    all_channels = []
    next_page_token = ""

    try:
        for _ in range(4):  # 최대 200개 채널까지 페이징
            req_url = url
            if next_page_token:
                req_url += f"&pageToken={next_page_token}"

            req = urllib.request.Request(req_url, headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            })

            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            items = data.get("items", [])
            for item in items:
                snippet = item.get("snippet", {})
                resource_id = snippet.get("resourceId", {})
                channel_id = resource_id.get("channelId", "")
                title = snippet.get("title", "")
                description = snippet.get("description", "")
                thumbnails = snippet.get("thumbnails", {})
                thumb = thumbnails.get("medium", {}).get("url") or thumbnails.get("default", {}).get("url", "")

                if channel_id and title:
                    # 영문 채널명 필터링 적용!
                    if is_english_channel_title(title):
                        all_channels.append({
                            "channel_id": channel_id,
                            "title": title,
                            "description": description,
                            "thumbnail": thumb,
                        })

            next_page_token = data.get("nextPageToken", "")
            if not next_page_token:
                break

        logger.info(f"Fetched {len(all_channels)} English channels from user subscriptions")
        return all_channels

    except Exception as e:
        logger.error(f"Failed to fetch user subscriptions: {e}")
        return []


def fetch_channel_recent_videos(channel_id: str, channel_title: str = "", max_results: int = 12) -> list[dict[str, Any]]:
    """
    특정 채널의 최신 영상 목록을 조회 (yt-dlp extract_flat 활용)
    """
    import yt_dlp

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': 'in_playlist',
    }

    target_url = f"https://www.youtube.com/channel/{channel_id}/videos"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(target_url, download=False)
            entries = res.get("entries", []) if res else []
            
            results = []
            for item in entries[:max_results]:
                if not item:
                    continue
                v_id = item.get("id") or item.get("url")
                if not v_id or len(v_id) != 11:
                    continue

                duration = item.get("duration") or 0
                mins = int(duration) // 60
                secs = int(duration) % 60
                dur_str = f"{mins:02d}:{secs:02d}" if duration else ""

                thumb = item.get("thumbnail")
                if not thumb or not thumb.startswith("http"):
                    thumb = f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"

                results.append({
                    "video_id": v_id,
                    "title": item.get("title", "Unknown"),
                    "channel": item.get("uploader") or channel_title or "",
                    "duration": duration,
                    "duration_str": dur_str,
                    "thumbnail": thumb,
                    "views": item.get("view_count") or 0,
                })
            return results
    except Exception as e:
        logger.warning(f"Failed to fetch channel videos for {channel_id}: {e}")
        from backend.youtube_fetcher import search_youtube
        return search_youtube(f"{channel_title} english", max_results=max_results)
