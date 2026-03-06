from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from playwright.sync_api import sync_playwright
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import requests as http_requests
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

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY", "")
HF_MODEL = "lxyuan/distilbert-base-multilingual-cased-sentiments-student"
HF_URL = f"https://api-inference.huggingface.co/models/{HF_MODEL}"


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
        # Add columns if upgrading from old schema
        for col in [
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS sentiment TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS sentiment_score FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS content TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS comments_count TEXT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS images TEXT[]",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS tags TEXT[]",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS detail_scraped BOOLEAN DEFAULT FALSE",
        ]:
            try:
                conn.execute(text(col))
            except:
                pass
        conn.commit()
    print("✅ Database ready")


def save_session(keywords, max_scroll):
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO scrape_sessions (keywords, max_scroll)
            VALUES (:kw, :ms) RETURNING id
        """), {"kw": keywords, "ms": max_scroll})
        conn.commit()
        return result.fetchone()[0]


def save_result(session_id, row):
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
            "score": row.get("sentiment_score")
        })
        conn.commit()
        return result.fetchone()[0]


def finish_session(session_id, total):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE scrape_sessions SET finished_at = NOW(), total_results = :total WHERE id = :sid
        """), {"total": total, "sid": session_id})
        conn.commit()


# ── SENTIMENT ────────────────────────────────────────
def analyze_sentiment(title):
    """Call HuggingFace API to get sentiment of a title."""
    if not HF_API_KEY:
        print("❌ No HF API key!")
        return None, None
    try:
        print(f"🔍 Analyzing: {title[:50]}")
        resp = http_requests.post(
            HF_URL,
            headers={"Authorization": f"Bearer {HF_API_KEY}"},
            json={"inputs": title},
            timeout=15
        )
        print(f"   Status: {resp.status_code} | Response: {resp.text[:300]}")
        data = resp.json()

        if isinstance(data, dict) and "error" in data:
            print(f"   HF Error: {data['error']}")
            if "loading" in data.get("error", "").lower():
                time.sleep(10)
                resp = http_requests.post(
                    HF_URL,
                    headers={"Authorization": f"Bearer {HF_API_KEY}"},
                    json={"inputs": title},
                    timeout=20
                )
                data = resp.json()
                print(f"   Retry: {resp.text[:300]}")

        if isinstance(data, list) and len(data) > 0:
            scores = data[0] if isinstance(data[0], list) else data
            best = max(scores, key=lambda x: x["score"])
            print(f"   ✅ {best['label']} ({best['score']:.2f})")
            return best["label"].lower(), round(best["score"], 4)
        else:
            print(f"   ⚠️ Unexpected format: {data}")

    except Exception as e:
        print(f"❌ Sentiment exception: {e}")

    return None, None


def analyze_batch(result_ids):
    """Analyze sentiment for a list of result IDs from DB."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, title FROM results
            WHERE id = ANY(:ids) AND sentiment IS NULL
        """), {"ids": result_ids}).fetchall()

    updated = 0
    for row_id, title in rows:
        if not title:
            continue
        sentiment, score = analyze_sentiment(title)
        if sentiment:
            with engine.connect() as conn:
                conn.execute(text("""
                    UPDATE results SET sentiment = :s, sentiment_score = :sc WHERE id = :id
                """), {"s": sentiment, "sc": score, "id": row_id})
                conn.commit()
            updated += 1
        time.sleep(0.3)  # Rate limit buffer

    return updated


def scrape_post_detail(page, url):
    """Visit a post page and extract full content, comments count, images, tags."""
    try:
        page.goto(url, timeout=60000)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(random.uniform(3, 5))

        if "login" in page.url:
            return None

        detail = {}

        # Full content/description
        try:
            for selector in ["#detail-desc span", ".desc span", ".content span", "[class*='desc'] span", "article span"]:
                try:
                    el = page.locator(selector).first
                    text = el.inner_text(timeout=3000).strip()
                    if text and len(text) > 5:
                        detail["content"] = text
                        break
                except:
                    continue
            if "content" not in detail:
                detail["content"] = None
        except:
            detail["content"] = None

        # Comments count
        try:
            for selector in [".count-text", ".comment-count", "[class*='comment'] span", "[class*='chat'] span"]:
                try:
                    el = page.locator(selector).first
                    text = el.inner_text(timeout=2000).strip()
                    if text:
                        detail["comments_count"] = text
                        break
                except:
                    continue
            if "comments_count" not in detail:
                detail["comments_count"] = None
        except:
            detail["comments_count"] = None

        # Images
        try:
            imgs = page.locator(".swiper-slide img, .note-image img, [class*='slide'] img").all()
            detail["images"] = [img.get_attribute("src") for img in imgs[:9] if img.get_attribute("src")]
        except:
            detail["images"] = []

        # Tags / hashtags
        try:
            tag_els = page.locator("a[href*='search'] span, .tag, [class*='tag']").all()
            tags = []
            for t in tag_els[:10]:
                try:
                    txt = t.inner_text(timeout=1000).strip()
                    if txt and (txt.startswith("#") or len(txt) < 30):
                        tags.append(txt)
                except:
                    continue
            detail["tags"] = list(set(tags))
        except:
            detail["tags"] = []

        return detail

    except Exception as e:
        print(f"Detail scrape error: {e}")
        return None


