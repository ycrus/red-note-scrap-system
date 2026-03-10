from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()

# ── ENGINE ───────────────────────────────────────────
DB_URL = (
    f"postgresql://{os.getenv('DB_USER', 'postgres')}:"
    f"{os.getenv('DB_PASSWORD', '')}@"
    f"{os.getenv('DB_HOST', 'localhost')}:"
    f"{os.getenv('DB_PORT', '5432')}/"
    f"{os.getenv('DB_NAME', 'rednote_db')}"
)

engine = create_engine(DB_URL)


# ── INIT ─────────────────────────────────────────────
def init_db():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS scrape_sessions (
                id SERIAL PRIMARY KEY,
                keywords TEXT[],
                max_scroll INTEGER,
                total_results INTEGER DEFAULT 0,
                started_at TIMESTAMP DEFAULT NOW(),
                finished_at TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS results (
                id SERIAL PRIMARY KEY,
                session_id INTEGER REFERENCES scrape_sessions(id),
                keyword TEXT,
                title TEXT,
                link TEXT UNIQUE,
                author TEXT,
                likes TEXT,
                post_date TEXT,
                sentiment TEXT,
                sentiment_score FLOAT,
                scraped_at TIMESTAMP DEFAULT NOW()
            )
        """))
        for col in [
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS sentiment TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS sentiment_score FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS content TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS comments_count TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS images TEXT[]",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS tags TEXT[]",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS detail_scraped BOOLEAN DEFAULT FALSE",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS bot_score INTEGER",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS bot_label TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS bot_breakdown JSONB",
        ]:
            try:
                conn.execute(text(col))
            except:
                pass
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """))
        conn.commit()
    print("✅ Database ready")


# ── SESSION QUERIES ──────────────────────────────────
def db_save_session(keywords, max_scroll):
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO scrape_sessions (keywords, max_scroll)
            VALUES (:kw, :ms) RETURNING id
        """), {"kw": keywords, "ms": max_scroll})
        conn.commit()
        return result.fetchone()[0]


def db_finish_session(session_id, total):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE scrape_sessions
            SET finished_at = NOW(), total_results = :total
            WHERE id = :sid
        """), {"total": total, "sid": session_id})
        conn.commit()


def db_get_history(limit=50):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, keywords, max_scroll, total_results, started_at, finished_at
            FROM scrape_sessions ORDER BY started_at DESC LIMIT :lim
        """), {"lim": limit}).fetchall()
    return [{
        "id": r[0], "keywords": r[1], "max_scroll": r[2],
        "total_results": r[3],
        "started_at": r[4].isoformat() if r[4] else None,
        "finished_at": r[5].isoformat() if r[5] else None,
    } for r in rows]


# ── RESULT QUERIES ───────────────────────────────────
def db_save_result(session_id, row):
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO results (session_id, keyword, title, link, author, likes, post_date, sentiment, sentiment_score)
            VALUES (:sid, :kw, :title, :link, :author, :likes, :date, :sentiment, :score)
            ON CONFLICT (link) DO UPDATE SET title = EXCLUDED.title
            RETURNING id
        """), {
            "sid": session_id,
            "kw": row["keyword"],
            "title": row["title"],
            "link": row["link"],
            "author": row["author"],
            "likes": row["likes"],
            "date": row["date"],
            "sentiment": row.get("sentiment"),
            "score": row.get("sentiment_score"),
        })
        conn.commit()
        return result.fetchone()[0]


def db_get_session_results(session_id):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, keyword, title, link, author, likes, post_date,
                   sentiment, sentiment_score, scraped_at
            FROM results WHERE session_id = :sid ORDER BY scraped_at
        """), {"sid": session_id}).fetchall()
    return [{
        "id": r[0], "keyword": r[1], "title": r[2], "link": r[3],
        "author": r[4], "likes": r[5], "date": r[6],
        "sentiment": r[7], "sentiment_score": r[8],
        "scraped_at": r[9].isoformat() if r[9] else None,
    } for r in rows]


def db_get_result_detail(result_id):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, keyword, title, link, author, likes, post_date,
                   sentiment, sentiment_score, content, comments_count,
                   images, tags, detail_scraped, scraped_at
            FROM results WHERE id = :id
        """), {"id": result_id}).fetchone()
    if not row:
        return None
    return {
        "id": row[0], "keyword": row[1], "title": row[2], "link": row[3],
        "author": row[4], "likes": row[5], "date": row[6],
        "sentiment": row[7], "sentiment_score": row[8],
        "content": row[9], "comments_count": row[10],
        "images": row[11] or [], "tags": row[12] or [],
        "detail_scraped": row[13],
        "scraped_at": row[14].isoformat() if row[14] else None,
    }


def db_get_unanalyzed_ids(limit):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id FROM results WHERE sentiment IS NULL LIMIT :lim
        """), {"lim": limit}).fetchall()
    return [r[0] for r in rows]


def db_update_sentiment(result_id, sentiment, score):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE results SET sentiment = :s, sentiment_score = :sc WHERE id = :id
        """), {"s": sentiment, "sc": score, "id": result_id})
        conn.commit()


def db_get_undetailed_ids(limit, session_id=None):
    with engine.connect() as conn:
        if session_id:
            rows = conn.execute(text("""
                SELECT id FROM results
                WHERE session_id = :sid AND detail_scraped IS NOT TRUE
                LIMIT :lim
            """), {"sid": session_id, "lim": limit}).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT id, link FROM results
                WHERE detail_scraped IS NOT TRUE LIMIT :lim
            """), {"lim": limit}).fetchall()
    return rows


def db_update_detail(result_id, detail):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE results SET
                content = :content,
                comments_count = :comments,
                images = :images,
                tags = :tags,
                detail_scraped = TRUE
            WHERE id = :id
        """), {
            "content": detail.get("content"),
            "comments": detail.get("comments_count"),
            "images": detail.get("images") or [],
            "tags": detail.get("tags") or [],
            "id": result_id,
        })
        conn.commit()


