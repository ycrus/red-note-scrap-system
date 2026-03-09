from flask import Blueprint, jsonify, Response
from datetime import datetime
import csv
import io
from database import (
    db_analytics_keywords, db_analytics_sentiment,
    db_analytics_top_authors, db_analytics_timeline,
    db_all_results_csv
)

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/api/analytics/keywords")
def analytics_keywords():
    return jsonify(db_analytics_keywords())


@analytics_bp.route("/api/analytics/sentiment")
def analytics_sentiment():
    return jsonify(db_analytics_sentiment())


@analytics_bp.route("/api/analytics/top-authors")
def analytics_top_authors():
    return jsonify(db_analytics_top_authors())


@analytics_bp.route("/api/analytics/timeline")
def analytics_timeline():
    return jsonify(db_analytics_timeline())


@analytics_bp.route("/api/download/csv")
def download_csv():
    rows = db_all_results_csv()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["keyword", "title", "link", "author", "likes", "date",
                     "sentiment", "sentiment_score", "scraped_at"])
    for r in rows:
        writer.writerow(r)
    output.seek(0)
    filename = f"rednote_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )