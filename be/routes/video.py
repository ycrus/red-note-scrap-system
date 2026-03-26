from flask import Blueprint, jsonify, Response, request, stream_with_context
import requests as http_requests
from database import engine, db_load_cookies
from state import parse_cookie_string
from sqlalchemy import text

video_bp = Blueprint("video", __name__)


def get_cookie_header():
    raw = db_load_cookies()
    if not raw:
        return {}
    cookies = parse_cookie_string(raw)
    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies
                            if c.get('domain', '').endswith('rednote.com')])
    return {"Cookie": cookie_str}


@video_bp.route("/api/video/<int:result_id>")
def get_video_url(result_id):
    """Return video URL for a post."""
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT video_url FROM results WHERE id = :id"
        ), {"id": result_id}).fetchone()

    if not row or not row[0]:
        return jsonify({"error": "No video found"}), 404

    return jsonify({"result_id": result_id, "video_url": row[0]})


@video_bp.route("/api/video/proxy")
def proxy_video():
    """
    Proxy video stream dari CDN RedNote dengan cookies.
    Usage: /api/video/proxy?url=<encoded_video_url>
    """
    video_url = request.args.get("url")
    if not video_url:
        return jsonify({"error": "url required"}), 400

    # Hanya izinkan domain RedNote
    allowed = ["rednotecdn.com", "xhscdn.com", "xiaohongshu.com"]
    if not any(d in video_url for d in allowed):
        return jsonify({"error": "Invalid domain"}), 403

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.rednote.com/",
        "Accept": "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
        **get_cookie_header()
    }

    # Support range requests untuk video seeking
    if "Range" in request.headers:
        headers["Range"] = request.headers["Range"]

    try:
        resp = http_requests.get(
            video_url,
            headers=headers,
            stream=True,
            timeout=30
        )

        # Forward headers
        response_headers = {
            "Content-Type": resp.headers.get("Content-Type", "video/mp4"),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        }
        if "Content-Length" in resp.headers:
            response_headers["Content-Length"] = resp.headers["Content-Length"]
        if "Content-Range" in resp.headers:
            response_headers["Content-Range"] = resp.headers["Content-Range"]

        status_code = resp.status_code

        def generate():
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return Response(
            stream_with_context(generate()),
            status=status_code,
            headers=response_headers
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500