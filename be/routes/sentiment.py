from flask import Blueprint, jsonify, request
import threading
import state
from sentiment import analyze_batch, is_configured
from database import db_get_unanalyzed_ids, db_sentiment_status

sentiment_bp = Blueprint("sentiment", __name__)


@sentiment_bp.route("/api/sentiment/analyze", methods=["POST"])
def manual_sentiment():
    if state.is_analyzing:
        return jsonify({"error": "Analysis already running"}), 400
    if not is_configured():
        return jsonify({"error": "HUGGINGFACE_API_KEY not set in .env"}), 400

    limit = int((request.json or {}).get("limit", 50))

    def run_analysis():
        state.is_analyzing = True
        try:
            ids = db_get_unanalyzed_ids(limit)
            if not ids:
                return
            updated = analyze_batch(ids)
            print(f"✅ Sentiment analyzed: {updated}/{len(ids)}")
        finally:
            state.is_analyzing = False

    thread = threading.Thread(target=run_analysis)
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "message": f"Analyzing up to {limit} results"})


@sentiment_bp.route("/api/sentiment/status")
def sentiment_status():
    return jsonify(db_sentiment_status(state.is_analyzing))