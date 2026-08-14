import time
from fastapi import HTTPException
from backend.file_manager import scan_files

_episodes_cache = None
_episodes_cache_time = 0

def get_episodes(force_refresh=False):
    global _episodes_cache, _episodes_cache_time
    now = time.time()
    if force_refresh or _episodes_cache is None or (now - _episodes_cache_time) > 30:
        _episodes_cache = scan_files()
        _episodes_cache_time = now
    return _episodes_cache

def find_episode(ep_key: str):
    episodes = get_episodes()
    ep = next((x for x in episodes if x["ep_key"] == ep_key), None)
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")
    return ep
