from flask import Blueprint, jsonify, request
import threading
import state
from embedder import run_embed_posts, semantic_search, embedding_status, init_embedding_column

embed_bp = Blueprint("embed", __name__)


@embed_bp.route("/api/embed/init", methods=["POST"])
def init_embed():
    """Initialize embedding column in DB."""
    try:
        init_embedding_column()
        return jsonify({"status": "ok", "message": "Embedding column ready"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@embed_bp.route("/api/embed/status")
def embed_status():
    return jsonify(embedding_status())


@embed_bp.route("/api/embed/run", methods=["POST"])
def run_embed():
    """Start embedding generation for unembedded posts."""
    if state.is_scraping:
        return jsonify({"error": "Another task is running"}), 400

    body = request.json or {}
    limit = int(body.get("limit", 100))

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    thread = threading.Thread(target=run_embed_posts, args=(limit,))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "limit": limit})


@embed_bp.route("/api/embed/search", methods=["POST"])
def search():
    """Semantic search — find posts similar to query."""
    body = request.json or {}
    query = body.get("query", "").strip()
    limit = int(body.get("limit", 20))
    session_id = body.get("session_id")

    if not query:
        return jsonify({"error": "Query required"}), 400

    results, error = semantic_search(query, limit, session_id)
    if error:
        return jsonify({"error": error}), 500

    return jsonify({
        "query": query,
        "count": len(results),
        "results": results
    })