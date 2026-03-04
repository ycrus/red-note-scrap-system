from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import time
import random
import csv
import json
import io
import threading
import queue
import os
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)

# ── DATABASE ────────────────────────────────────────
DB_URL = (
    f"postgresql://{os.getenv('DB_USER', 'postgres')}:"
    f"{os.getenv('DB_PASSWORD', '')}@"
    f"{os.getenv('DB_HOST', 'localhost')}:"
    f"{os.getenv('DB_PORT', '5432')}/"
    f"{os.getenv('DB_NAME', 'rednote_db')}"
)

engine = create_engine(DB_URL)

def init_db():
    """Create tables if not exists."""
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
                scraped_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.commit()
    print("✅ Database ready")

def save_session(keywords, max_scroll):
    """Create a new scrape session and return its ID."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO scrape_sessions (keywords, max_scroll)
            VALUES (:kw, :ms) RETURNING id
        """), {"kw": keywords, "ms": max_scroll})
        conn.commit()
        return result.fetchone()[0]

def save_result(session_id, row):
    """Save a single result to DB, ignore duplicates."""
    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO results (session_id, keyword, title, link, author, likes, post_date)
            VALUES (:sid, :kw, :title, :link, :author, :likes, :date)
            ON CONFLICT (link) DO NOTHING
        """), {
            "sid": session_id,
            "kw": row["keyword"],
            "title": row["title"],
            "link": row["link"],
            "author": row["author"],
            "likes": row["likes"],
            "date": row["date"]
        })
        conn.commit()

def finish_session(session_id, total):
    """Mark session as finished."""
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE scrape_sessions
            SET finished_at = NOW(), total_results = :total
            WHERE id = :sid
        """), {"total": total, "sid": session_id})
        conn.commit()


# ── GLOBAL STATE ─────────────────────────────────────
scrape_results = []
log_queue = queue.Queue()
is_scraping = False
current_cookies = []


def push_log(msg):
    log_queue.put({"type": "log", "message": msg, "time": datetime.now().strftime("%H:%M:%S")})

def push_result(data):
    log_queue.put({"type": "result", "data": data})

def push_done(total):
    log_queue.put({"type": "done", "total": total})

def push_error(msg):
    log_queue.put({"type": "error", "message": msg, "time": datetime.now().strftime("%H:%M:%S")})


def parse_cookie_string(cookie_str):
    cookies = []
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, _, value = part.partition("=")
            cookies.append({"name": name.strip(), "value": value.strip(), "domain": ".xiaohongshu.com", "path": "/"})
    return cookies


# ── SCRAPER ──────────────────────────────────────────
def run_scraper(keywords, max_scroll, cookies):
    global scrape_results, is_scraping
    scrape_results = []
    is_scraping = True
    session_id = save_session(keywords, max_scroll)
    push_log(f"📦 Session #{session_id} created in database")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            context.add_cookies(cookies)
            page = context.new_page()

            for keyword in keywords:
                push_log(f"🔍 Scraping keyword: '{keyword}'...")

                try:
                    page.goto(f"https://www.xiaohongshu.com/search_result?keyword={keyword}")
                    page.wait_for_load_state("networkidle")
                    time.sleep(random.uniform(3, 5))

                    if "login" in page.url:
                        push_error("⚠️ Cookie expired! Please update cookies.")
                        break

                    for i in range(max_scroll):
                        push_log(f"   Scrolling... ({i+1}/{max_scroll})")
                        page.mouse.wheel(0, 5000)
                        time.sleep(random.uniform(1.5, 2.5))

                    cards = page.locator("section").all()
                    push_log(f"   Found {len(cards)} cards")

                    seen_links = set()
                    count = 0

                    for card in cards:
                        try:
                            title = card.locator("a.title span").inner_text(timeout=5000)
                            link = card.locator("a.cover").get_attribute("href")
                            author = card.locator("div.name").inner_text(timeout=5000)
                            likes = card.locator("span.count").inner_text(timeout=5000)
                            date = card.locator("div.time").inner_text(timeout=5000)

                            if link in seen_links:
                                continue
                            seen_links.add(link)

                            if title and link:
                                row = {
                                    "keyword": keyword,
                                    "title": title.strip(),
                                    "link": f"https://www.xiaohongshu.com{link}",
                                    "author": author.strip(),
                                    "likes": likes.strip(),
                                    "date": date.strip()
                                }
                                scrape_results.append(row)
                                save_result(session_id, row)  # ← Save to PostgreSQL
                                push_result(row)
                                count += 1
                        except:
                            pass

                    push_log(f"   ✅ '{keyword}' done: {count} results saved to DB")
                    time.sleep(random.uniform(5, 8))

                except Exception as e:
                    push_error(f"❌ Error on '{keyword}': {str(e)}")

            browser.close()

    except Exception as e:
        push_error(f"❌ Browser error: {str(e)}")
    finally:
        is_scraping = False
        finish_session(session_id, len(scrape_results))
        push_done(len(scrape_results))


