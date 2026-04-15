from flask import Blueprint, jsonify, request, Response
import threading
import json
import state
from scraper import run_scraper, run_detail_scraper
import os

def get_scraper():
    """Return scraper function based on SCRAPER_PROVIDER env var."""
    provider = os.getenv("SCRAPER_PROVIDER", "playwright").lower()
    if provider == "apify":
        from apify_scraper import run_apify_scraper
        return run_apify_scraper, provider
    return run_scraper, provider
from database import db_get_undetailed_ids, db_detail_scrape_status, db_load_cookies, db_save_cookies
from state import parse_cookie_string, clear_queue

scrape_bp = Blueprint("scrape", __name__)


@scrape_bp.route("/api/cookies", methods=["POST"])
def set_cookies():
    raw = request.json.get("raw", "").strip()
    if not raw:
        return jsonify({"error": "No cookie string provided"}), 400
    state.current_cookies = parse_cookie_string(raw)
    return jsonify({
        "status": "ok",
        "count": len(state.current_cookies),
        "keys": [c["name"] for c in state.current_cookies]
    })


@scrape_bp.route("/api/cookies", methods=["GET"])
def get_cookies():
    return jsonify({
        "count": len(state.current_cookies),
        "keys": [c["name"] for c in state.current_cookies]
    })


@scrape_bp.route("/api/cookies/login", methods=["POST"])
def browser_login():
    """Open a real browser window for manual login, then auto-save cookies."""
    if state.is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400
    from browser_login import run_browser_login
    clear_queue()
    state.is_scraping = True
    thread = threading.Thread(target=run_browser_login)
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started"})


@scrape_bp.route("/api/cookies/chrome-status", methods=["GET"])
def chrome_status():
    """Cek apakah Chrome running dengan debug port."""
    from browser_login import is_chrome_running, CHROME_DEBUG_PORT
    running = is_chrome_running()
    return jsonify({"running": running, "port": CHROME_DEBUG_PORT})


@scrape_bp.route("/api/cookies/reload", methods=["POST"])
def reload_cookies():
    """Reload cookies from DB into memory (useful after Flask restart)."""
    raw = db_load_cookies()
    if not raw:
        return jsonify({"error": "No saved cookies in database"}), 404
    state.current_cookies = parse_cookie_string(raw)
    return jsonify({
        "status": "ok",
        "count": len(state.current_cookies),
        "keys": [c["name"] for c in state.current_cookies]
    })


@scrape_bp.route("/api/scrape", methods=["POST"])
def start_scrape():
    if state.is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400

    provider = os.getenv("SCRAPER_PROVIDER", "playwright").lower()
    if provider != "apify" and not state.current_cookies:
        return jsonify({"error": "No cookies set!"}), 400

    body = request.json or {}
    keywords = [k.strip() for k in body.get("keywords", []) if k.strip()]
    max_posts = int(body.get("max_posts", 50))
    auto_sentiment = bool(body.get("auto_sentiment", False))
    min_likes = int(body.get("min_likes", 0))
    scrape_detail = bool(body.get("scrape_detail", False))

    if not keywords:
        return jsonify({"error": "No keywords provided"}), 400

    scraper_fn, provider = get_scraper()
    state.push_log(f"   Provider: {provider}")

    clear_queue()
    if provider == "apify":
        thread = threading.Thread(
            target=scraper_fn,
            args=(keywords, max_posts, auto_sentiment, min_likes)
        )
    else:
        thread = threading.Thread(
            target=scraper_fn,
            args=(keywords, max_posts, list(state.current_cookies), auto_sentiment, min_likes, scrape_detail)
        )
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "keywords": keywords})


@scrape_bp.route("/api/scrape/detail", methods=["POST"])
def start_detail_scrape():
    if state.is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400
    if not state.current_cookies:
        return jsonify({"error": "No cookies set!"}), 400

    body = request.json or {}
    limit = int(body.get("limit", 20))
    session_id = body.get("session_id")

    rows = db_get_undetailed_ids(limit, session_id)
    ids = [r[0] for r in rows]
    if not ids:
        return jsonify({"error": "No posts to scrape details for"}), 400

    clear_queue()
    state.is_scraping = True
    thread = threading.Thread(target=run_detail_scraper, args=(ids, list(state.current_cookies)))
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "count": len(ids)})


@scrape_bp.route("/api/scrape/detail/status")
def detail_status():
    return jsonify(db_detail_scrape_status(state.is_scraping))


@scrape_bp.route("/api/stream")
def stream():
    def event_stream():
        while True:
            try:
                import queue as q
                item = state.log_queue.get(timeout=30)
                yield f"data: {json.dumps(item)}\n\n"
                if item.get("type") == "done":
                    break
            except Exception:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@scrape_bp.route("/api/results")
def get_results():
    return jsonify(state.scrape_results)


@scrape_bp.route("/api/status")
def status():
    from sentiment import is_configured
    provider = os.getenv("SCRAPER_PROVIDER", "playwright").lower()
    return jsonify({
        "is_scraping": state.is_scraping,
        "is_analyzing": state.is_analyzing,
        "total_results": len(state.scrape_results),
        "cookies_loaded": len(state.current_cookies),
        "hf_configured": is_configured(),
        "scraper_provider": provider,
    })


@scrape_bp.route("/api/provider", methods=["GET"])
def get_provider():
    provider = os.getenv("SCRAPER_PROVIDER", "playwright").lower()
    from apify_scraper import is_configured as apify_ok, APIFY_ACTOR_ID
    return jsonify({
        "provider": provider,
        "apify_configured": apify_ok(),
        "apify_actor": APIFY_ACTOR_ID,
    })


@scrape_bp.route("/api/provider", methods=["POST"])
def set_provider():
    """Switch scraper provider at runtime (updates os.environ, not .env file)."""
    body = request.json or {}
    provider = body.get("provider", "playwright").lower()
    if provider not in ("playwright", "apify"):
        return jsonify({"error": "Invalid provider. Use 'playwright' or 'apify'"}), 400
    os.environ["SCRAPER_PROVIDER"] = provider
    return jsonify({"status": "ok", "provider": provider})