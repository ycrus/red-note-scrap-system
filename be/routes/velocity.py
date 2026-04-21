from flask import Blueprint, jsonify, request
import threading
import state
from velocity_detector import (
    run_spike_detection, get_spike_events,
    get_spike_stats, init_spike_table
)

velocity_bp = Blueprint("velocity", __name__)


@velocity_bp.route("/api/velocity/init", methods=["POST"])
def init_velocity():
    try:
        init_spike_table()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@velocity_bp.route("/api/velocity/analyze", methods=["POST"])
def start_analysis():
    if state.is_scraping:
        return jsonify({"error": "Another task is running"}), 400

    body = request.json or {}
    session_id    = body.get("session_id")
    lookback_hours = int(body.get("lookback_hours", 24))

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    thread = threading.Thread(
        target=run_spike_detection,
        args=(session_id, lookback_hours)
    )
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "session_id": session_id, "lookback_hours": lookback_hours})


@velocity_bp.route("/api/velocity/events")
@velocity_bp.route("/api/velocity/events/<int:session_id>")
def get_events(session_id=None):
    limit = int(request.args.get("limit", 100))
    return jsonify(get_spike_events(session_id, limit))


@velocity_bp.route("/api/velocity/stats")
def stats():
    return jsonify(get_spike_stats())