from flask import Blueprint, jsonify, request
import threading
import state
from framing_classifier import (
    run_framing_analysis, framing_status,
    get_framing_results, get_framing_summary,
    init_framing_table, is_configured
)

framing_bp = Blueprint("framing", __name__)


@framing_bp.route("/api/framing/init", methods=["POST"])
def init_framing():
    try:
        init_framing_table()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@framing_bp.route("/api/framing/status")
def get_status():
    return jsonify({**framing_status(), "configured": is_configured()})


@framing_bp.route("/api/framing/analyze", methods=["POST"])
def start_analysis():
    if state.is_scraping:
        return jsonify({"error": "Another task is running"}), 400
    if not is_configured():
        return jsonify({"error": "GROQ_API_KEY not set in .env — get free key at https://console.groq.com"}), 400

    body = request.json or {}
    limit      = int(body.get("limit", 50))
    session_id = body.get("session_id")

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    thread = threading.Thread(target=run_framing_analysis, args=(limit, session_id))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "limit": limit, "session_id": session_id})


@framing_bp.route("/api/framing/results")
@framing_bp.route("/api/framing/results/<int:session_id>")
def get_results(session_id=None):
    min_risk = int(request.args.get("min_risk", 0))
    limit    = int(request.args.get("limit", 100))
    return jsonify(get_framing_results(session_id, min_risk, limit))


@framing_bp.route("/api/framing/summary")
@framing_bp.route("/api/framing/summary/<int:session_id>")
def get_summary(session_id=None):
    return jsonify(get_framing_summary(session_id))