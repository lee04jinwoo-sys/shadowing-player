import os
import re
import glob
import logging

logger = logging.getLogger(__name__)

# Local project videos directory
MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "videos")

def scan_files() -> list:
    """
    Scans the local media directory and groups video files with their matching subtitles
    based on Season and Episode markers (e.g. S01E01).
    """
    if not os.path.exists(MEDIA_DIR):
        logger.warning(f"Media directory not found: {MEDIA_DIR}")
        return []

    # Scan for video files (supporting both converted mp4 and raw avi)
    videos = glob.glob(os.path.join(MEDIA_DIR, "*.mp4")) + glob.glob(os.path.join(MEDIA_DIR, "*.avi"))
    subtitles = glob.glob(os.path.join(MEDIA_DIR, "*.smi")) + glob.glob(os.path.join(MEDIA_DIR, "*.srt"))

    # Map subtitles by episode key (e.g., s01e01)
    sub_map = {}
    ep_pattern = re.compile(r'(?i)s(\d{2})e(\d{2})')
    
    for sub_path in subtitles:
        match = ep_pattern.search(os.path.basename(sub_path))
        if match:
            ep_key = f"s{match.group(1).lower()}e{match.group(2).lower()}"
            sub_map.setdefault(ep_key, []).append(sub_path)

    episode_list = []
    # Using a set to avoid duplicates if both .mp4 and .avi exist for the same episode
    processed_eps = set()

    for video_path in sorted(videos):
        filename = os.path.basename(video_path)
        match = ep_pattern.search(filename)
        if not match:
            continue
            
        ep_key = f"s{match.group(1).lower()}e{match.group(2).lower()}"
        ext = os.path.splitext(filename)[1][1:].lower()

        # If we have both .mp4 and .avi, prefer .mp4
        if ep_key in processed_eps and ext == "avi":
            continue
        
        # If we encounter .mp4, it should replace the .avi entry if it exists
        if ext == "mp4":
            # Remove existing avi entry for the same episode if any
            episode_list = [ep for ep in episode_list if ep["ep_key"] != ep_key]
            
        processed_eps.add(ep_key)

        matched_subs = sub_map.get(ep_key, [])
        sub_list = []
        for ms in matched_subs:
            sub_list.append({
                "file_path": ms,
                "filename": os.path.basename(ms),
                "format": os.path.splitext(ms)[1][1:].lower()
            })

        episode_list.append({
            "ep_key": ep_key,
            "video_path": video_path,
            "video_filename": filename,
            "format": ext,
            "subtitles": sub_list
        })

    # Sort episodes by key
    return sorted(episode_list, key=lambda x: x["ep_key"])
