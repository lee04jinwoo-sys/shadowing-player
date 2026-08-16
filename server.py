import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load env variables
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ShadowingPlayer")

app = FastAPI(title="Modern Family Shadowing Player")

# CORS setup to allow Mac and iPad connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from backend.routers import video, subtitle, anki, ai, youtube, export

# Include routers
app.include_router(video.router)
app.include_router(subtitle.router)
app.include_router(anki.router)
app.include_router(ai.router)
app.include_router(youtube.router)
app.include_router(export.router)

# Mount static files (CRITICAL for CSS/JS to work)
app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js", StaticFiles(directory="frontend/js"), name="js")

@app.api_route("/", methods=["GET", "HEAD"])
def read_root():
    return FileResponse(os.path.join("frontend", "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
