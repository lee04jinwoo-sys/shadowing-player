"""Keeps Shadowing Player reachable only from this Mac's own browser tab.

The server already binds to 127.0.0.1, but a web page open in the same browser
can still send requests to localhost. This middleware refuses:
- a Host header that is not a loopback name (DNS rebinding),
- an Origin header from another site,
- a cross-site fetch (Sec-Fetch-Site: cross-site) that is not a top-level
  navigation. Navigations stay allowed so the Google OAuth redirect works.
"""
from urllib.parse import urlsplit

from starlette.responses import PlainTextResponse

LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _hostname(host_header: str) -> str:
    """'localhost:8080' -> 'localhost', '[::1]:8080' -> '::1'."""
    return (urlsplit(f"//{host_header}").hostname or "").lower()


def is_loopback_origin(origin: str) -> bool:
    parts = urlsplit(origin)
    return parts.scheme in ("http", "https") and (parts.hostname or "").lower() in LOOPBACK_HOSTS


class LocalOnlyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        reason = self._refusal_reason(headers)
        if reason:
            return await PlainTextResponse(f"Forbidden: {reason}", status_code=403)(scope, receive, send)
        return await self.app(scope, receive, send)

    @staticmethod
    def _refusal_reason(headers: dict) -> str:
        if _hostname(headers.get("host", "")) not in LOOPBACK_HOSTS:
            return "host"
        origin = headers.get("origin")
        if origin and not is_loopback_origin(origin):  # "null" (sandboxed page) is refused too
            return "origin"
        if headers.get("sec-fetch-site") == "cross-site" and headers.get("sec-fetch-mode") != "navigate":
            return "cross-site"
        return ""
