import os
import glob
import logging
from backend.subtitle_fetcher import fetch_subtitles_for_video

logging.basicConfig(level=logging.INFO)

def download_all():
    videos_dir = os.path.join(os.path.dirname(__file__), "..", "..", "videos")
    videos = glob.glob(os.path.join(videos_dir, "*.mp4")) + glob.glob(os.path.join(videos_dir, "*.avi"))
    
    print(f"Found {len(videos)} videos. Starting batch download...")
    success_count = 0
    for video in sorted(videos):
        print(f"Processing: {os.path.basename(video)}")
        if fetch_subtitles_for_video(video):
            success_count += 1
            print(f"SUCCESS: {os.path.basename(video)}")
        else:
            print(f"FAILED: {os.path.basename(video)}")
            
    print(f"Batch download complete. Successfully downloaded {success_count} / {len(videos)} subtitles.")

if __name__ == "__main__":
    download_all()
