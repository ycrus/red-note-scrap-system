from flask import Blueprint, jsonify, request
import threading
import state
from image_downloader import (
    run_image_downloader, image_download_status,
    init_images_table, get_post_images
)

image_bp = Blueprint("image", __name__)


@image_bp.route("/api/images/init", methods=["POST"])
def init_images():
    try:
        init_images_table()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@image_bp.route("/api/images/status")
def img_status():
    return jsonify(image_download_status())


@image_bp.route("/api/images/download", methods=["POST"])
def start_download():
    if state.is_scraping:
        return jsonify({"error": "Another task is running"}), 400

    body = request.json or {}
    limit = int(body.get("limit", 50))
    session_id = body.get("session_id")

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    thread = threading.Thread(target=run_image_downloader, args=(limit, session_id))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "limit": limit})


@image_bp.route("/api/images/<int:result_id>")
def get_images(result_id):
    images = get_post_images(result_id)
    return jsonify({"result_id": result_id, "images": images})