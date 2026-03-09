from flask import Blueprint, jsonify, request
import threading
import state
from bot_detector import run_bot_detection
from database import (
    db_get_authors_for_bot_check,
    db_bot_detection_status,
    db_get_bot_summary
)

bot_bp = Blueprint("bot", __name__)


@bot_bp.route("/api/bot/analyze", methods=["POST"])
def start_bot_detection():
    if state.is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400
    if not state.current_cookies:
        return jsonify({"error": "No cookies set!"}), 400

    body = request.json or {}
    limit = int(body.get("limit", 10))
    session_id = body.get("session_id")

    authors_map = db_get_authors_for_bot_check(limit, session_id)
    if not authors_map:
        return jsonify({"error": "No authors to check — all already analyzed"}), 400

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    thread = threading.Thread(
        target=run_bot_detection,
        args=(authors_map, list(state.current_cookies))
    )
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "authors": len(authors_map)})


@bot_bp.route("/api/bot/status")
def bot_status():
    return jsonify(db_bot_detection_status())


@bot_bp.route("/api/bot/summary")
def bot_summary():
    return jsonify(db_get_bot_summary())