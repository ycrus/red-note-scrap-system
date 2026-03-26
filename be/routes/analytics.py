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


@analytics_bp.route("/api/download/json")
@analytics_bp.route("/api/download/json/<int:session_id>")
def download_json(session_id=None):
    """
    Export semua hasil scraping sebagai JSON lengkap:
    title, content, comments (+ replies), images base64, video_url, dll.
    Opsional filter per session_id.
    """
    import json
    from database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        if session_id:
            rows = conn.execute(text("""
                SELECT id, keyword, title, link, author, likes, post_date,
                       sentiment, sentiment_score, content, comments_count,
                       images, tags, video_url, detail_scraped, scraped_at,
                       session_id
                FROM results
                WHERE session_id = :sid
                ORDER BY id
            """), {"sid": session_id}).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT id, keyword, title, link, author, likes, post_date,
                       sentiment, sentiment_score, content, comments_count,
                       images, tags, video_url, detail_scraped, scraped_at,
                       session_id
                FROM results
                ORDER BY id
            """)).fetchall()

        # Ambil semua komentar sekaligus (lebih efisien)
        result_ids = [r[0] for r in rows]
        comments_map = {}
        if result_ids:
            crows = conn.execute(text("""
                SELECT result_id, username, content, likes, posted_at,
                       parent_username, is_reply
                FROM comments
                WHERE result_id = ANY(:ids)
                ORDER BY result_id, id
            """), {"ids": result_ids}).fetchall()
            for c in crows:
                rid = c[0]
                if rid not in comments_map:
                    comments_map[rid] = []
                comments_map[rid].append({
                    "username": c[1],
                    "content": c[2],
                    "likes": c[3],
                    "posted_at": c[4],
                    "parent_username": c[5],
                    "is_reply": c[6],
                })

        # Ambil semua images base64 sekaligus
        images_map = {}
        if result_ids:
            irows = conn.execute(text("""
                SELECT result_id, image_index, url, base64_data
                FROM post_images
                WHERE result_id = ANY(:ids)
                ORDER BY result_id, image_index
            """), {"ids": result_ids}).fetchall()
            for img in irows:
                rid = img[0]
                if rid not in images_map:
                    images_map[rid] = []
                images_map[rid].append({
                    "index": img[1],
                    "url": img[2],
                    "base64": img[3],
                })

    # Build output
    results = []
    for r in rows:
        rid = r[0]
        results.append({
            "id": rid,
            "session_id": r[16],
            "keyword": r[1],
            "title": r[2],
            "link": r[3],
            "author": r[4],
            "likes": r[5],
            "date": r[6],
            "sentiment": r[7],
            "sentiment_score": float(r[8]) if r[8] else None,
            "content": r[9],
            "comments_count": r[10],
            "image_urls": r[11] or [],
            "tags": r[12] or [],
            "video_url": r[13],
            "detail_scraped": r[14],
            "scraped_at": r[15].isoformat() if r[15] else None,
            "comments": comments_map.get(rid, []),
            "images_base64": images_map.get(rid, []),
        })

    output = json.dumps({
        "exported_at": datetime.now().isoformat(),
        "total": len(results),
        "session_id": session_id,
        "results": results,
    }, ensure_ascii=False, indent=2)

    filename = f"rednote_full_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if session_id:
        filename += f"_session{session_id}"
    filename += ".json"

    return Response(
        output,
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )