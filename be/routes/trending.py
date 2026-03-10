from flask import Blueprint, jsonify
import threading
import state
from trending_scraper import run_trending_scraper
from database import db_get_trending, db_trending_last_scraped, db_hashtags_from_results, db_topics_from_results

trending_bp = Blueprint("trending", __name__)


@trending_bp.route("/api/trending/scrape", methods=["POST"])
def start_trending_scrape():
    if state.is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400

    from state import clear_queue
    clear_queue()
    state.is_scraping = True

    cookies = list(state.current_cookies) if state.current_cookies else None

    thread = threading.Thread(target=run_trending_scraper, args=(cookies,))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "live": cookies is not None})


@trending_bp.route("/api/trending")
def get_trending():
    """Trending dari tabel trending (hasil scrape explore)."""
    data = db_get_trending(limit=30)
    last = db_trending_last_scraped()
    return jsonify({"trending": data, "last_scraped": last})


@trending_bp.route("/api/trending/hashtags")
def get_db_hashtags():
    """Hashtag yang paling banyak muncul di hasil scraping kita."""
    data = db_hashtags_from_results(limit=40)
    return jsonify({"hashtags": data})


@trending_bp.route("/api/trending/topics")
def get_db_topics():
    """Kata/topik yang paling sering muncul di judul post."""
    data = db_topics_from_results(limit=30)
    return jsonify({"topics": data})