"""
youtube_fetcher.py — YouTube 영상 메타데이터 및 자막 추출
yt-dlp를 사용하여 자막만 추출 (영상 다운로드 없음)
"""

import os
import json
import re
import logging
import urllib.request
from backend.subtitle_parser import merge_into_sentences
from backend.app_dirs import SUBTITLE_CACHE_DIR

logger = logging.getLogger(__name__)

CACHE_DIR = str(SUBTITLE_CACHE_DIR)
os.makedirs(CACHE_DIR, exist_ok=True)


import urllib.parse


def extract_video_id(url: str) -> str | None:
    """YouTube URL 또는 비디오 ID에서 11자리 video_id를 완벽하게 추출"""
    if not url:
        return None
    url = url.strip()

    # 1. Plain 11-char video ID (e.g. "dQw4w9WgXcQ")
    if re.fullmatch(r'[a-zA-Z0-9_-]{11}', url):
        return url

    try:
        parsed = urllib.parse.urlparse(url)
        # 2. query param 'v' (e.g. youtube.com/watch?v=xxx, youtube.com/watch?feature=shared&v=xxx)
        qs = urllib.parse.parse_qs(parsed.query)
        if 'v' in qs and qs['v'] and len(qs['v'][0]) == 11:
            return qs['v'][0]

        # 3. Path-based IDs: youtu.be/xxx, /shorts/xxx, /live/xxx, /embed/xxx, /v/xxx
        path_parts = [p for p in parsed.path.split('/') if p]
        if 'youtu.be' in parsed.netloc and path_parts:
            vid = path_parts[0][:11]
            if re.fullmatch(r'[a-zA-Z0-9_-]{11}', vid):
                return vid

        for prefix in ['shorts', 'live', 'embed', 'v']:
            if prefix in path_parts:
                idx = path_parts.index(prefix)
                if idx + 1 < len(path_parts):
                    vid = path_parts[idx + 1][:11]
                    if re.fullmatch(r'[a-zA-Z0-9_-]{11}', vid):
                        return vid
    except Exception:
        pass

    # 4. Fallback regex search anywhere in URL
    match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11})(?:\?|&|\/|$)', url)
    if match:
        return match.group(1)

    return None


def fetch_youtube_info(url: str) -> dict:
    """영상 메타데이터 (제목, ID, 길이, 썸네일) 반환"""
    import yt_dlp

    video_id = extract_video_id(url)
    if not video_id:
        return {"success": False, "error": "올바른 YouTube 영상 링크가 아닙니다."}

    canonical_url = f"https://www.youtube.com/watch?v={video_id}"

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(canonical_url, download=False)
            return {
                "success": True,
                "video_id": video_id,
                "title": info.get("title", "Unknown"),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "channel": info.get("channel", ""),
            }
    except Exception as e:
        logger.error(f"Failed to fetch YouTube info: {e}")
        return {"success": False, "error": str(e)}


def _get_available_browser_cookies() -> tuple:
    """Detect available browser for cookie extraction (Brave, Edge, Chrome, Safari)."""
    app_sup = os.path.expanduser("~/Library/Application Support")
    if os.path.exists(os.path.join(app_sup, "BraveSoftware")):
        return ("brave",)
    if os.path.exists(os.path.join(app_sup, "Microsoft Edge")):
        return ("edge",)
    if os.path.exists(os.path.join(app_sup, "Google", "Chrome")):
        return ("chrome",)
    return ()


