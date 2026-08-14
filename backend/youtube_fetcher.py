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

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def extract_video_id(url: str) -> str | None:
    """YouTube URL에서 video ID를 추출"""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def fetch_youtube_info(url: str) -> dict:
    """영상 메타데이터 (제목, ID, 길이, 썸네일) 반환"""
    import yt_dlp
    
    video_id = extract_video_id(url)
    if not video_id:
        return {"success": False, "error": "Invalid YouTube URL"}
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
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
    
    url = f"https://www.youtube.com/watch?v={video_id}"
    
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
                
                if not subs_data:
                    logger.warning("No English subtitles found, trying download method")
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
                        for fname in os.listdir(tmpdir):
                            if '.en.' in fname:
                                logger.info(f"Found subtitle file: {fname}")
                        return []
                else:
                    # Download the specific subtitle URL
                    subtitle_url = subs_data['url']
                    req = urllib.request.Request(subtitle_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req) as resp:
                        raw = json.loads(resp.read().decode('utf-8'))
                    subtitles = _parse_json3(raw)
                
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