def run_detail_scraper(result_ids, cookies):
    """Scrape full details for a list of result IDs."""
    global is_scraping

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            context.add_cookies(cookies)
            page = context.new_page()

            with engine.connect() as conn:
                rows = conn.execute(text("""
                    SELECT id, link FROM results
                    WHERE id = ANY(:ids) AND detail_scraped IS NOT TRUE
                """), {"ids": result_ids}).fetchall()

            push_log(f"🔍 Fetching details for {len(rows)} posts...")

            for i, (row_id, link) in enumerate(rows):
                push_log(f"   [{i+1}/{len(rows)}] {link[:60]}...")
                detail = scrape_post_detail(page, link)

                if detail:
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
                            "id": row_id
                        })
                        conn.commit()

                time.sleep(random.uniform(3, 6))

            browser.close()
            push_log(f"✅ Detail scraping done: {len(rows)} posts updated")
            push_done(len(rows))

    except Exception as e:
        push_error(f"❌ Detail scraper error: {str(e)}")
        push_done(0)
scrape_results = []
log_queue = queue.Queue()
is_scraping = False
is_analyzing = False
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
def run_scraper(keywords, max_scroll, cookies, auto_sentiment=False):
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
                                sentiment, score = None, None
                                if auto_sentiment and HF_API_KEY:
                                    sentiment, score = analyze_sentiment(title)

                                row = {
                                    "keyword": keyword,
                                    "title": title.strip(),
                                    "link": f"https://www.xiaohongshu.com{link}",
                                    "author": author.strip(),
                                    "likes": likes.strip(),
                                    "date": date.strip(),
                                    "sentiment": sentiment,
                                    "sentiment_score": score
                                }
                                db_id = save_result(session_id, row)
                                row["id"] = db_id
                                scrape_results.append(row)
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
    auto_sentiment = bool(body.get("auto_sentiment", False))

    if not keywords:
        return jsonify({"error": "No keywords provided"}), 400

    while not log_queue.empty():
        log_queue.get()

    thread = threading.Thread(target=run_scraper, args=(keywords, max_scroll, list(current_cookies), auto_sentiment))
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "keywords": keywords})


