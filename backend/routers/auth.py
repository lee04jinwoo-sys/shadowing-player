"""
Google OAuth 2.0 Authentication Router for YouTube Subscriptions
"""
import json
import logging
import urllib.parse
import urllib.request
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from backend.app_dirs import load_settings, save_settings
from backend.youtube_subscriptions import fetch_user_subscriptions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/google")

# Standard YouTube Readonly Scope
YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"


class DirectTokenRequest(BaseModel):
    access_token: str


class ClientCredentialsRequest(BaseModel):
    client_id: str
    client_secret: str


@router.get("/status")
def get_auth_status():
    """현재 Google 계정 연동 상태 확인"""
    settings = load_settings()
    access_token = settings.get("google_access_token", "")
    email = settings.get("google_account_email", "")
    cached_channels = settings.get("google_subscribed_channels", [])

    is_authenticated = bool(access_token)
    return {
        "authenticated": is_authenticated,
        "email": email or ("연동됨" if is_authenticated else ""),
        "channels_count": len(cached_channels),
        "has_client_id": bool(settings.get("google_client_id")),
    }


@router.get("/url")
def get_google_auth_url(request: Request):
    """Google OAuth 2.0 인가 URL 생성"""
    settings = load_settings()
    client_id = settings.get("google_client_id", "")
    
    if not client_id:
        return {
            "success": False,
            "error": "Google Client ID가 설정되지 않았습니다. [설정] 메뉴에서 Google Client ID를 입력해 주세요.",
            "auth_url": None,
        }

    # Redirect URI based on current host
    host = request.headers.get("host", "localhost:8000")
    redirect_uri = f"http://{host}/api/auth/google/callback"

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": YOUTUBE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"success": True, "auth_url": auth_url}


@router.get("/callback")
def google_oauth_callback(code: Optional[str] = None, error: Optional[str] = None, request: Request = None):
    """Google OAuth 인가 코드 수신 및 Access Token 교환"""
    if error or not code:
        return HTMLResponse(
            f"<html><body><h3>Google 연동 취소 또는 실패: {error or 'No code'}</h3><script>setTimeout(() => window.close(), 3000);</script></body></html>"
        )

    settings = load_settings()
    client_id = settings.get("google_client_id", "")
    client_secret = settings.get("google_client_secret", "")
    
    host = request.headers.get("host", "localhost:8000") if request else "localhost:8000"
    redirect_uri = f"http://{host}/api/auth/google/callback"

    try:
        # Exchange code for token
        data = urllib.parse.urlencode({
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }).encode("utf-8")

        req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, headers={
            "Content-Type": "application/x-www-form-urlencoded"
        })

        with urllib.request.urlopen(req, timeout=10) as resp:
            token_res = json.loads(resp.read().decode("utf-8"))

        access_token = token_res.get("access_token")
        refresh_token = token_res.get("refresh_token")

        if not access_token:
            raise Exception("Access token not found in Google response")

        # Save tokens
        settings["google_access_token"] = access_token
        if refresh_token:
            settings["google_refresh_token"] = refresh_token

        # Fetch subscriptions immediately and cache English channels
        english_channels = fetch_user_subscriptions(access_token)
        settings["google_subscribed_channels"] = english_channels
        save_settings(settings)

        return HTMLResponse("""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Google 연동 완료</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #fff;">
          <h2 style="color: #6366f1;">Google 계정 연동이 완료되었습니다!</h2>
          <p>영어 구독 채널을 성공적으로 불러왔습니다. 창이 곧 닫힙니다...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              setTimeout(() => window.close(), 1500);
            } else {
              setTimeout(() => { window.location.href = '/'; }, 1500);
            }
          </script>
        </body>
        </html>
        """)

    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}")
        return HTMLResponse(f"<html><body><h3>토큰 교환 실패: {e}</h3></body></html>")


@router.post("/token")
def set_direct_token(req: DirectTokenRequest):
    """직접 발급받은 Access Token을 저장하고 구독 채널을 즉시 조회"""
    token = req.access_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="토큰이 비어있습니다.")

    english_channels = fetch_user_subscriptions(token)
    if not english_channels and not token.startswith("ya29."):
        raise HTTPException(status_code=400, detail="유효한 Google OAuth 토큰이 아니거나 구독 채널을 불러올 수 없습니다.")

    settings = load_settings()
    settings["google_access_token"] = token
    settings["google_subscribed_channels"] = english_channels
    save_settings(settings)

    return {
        "success": True,
        "message": f"성공적으로 {len(english_channels)}개의 영문 구독 채널을 불러왔습니다.",
        "channels": english_channels,
    }


@router.post("/credentials")
def save_client_credentials(req: ClientCredentialsRequest):
    """Google OAuth Client ID & Secret 저장"""
    settings = load_settings()
    settings["google_client_id"] = req.client_id.strip()
    settings["google_client_secret"] = req.client_secret.strip()
    save_settings(settings)
    return {"success": True, "message": "Google OAuth 설정이 저장되었습니다."}


@router.post("/logout")
def logout_google():
    """Google 연동 해제"""
    settings = load_settings()
    settings.pop("google_access_token", None)
    settings.pop("google_refresh_token", None)
    settings.pop("google_account_email", None)
    settings.pop("google_subscribed_channels", None)
    save_settings(settings)
    return {"success": True, "message": "Google 계정 연동이 해제되었습니다."}
