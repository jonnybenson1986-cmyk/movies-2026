"""Small OpenTune catalogue API for StreamBox.

Searches the public YouTube Music catalogue with ytmusicapi. Playback is performed
by YouTube's official embedded player in the client; this service never downloads
or proxies audio.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from ytmusicapi import YTMusic

PORT = int(os.environ.get("PORT", "8000"))
ALLOWED_ORIGINS = {x.strip() for x in os.environ.get("ALLOWED_ORIGINS", "").split(",") if x.strip()}

def search_music(query):
    rows = YTMusic().search(query, filter="songs", limit=25)
    results = []
    for item in rows:
        video_id = item.get("videoId")
        if not video_id:
            continue
        artists = item.get("artists") or []
        thumbnails = item.get("thumbnails") or []
        results.append({
            "videoId": video_id,
            "title": item.get("title") or "Unknown",
            "artist": ", ".join(a.get("name", "") for a in artists),
            "duration": item.get("duration", ""),
            "thumbnail": thumbnails[-1].get("url", "") if thumbnails else "",
        })
    return results

class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        origin = self.headers.get("Origin", "")
        if origin and (not ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        if origin and ALLOWED_ORIGINS and origin not in ALLOWED_ORIGINS:
            return self.send_json({"error": "Origin not allowed"}, 403)
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self.send_json({"ok": True, "service": "StreamBox OpenTune"})
        if parsed.path != "/api/search":
            return self.send_json({"error": "Not found"}, 404)
        query = (parse_qs(parsed.query).get("q") or [""])[0].strip()
        if not query:
            return self.send_json({"results": []})
        if len(query) > 200:
            return self.send_json({"error": "Search query is too long"}, 400)
        try:
            return self.send_json({"results": search_music(query)})
        except Exception:
            return self.send_json({"error": "YouTube Music search is temporarily unavailable"}, 502)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