@app.route("/api/scrape/detail", methods=["POST"])
def start_detail_scrape():
    """Trigger detail scraping for selected or all unscraped results."""
    global is_scraping, log_queue

    if is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400
    if not current_cookies:
        return jsonify({"error": "No cookies set!"}), 400

    body = request.json or {}
    limit = int(body.get("limit", 20))
    session_id = body.get("session_id")  # Optional: only for specific session

    with engine.connect() as conn:
        if session_id:
            rows = conn.execute(text("""
                SELECT id FROM results
                WHERE session_id = :sid AND detail_scraped IS NOT TRUE
                LIMIT :lim
            """), {"sid": session_id, "lim": limit}).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT id FROM results
                WHERE detail_scraped IS NOT TRUE
                LIMIT :lim
            """), {"lim": limit}).fetchall()

    ids = [r[0] for r in rows]
    if not ids:
        return jsonify({"error": "No posts to scrape details for"}), 400

    while not log_queue.empty():
        log_queue.get()

    is_scraping = True
    thread = threading.Thread(target=run_detail_scraper, args=(ids, list(current_cookies)))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started", "count": len(ids)})


@app.route("/api/results/<int:result_id>/detail")
def get_result_detail(result_id):
    """Get full detail of a single result."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, keyword, title, link, author, likes, post_date,
                   sentiment, sentiment_score, content, comments_count,
                   images, tags, detail_scraped, scraped_at
            FROM results WHERE id = :id
        """), {"id": result_id}).fetchone()

    if not row:
        return jsonify({"error": "Not found"}), 404

    return jsonify({
        "id": row[0], "keyword": row[1], "title": row[2], "link": row[3],
        "author": row[4], "likes": row[5], "date": row[6],
        "sentiment": row[7], "sentiment_score": row[8],
        "content": row[9], "comments_count": row[10],
        "images": row[11] or [], "tags": row[12] or [],
        "detail_scraped": row[13],
        "scraped_at": row[14].isoformat() if row[14] else None
    })


@app.route("/api/scrape/detail/status")
def detail_scrape_status():
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM results")).fetchone()[0]
        done = conn.execute(text("SELECT COUNT(*) FROM results WHERE detail_scraped = TRUE")).fetchone()[0]
    return jsonify({"total": total, "scraped": done, "pending": total - done, "is_scraping": is_scraping})



@app.route("/api/sentiment/analyze", methods=["POST"])
def manual_sentiment():
    """Manually trigger sentiment analysis on unanalyzed results."""
    global is_analyzing
    if is_analyzing:
        return jsonify({"error": "Analysis already running"}), 400
    if not HF_API_KEY:
        return jsonify({"error": "HUGGINGFACE_API_KEY not set in .env"}), 400

    body = request.json or {}
    limit = int(body.get("limit", 50))

    def run_analysis():
        global is_analyzing
        is_analyzing = True
        try:
            with engine.connect() as conn:
                rows = conn.execute(text("""
                    SELECT id FROM results WHERE sentiment IS NULL LIMIT :lim
                """), {"lim": limit}).fetchall()
            ids = [r[0] for r in rows]
            if not ids:
                return
            updated = analyze_batch(ids)
            print(f"✅ Sentiment analyzed: {updated}/{len(ids)}")
        finally:
            is_analyzing = False

    thread = threading.Thread(target=run_analysis)
    thread.daemon = True
    thread.start()
    return jsonify({"status": "started", "message": f"Analyzing up to {limit} results"})


@app.route("/api/sentiment/status")
def sentiment_status():
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM results")).fetchone()[0]
        analyzed = conn.execute(text("SELECT COUNT(*) FROM results WHERE sentiment IS NOT NULL")).fetchone()[0]
    return jsonify({
        "is_analyzing": is_analyzing,
        "total": total,
        "analyzed": analyzed,
        "pending": total - analyzed
    })


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
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, keyword, title, link, author, likes, post_date, sentiment, sentiment_score, scraped_at
            FROM results WHERE session_id = :sid ORDER BY scraped_at
        """), {"sid": session_id}).fetchall()
    return jsonify([{
        "id": r[0], "keyword": r[1], "title": r[2], "link": r[3], "author": r[4],
        "likes": r[5], "date": r[6], "sentiment": r[7],
        "sentiment_score": r[8],
        "scraped_at": r[9].isoformat() if r[9] else None
    } for r in rows])


@app.route("/api/analytics/keywords")
def analytics_keywords():
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT keyword, COUNT(*) as total FROM results GROUP BY keyword ORDER BY total DESC")).fetchall()
    return jsonify([{"keyword": r[0], "total": r[1]} for r in rows])


@app.route("/api/analytics/sentiment")
def analytics_sentiment():
    """Sentiment distribution for dashboard."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT sentiment, COUNT(*) as total
            FROM results WHERE sentiment IS NOT NULL
            GROUP BY sentiment ORDER BY total DESC
        """)).fetchall()
        # Per keyword breakdown
        kw_rows = conn.execute(text("""
            SELECT keyword, sentiment, COUNT(*) as total
            FROM results WHERE sentiment IS NOT NULL
            GROUP BY keyword, sentiment ORDER BY keyword, total DESC
        """)).fetchall()
    return jsonify({
        "overall": [{"sentiment": r[0], "total": r[1]} for r in rows],
        "by_keyword": [{"keyword": r[0], "sentiment": r[1], "total": r[2]} for r in kw_rows]
    })


@app.route("/api/analytics/top-authors")
def analytics_top_authors():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT author, COUNT(*) as total FROM results
            WHERE author IS NOT NULL AND author != ''
            GROUP BY author ORDER BY total DESC LIMIT 20
        """)).fetchall()
    return jsonify([{"author": r[0], "total": r[1]} for r in rows])


@app.route("/api/analytics/timeline")
def analytics_timeline():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DATE(scraped_at) as day, COUNT(*) as total
            FROM results GROUP BY day ORDER BY day DESC LIMIT 30
        """)).fetchall()
    return jsonify([{"day": str(r[0]), "total": r[1]} for r in rows])


@app.route("/api/download/csv")
def download_csv():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT keyword, title, link, author, likes, post_date, sentiment, sentiment_score, scraped_at
            FROM results ORDER BY scraped_at DESC
        """)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["keyword", "title", "link", "author", "likes", "date", "sentiment", "sentiment_score", "scraped_at"])
    for r in rows:
        writer.writerow(r)
    output.seek(0)
    return Response(output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=rednote_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"})


@app.route("/api/status")
def status():
    return jsonify({
        "is_scraping": is_scraping,
        "is_analyzing": is_analyzing,
        "total_results": len(scrape_results),
        "cookies_loaded": len(current_cookies),
        "hf_configured": bool(HF_API_KEY)
    })


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("FLASK_PORT", 5001))
    app.run(debug=True, port=port, threaded=True)