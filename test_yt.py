import json
import glob
from backend.youtube_fetcher import fetch_youtube_subtitles
import os

for f in glob.glob("cache/yt_q9*"):
    os.remove(f)

subs = fetch_youtube_subtitles("q9-W1_7t_Xo")
print(json.dumps(subs[:5], indent=2))