def fetch_youtube_subtitles(video_id: str) -> list:
    """
    YouTube 자막을 [{start_ms, end_ms, text_en}] 형식으로 반환.
    캐시가 있으면 캐시에서 로드.
    """
    cache_path = os.path.join(CACHE_DIR, f"yt_{video_id}.parsed.json")
    
    # Check cache
    if os.path.exists(cache_path):
        logger.info(f"Loading cached subtitles for yt_{video_id}")
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    # Download subtitles using yt-dlp
    import yt_dlp
    import tempfile
    import requests
    
    url = f"https://www.youtube.com/watch?v={video_id}"
    browser_cookies = _get_available_browser_cookies()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en'],
            'subtitlesformat': 'json3',
            'outtmpl': os.path.join(tmpdir, '%(id)s.%(ext)s'),
        }
        if browser_cookies:
            ydl_opts['cookiesfrombrowser'] = browser_cookies
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                # Get subtitle data from info
                subs_data = None
                
                # Try manual subs first, then auto
                for sub_source in [(info.get('subtitles') or {}), (info.get('automatic_captions') or {})]:
                    if sub_source and 'en' in sub_source:
                        for fmt in sub_source['en']:
                            if fmt.get('ext') == 'json3':
                                subs_data = fmt
                                break
                        if subs_data:
                            break
                
                subtitles = []
                if subs_data and subs_data.get('url'):
                    # Try direct fetch of json3 URL with requests and browser headers
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                    }
                    try:
                        resp = requests.get(subs_data['url'], headers=headers, timeout=15)
                        if resp.status_code == 200:
                            raw = resp.json()
                            subtitles = _parse_json3(raw)
                    except Exception as req_err:
                        logger.warning(f"Direct subtitle URL request failed: {req_err}")

                if not subtitles:
                    logger.warning("Trying fallback subtitle download method")
                    # Fallback: actually download the subtitle files
                    ydl.download([url])
                    
                    # Look for downloaded subtitle file
                    json3_path = os.path.join(tmpdir, f"{video_id}.en.json3")
                    vtt_path = os.path.join(tmpdir, f"{video_id}.en.vtt")
                    
                    if os.path.exists(json3_path):
                        with open(json3_path, 'r', encoding='utf-8') as f:
                            raw = json.load(f)
                        subtitles = _parse_json3(raw)
                    elif os.path.exists(vtt_path):
                        subtitles = _parse_vtt(vtt_path)
                    else:
                        # Check for any .en.* subtitle file
                        found_file = False
                        for fname in os.listdir(tmpdir):
                            full_p = os.path.join(tmpdir, fname)
                            if '.en.' in fname and fname.endswith('.vtt'):
                                logger.info(f"Found subtitle file: {fname}")
                                subtitles = _parse_vtt(full_p)
                                found_file = True
                                break
                            elif '.en.' in fname and (fname.endswith('.json3') or fname.endswith('.json')):
                                logger.info(f"Found subtitle file: {fname}")
                                with open(full_p, 'r', encoding='utf-8') as f:
                                    raw = json.load(f)
                                subtitles = _parse_json3(raw)
                                found_file = True
                                break
                        if not found_file:
                            return []
                
                if subtitles:
                    # Apply sentence-based merging logic
                    subtitles = merge_into_sentences(subtitles)
                    
                    # Cache result
                    with open(cache_path, 'w', encoding='utf-8') as f:
                        json.dump(subtitles, f, ensure_ascii=False, indent=2)
                    logger.info(f"Cached {len(subtitles)} subtitles for yt_{video_id}")
                
                return subtitles
                
        except Exception as e:
            logger.error(f"Failed to fetch YouTube subtitles: {e}")
            import traceback
            traceback.print_exc()
            return []


def _parse_json3(raw: dict) -> list:
    """YouTube json3 자막 포맷을 파싱"""
    subtitles = []
    events = raw.get('events', [])
    
    for event in events:
        # Skip events without segments (metadata lines)
        segs = event.get('segs')
        if not segs:
            continue
        
        start_ms = event.get('tStartMs', 0)
        duration_ms = event.get('dDurationMs', 0)
        end_ms = start_ms + duration_ms
        
        # Combine segment text
        text = ''.join(seg.get('utf8', '') for seg in segs).strip()
        text = text.replace('\n', ' ').strip()
        
        if not text or text == '\n':
            continue
        
        subtitles.append({
            "start_ms": start_ms,
            "end_ms": end_ms if end_ms > start_ms else start_ms + 3000,
            "text_en": text,
            "text_kr": "",
        })
    
    return subtitles


def _parse_vtt(vtt_path: str) -> list:
    """VTT 파일을 파싱"""
    subtitles = []
    
    with open(vtt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple VTT parser
    blocks = content.split('\n\n')
    for block in blocks:
        lines = block.strip().split('\n')
        for i, line in enumerate(lines):
            # Find timestamp line
            if '-->' in line:
                times = line.split('-->')
                start_ms = _vtt_time_to_ms(times[0].strip())
                end_ms = _vtt_time_to_ms(times[1].strip().split(' ')[0])
                text = ' '.join(lines[i+1:]).strip()
                # Remove VTT tags
                text = re.sub(r'<[^>]+>', '', text)
                text = text.replace('\n', ' ').strip()
                
                if text:
                    subtitles.append({
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "text_en": text,
                        "text_kr": "",
                    })
                break
    
    return subtitles


def _vtt_time_to_ms(time_str: str) -> int:
    """VTT 타임스탬프를 밀리초로 변환"""
    parts = time_str.replace(',', '.').split(':')
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600000 + int(m) * 60000 + int(float(s) * 1000)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60000 + int(float(s) * 1000)
    return 0


def search_youtube(query: str, max_results: int = 16) -> list:
    """
    YouTube 영상 검색 (yt-dlp extract_flat 활용)
    반환: [{ video_id, title, channel, duration, duration_str, thumbnail, views }]
    """
    if not query or not query.strip():
        query = "TED-Ed english"
    
    query = query.strip()
    
    # If user pasted a direct YouTube URL into the search box, extract its info directly
    vid = extract_video_id(query)
    if vid:
        info = fetch_youtube_info(query)
        if info.get("success"):
            dur = info.get("duration", 0) or 0
            mins = int(dur) // 60
            secs = int(dur) % 60
            return [{
                "video_id": vid,
                "title": info.get("title", "YouTube Video"),
                "channel": info.get("channel", ""),
                "duration": dur,
                "duration_str": f"{mins:02d}:{secs:02d}" if dur else "",
                "thumbnail": info.get("thumbnail") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "views": 0,
            }]

    import yt_dlp

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': 'in_playlist',
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch{max_results}:{query}", download=False)
            entries = res.get("entries", []) if res else []
            
            results = []
            for item in entries:
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
                    "channel": item.get("uploader") or item.get("channel") or "",
                    "duration": duration,
                    "duration_str": dur_str,
                    "thumbnail": thumb,
                    "views": item.get("view_count") or 0,
                })
            return results
    except Exception as e:
        logger.error(f"YouTube search error: {e}")
        return []
