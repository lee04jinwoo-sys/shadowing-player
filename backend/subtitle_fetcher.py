import os
import logging
from babelfish import Language
from subliminal import download_best_subtitles, region, save_subtitles, scan_video

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure subliminal cache to speed up searches
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)
region.configure('dogpile.cache.dbm', arguments={'filename': os.path.join(CACHE_DIR, 'subliminal_cache.dbm')})

def fetch_subtitles_for_video(video_path: str) -> bool:
    """
    Searches and downloads the best English and Korean subtitles for a given video file.
    Saves them as .en.srt and .ko.srt in the same directory as the video.
    Returns True if at least one subtitle was downloaded.
    """
    if not os.path.exists(video_path):
        logger.error(f"Video file not found: {video_path}")
        return False
        
    try:
        logger.info(f"Scanning video: {video_path}")
        video = scan_video(video_path)
        
        # Languages we want
        languages = {Language('eng')}
        
        # Download best subtitles
        logger.info(f"Downloading subtitles for {languages}...")
        subtitles = download_best_subtitles([video], languages, providers=['opensubtitles', 'addic7ed', 'tvsubtitles', 'podnapisi'])
        
        if video in subtitles and subtitles[video]:
            saved_subs = save_subtitles(video, subtitles[video])
            logger.info(f"Saved {len(saved_subs)} subtitles.")
            return True
        else:
            logger.warning("No subtitles found.")
            return False
            
    except Exception as e:
        logger.error(f"Error fetching subtitles for {video_path}: {e}")
        return False
