from flask import Blueprint, jsonify, request, Response
import threading
import json
import state
from scraper import run_scraper, run_detail_scraper
from database import db_get_undetailed_ids, db_detail_scrape_status
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


@scrape_bp.route("/api/scrape", methods=["POST"])
def start_scrape():
    if state.is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400
    if not state.current_cookies:
        return jsonify({"error": "No cookies set!"}), 400

    body = request.json or {}
    keywords = [k.strip() for k in body.get("keywords", []) if k.strip()]
    max_scroll = int(body.get("max_scroll", 5))
    auto_sentiment = bool(body.get("auto_sentiment", False))

    if not keywords:
        return jsonify({"error": "No keywords provided"}), 400

    clear_queue()
    thread = threading.Thread(
        target=run_scraper,
        args=(keywords, max_scroll, list(state.current_cookies), auto_sentiment)
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
    return jsonify({
        "is_scraping": state.is_scraping,
        "is_analyzing": state.is_analyzing,
        "total_results": len(state.scrape_results),
        "cookies_loaded": len(state.current_cookies),
        "hf_configured": is_configured(),
    })