def db_detail_scrape_status(is_scraping):
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM results")).fetchone()[0]
        done = conn.execute(text("SELECT COUNT(*) FROM results WHERE detail_scraped = TRUE")).fetchone()[0]
    return {"total": total, "scraped": done, "pending": total - done, "is_scraping": is_scraping}


def db_sentiment_status(is_analyzing):
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM results")).fetchone()[0]
        analyzed = conn.execute(text("SELECT COUNT(*) FROM results WHERE sentiment IS NOT NULL")).fetchone()[0]
    return {"is_analyzing": is_analyzing, "total": total, "analyzed": analyzed, "pending": total - analyzed}


# ── ANALYTICS QUERIES ────────────────────────────────
def db_update_author_bot_score(author, result):
    """Update bot score for all results by this author."""
    import json
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE results SET
                bot_score = :score,
                bot_label = :label,
                bot_breakdown = :breakdown
            WHERE author = :author
        """), {
            "score": result["bot_score"],
            "label": result["bot_label"],
            "breakdown": json.dumps(result["score_breakdown"]),
            "author": author,
        })
        conn.commit()


def db_get_authors_for_bot_check(limit=20, session_id=None):
    """Get distinct authors that haven't been bot-checked yet."""
    with engine.connect() as conn:
        if session_id:
            rows = conn.execute(text("""
                SELECT DISTINCT author, array_agg(id) as ids
                FROM results
                WHERE bot_score IS NULL AND session_id = :sid
                  AND author IS NOT NULL AND author != ''
                GROUP BY author LIMIT :lim
            """), {"sid": session_id, "lim": limit}).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT DISTINCT author, array_agg(id) as ids
                FROM results
                WHERE bot_score IS NULL
                  AND author IS NOT NULL AND author != ''
                GROUP BY author LIMIT :lim
            """), {"lim": limit}).fetchall()
    return {r[0]: r[1] for r in rows}


def db_bot_detection_status():
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(DISTINCT author) FROM results WHERE author IS NOT NULL")).fetchone()[0]
        done  = conn.execute(text("SELECT COUNT(DISTINCT author) FROM results WHERE bot_score IS NOT NULL")).fetchone()[0]
    return {"total": total, "checked": done, "pending": total - done}


def db_get_bot_summary():
    """Summary of bot labels across all authors."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT bot_label, COUNT(DISTINCT author) as authors, COUNT(*) as posts
            FROM results
            WHERE bot_label IS NOT NULL
            GROUP BY bot_label ORDER BY authors DESC
        """)).fetchall()
        top_bots = conn.execute(text("""
            SELECT author, MAX(bot_score) as score, MAX(bot_label) as label
            FROM results
            WHERE bot_score IS NOT NULL
            GROUP BY author ORDER BY score DESC LIMIT 10
        """)).fetchall()
    return {
        "summary": [{"label": r[0], "authors": r[1], "posts": r[2]} for r in rows],
        "top_bots": [{"author": r[0], "score": r[1], "label": r[2]} for r in top_bots],
    }



    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT keyword, COUNT(*) as total FROM results GROUP BY keyword ORDER BY total DESC"
        )).fetchall()
    return [{"keyword": r[0], "total": r[1]} for r in rows]


def db_analytics_sentiment():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT sentiment, COUNT(*) as total
            FROM results WHERE sentiment IS NOT NULL
            GROUP BY sentiment ORDER BY total DESC
        """)).fetchall()
        kw_rows = conn.execute(text("""
            SELECT keyword, sentiment, COUNT(*) as total
            FROM results WHERE sentiment IS NOT NULL
            GROUP BY keyword, sentiment ORDER BY keyword, total DESC
        """)).fetchall()
    return {
        "overall": [{"sentiment": r[0], "total": r[1]} for r in rows],
        "by_keyword": [{"keyword": r[0], "sentiment": r[1], "total": r[2]} for r in kw_rows],
    }


def db_analytics_top_authors():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                author,
                COUNT(*) as total,
                MAX(bot_score) as bot_score,
                MAX(bot_label) as bot_label
            FROM results
            WHERE author IS NOT NULL AND author != ''
            GROUP BY author ORDER BY total DESC LIMIT 20
        """)).fetchall()
    return [{"author": r[0], "total": r[1], "bot_score": r[2], "bot_label": r[3]} for r in rows]


def db_analytics_timeline():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DATE(scraped_at) as day, COUNT(*) as total
            FROM results GROUP BY day ORDER BY day DESC LIMIT 30
        """)).fetchall()
    return [{"day": str(r[0]), "total": r[1]} for r in rows]


def db_all_results_csv():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT keyword, title, link, author, likes, post_date,
                   sentiment, sentiment_score, scraped_at
            FROM results ORDER BY scraped_at DESC
        """)).fetchall()
    return rows


# ── COOKIE PERSISTENCE ───────────────────────────────
def db_save_cookies(cookie_str):
    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO app_settings (key, value) VALUES ('cookies', :val)
            ON CONFLICT (key) DO UPDATE SET value = :val
        """), {"val": cookie_str})
        conn.commit()

def db_load_cookies():
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT value FROM app_settings WHERE key = 'cookies'"
        )).fetchone()
    return row[0] if row else None

def db_analytics_keywords():
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT keyword, COUNT(*) as total FROM results GROUP BY keyword ORDER BY total DESC"
        )).fetchall()
    return [{"keyword": r[0], "total": r[1]} for r in rows]