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
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
                username TEXT,
                content TEXT,
                likes TEXT,
                posted_at TEXT,
                parent_username TEXT,
                is_reply BOOLEAN DEFAULT FALSE,
                scraped_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Add reply columns to comments if not exist
        conn.execute(text("ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_username TEXT"))
        conn.execute(text("ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_reply BOOLEAN DEFAULT FALSE"))
        conn.commit()
    print("✅ Database ready")


# ── SESSION QUERIES ──────────────────────────────────
def db_save_session(keywords, max_posts):
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO scrape_sessions (keywords, max_scroll)
            VALUES (:kw, :ms) RETURNING id
        """), {"kw": keywords, "ms": max_posts})
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
                   sentiment, sentiment_score, scraped_at,
                   bot_score, bot_label
            FROM results WHERE session_id = :sid ORDER BY scraped_at
        """), {"sid": session_id}).fetchall()
    return [{
        "id": r[0], "keyword": r[1], "title": r[2], "link": r[3],
        "author": r[4], "likes": r[5], "date": r[6],
        "sentiment": r[7], "sentiment_score": r[8],
        "scraped_at": r[9].isoformat() if r[9] else None,
        "bot_score": r[10], "bot_label": r[11],
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
    # Also fetch comments
    with engine.connect() as conn2:
        crows = conn2.execute(text("""
            SELECT username, content, likes, posted_at
            , parent_username, is_reply
            FROM comments WHERE result_id = :id
            ORDER BY id ASC LIMIT 50
        """), {"id": result_id}).fetchall()
    comments = [{"username": c[0], "content": c[1], "likes": c[2], "posted_at": c[3], "parent_username": c[4], "is_reply": c[5]} for c in crows]

    return {
        "id": row[0], "keyword": row[1], "title": row[2], "link": row[3],
        "author": row[4], "likes": row[5], "date": row[6],
        "sentiment": row[7], "sentiment_score": row[8],
        "content": row[9], "comments_count": row[10],
        "images": row[11] or [], "tags": row[12] or [],
        "detail_scraped": row[13],
        "scraped_at": row[14].isoformat() if row[14] else None,
        "comments": comments,
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
                video_url = :video_url,
                detail_scraped = TRUE
            WHERE id = :id
        """), {
            "content": detail.get("content"),
            "comments": detail.get("comments_count"),
            "images": detail.get("images") or [],
            "tags": detail.get("tags") or [],
            "video_url": detail.get("video_url"),
            "id": result_id,
        })
        conn.commit()


def db_save_comments(result_id, comments):
    """Save list of comment dicts (including replies) for a result."""
    if not comments:
        return
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM comments WHERE result_id = :id"), {"id": result_id})
        for c in comments:
            conn.execute(text("""
                INSERT INTO comments (result_id, username, content, likes, posted_at, parent_username, is_reply)
                VALUES (:rid, :username, :content, :likes, :posted_at, :parent_username, :is_reply)
            """), {
                "rid": result_id,
                "username": c.get("username"),
                "content": c.get("content"),
                "likes": c.get("likes"),
                "posted_at": c.get("posted_at"),
                "parent_username": c.get("parent_username"),
                "is_reply": c.get("is_reply", False),
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


# ── TRENDING ─────────────────────────────────────────

def db_save_trending(items):
    """Simpan hasil trending scrape. items = list of dicts."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS trending (
                id SERIAL PRIMARY KEY,
                hashtag TEXT NOT NULL,
                post_count INTEGER DEFAULT 0,
                sample_titles TEXT[],
                source TEXT DEFAULT 'explore',
                scraped_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Hapus data lama (keep hanya 7 hari)
        conn.execute(text("DELETE FROM trending WHERE scraped_at < NOW() - INTERVAL '7 days'"))
        for item in items:
            conn.execute(text("""
                INSERT INTO trending (hashtag, post_count, sample_titles, source)
                VALUES (:hashtag, :post_count, :sample_titles, :source)
            """), {
                "hashtag": item.get("hashtag", ""),
                "post_count": item.get("post_count", 0),
                "sample_titles": item.get("sample_titles", []),
                "source": item.get("source", "explore"),
            })
        conn.commit()


def db_get_trending(limit=30):
    """Ambil trending terbaru."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT hashtag, SUM(post_count) as total, MAX(scraped_at) as last_seen
            FROM trending
            WHERE scraped_at > NOW() - INTERVAL '24 hours'
            GROUP BY hashtag
            ORDER BY total DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
    return [{"hashtag": r[0], "count": r[1], "last_seen": str(r[2])} for r in rows]


def db_trending_last_scraped():
    """Kapan terakhir kali trending di-scrape."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT MAX(scraped_at) FROM trending
        """)).fetchone()
    return str(row[0]) if row and row[0] else None


def db_hashtags_from_results(limit=50):
    """Extract & hitung hashtag dari judul + tags hasil scraping di DB."""
    import re
    with engine.connect() as conn:
        # Dari judul
        title_rows = conn.execute(text("""
            SELECT title FROM results WHERE title IS NOT NULL
        """)).fetchall()
        # Dari tags (detail scrape)
        tag_rows = conn.execute(text("""
            SELECT unnest(tags) as tag FROM results
            WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
        """)).fetchall()

    counts = {}
    # Extract #hashtag dari judul
    for (title,) in title_rows:
        if title:
            tags = re.findall(r'#(\S+)', title)
            for t in tags:
                t = t.strip('.,!?。，').lower()
                if t and len(t) > 1:
                    counts[t] = counts.get(t, 0) + 1

    # Dari field tags
    for (tag,) in tag_rows:
        if tag:
            t = tag.lstrip('#').strip().lower()
            if t and len(t) > 1:
                counts[t] = counts.get(t, 0) + 1

    sorted_tags = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return [{"hashtag": f"#{k}", "count": v, "source": "db"} for k, v in sorted_tags]


def db_topics_from_results(limit=30):
    """Cluster kata-kata paling sering muncul di judul sebagai proxy topic."""
    import re
    from collections import Counter
    STOP_WORDS = {
        '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都',
        '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
        'the', 'a', 'an', 'is', 'are', 'was', 'to', 'of', 'in', 'for',
        'dan', 'di', 'yang', 'ke', 'dengan', 'ini', 'itu', 'ada', 'untuk',
    }
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT title FROM results WHERE title IS NOT NULL
        """)).fetchall()

    word_count = Counter()
    for (title,) in rows:
        if title:
            words = re.findall(r'[\w\u4e00-\u9fff]{2,}', title.lower())
            for w in words:
                if w not in STOP_WORDS and not w.isdigit():
                    word_count[w] += 1

    return [{"topic": w, "count": c} for w, c in word_count.most_common(limit)]

def db_analytics_keywords():
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT keyword, COUNT(*) as total FROM results GROUP BY keyword ORDER BY total DESC"
        )).fetchall()
    return [{"keyword": r[0], "total": r[1]} for r in rows]