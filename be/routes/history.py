from flask import Blueprint, jsonify
from database import db_get_history, db_get_session_results, db_get_result_detail

history_bp = Blueprint("history", __name__)


@history_bp.route("/api/history")
def get_history():
    return jsonify(db_get_history())


@history_bp.route("/api/history/<int:session_id>")
def get_session_results(session_id):
    return jsonify(db_get_session_results(session_id))


@history_bp.route("/api/results/<int:result_id>/detail")
def get_result_detail(result_id):
    data = db_get_result_detail(result_id)
    if not data:
        return jsonify({"error": "Not found"}), 404
    return jsonify(data)