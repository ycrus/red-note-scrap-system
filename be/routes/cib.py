from flask import Blueprint, jsonify, request
import threading
import state
from coordinated_detector import (
    run_cib_detection, get_cib_summary,
    get_cib_stats, init_coordinated_tables
)

cib_bp = Blueprint("cib", __name__)


@cib_bp.route("/api/cib/init", methods=["POST"])
def init_cib():
    try:
        init_coordinated_tables()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cib_bp.route("/api/cib/analyze", methods=["POST"])
def start_cib():
    if state.is_scraping:
        return jsonify({"error": "Another task is running"}), 400

    body = request.json or {}
    session_id = body.get("session_id")

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    thread = threading.Thread(target=run_cib_detection, args=(session_id,))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "session_id": session_id})


@cib_bp.route("/api/cib/events")
@cib_bp.route("/api/cib/events/<int:session_id>")
def get_events(session_id=None):
    return jsonify(get_cib_summary(session_id))


@cib_bp.route("/api/cib/stats")
def stats():
    return jsonify(get_cib_stats())