# ── ROUTES ──────────────────────────────────────────

@app.route("/api/cookies", methods=["POST"])
def set_cookies():
    global current_cookies
    raw = request.json.get("raw", "").strip()
    if not raw:
        return jsonify({"error": "No cookie string provided"}), 400
    current_cookies = parse_cookie_string(raw)
    return jsonify({"status": "ok", "count": len(current_cookies), "keys": [c["name"] for c in current_cookies]})

@app.route("/api/cookies", methods=["GET"])
def get_cookies():
    return jsonify({"count": len(current_cookies), "keys": [c["name"] for c in current_cookies]})


@app.route("/api/scrape", methods=["POST"])
def start_scrape():
    global is_scraping, log_queue
    if is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400
    if not current_cookies:
        return jsonify({"error": "No cookies set! Please add cookies first."}), 400

    body = request.json
    keywords = [k.strip() for k in body.get("keywords", []) if k.strip()]
    max_scroll = int(body.get("max_scroll", 5))
    if not keywords:
        return jsonify({"error": "No keywords provided"}), 400

    while not log_queue.empty():
        log_queue.get()

    thread = threading.Thread(target=run_scraper, args=(keywords, max_scroll, list(current_cookies)))
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "keywords": keywords})


@app.route("/api/stream")
def stream():
    def event_stream():
        while True:
            try:
                item = log_queue.get(timeout=30)
                yield f"data: {json.dumps(item)}\n\n"
                if item.get("type") == "done":
                    break
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
    return Response(event_stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/api/results")
def get_results():
    return jsonify(scrape_results)


@app.route("/api/history")
def get_history():
    """Return all past scrape sessions."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, keywords, max_scroll, total_results, started_at, finished_at
            FROM scrape_sessions ORDER BY started_at DESC LIMIT 50
        """)).fetchall()
    return jsonify([{
        "id": r[0], "keywords": r[1], "max_scroll": r[2],
        "total_results": r[3],
        "started_at": r[4].isoformat() if r[4] else None,
        "finished_at": r[5].isoformat() if r[5] else None
    } for r in rows])


@app.route("/api/history/<int:session_id>")
def get_session_results(session_id):
    """Return all results for a specific session."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT keyword, title, link, author, likes, post_date, scraped_at
            FROM results WHERE session_id = :sid ORDER BY scraped_at
        """), {"sid": session_id}).fetchall()
    return jsonify([{
        "keyword": r[0], "title": r[1], "link": r[2],
        "author": r[3], "likes": r[4], "date": r[5],
        "scraped_at": r[6].isoformat() if r[6] else None
    } for r in rows])


@app.route("/api/analytics/keywords")
def analytics_keywords():
    """Keyword volume stats from DB."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT keyword, COUNT(*) as total
            FROM results GROUP BY keyword ORDER BY total DESC
        """)).fetchall()
    return jsonify([{"keyword": r[0], "total": r[1]} for r in rows])


@app.route("/api/analytics/top-authors")
def analytics_top_authors():
    """Top authors by post count."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT author, COUNT(*) as total
            FROM results WHERE author IS NOT NULL AND author != ''
            GROUP BY author ORDER BY total DESC LIMIT 20
        """)).fetchall()
    return jsonify([{"author": r[0], "total": r[1]} for r in rows])


@app.route("/api/analytics/timeline")
def analytics_timeline():
    """Posts per day scraped."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DATE(scraped_at) as day, COUNT(*) as total
            FROM results GROUP BY day ORDER BY day DESC LIMIT 30
        """)).fetchall()
    return jsonify([{"day": str(r[0]), "total": r[1]} for r in rows])


@app.route("/api/download/csv")
def download_csv():
    """Download all results from DB as CSV."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT keyword, title, link, author, likes, post_date, scraped_at
            FROM results ORDER BY scraped_at DESC
        """)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["keyword", "title", "link", "author", "likes", "date", "scraped_at"])
    for r in rows:
        writer.writerow(r)
    output.seek(0)

    return Response(output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=rednote_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"})


@app.route("/api/status")
def status():
    return jsonify({
        "is_scraping": is_scraping,
        "total_results": len(scrape_results),
        "cookies_loaded": len(current_cookies)
    })


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("FLASK_PORT", 5001))
    app.run(debug=True, port=port, threaded=True)