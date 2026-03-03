from flask import Flask, jsonify, request, Response, send_file
from flask_cors import CORS
from playwright.sync_api import sync_playwright
import time
import random
import csv
import json
import io
import threading
import queue
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ====== COOKIES — Update when expired ======
COOKIES = [
    {"name": "a1", "value": "19cad415cfc4ppkz4p0uj05qkoj3284uupcyq1is230000215972", "domain": ".xiaohongshu.com", "path": "/"},
    {"name": "webId", "value": "042e8f5d10df94c71adca24feb2064f9", "domain": ".xiaohongshu.com", "path": "/"},
    {"name": "web_session", "value": "040069b8d26c38ca7561047d933b4b5e36e404", "domain": ".xiaohongshu.com", "path": "/"},
    {"name": "xsecappid", "value": "xhs-pc-web", "domain": ".xiaohongshu.com", "path": "/"},
    {"name": "webBuild", "value": "5.13.0", "domain": ".xiaohongshu.com", "path": "/"},
    {"name": "websectiga", "value": "cffd9dcea65962b05ab048ac76962acee933d26157113bb213105a116241fa6c", "domain": ".xiaohongshu.com", "path": "/"},
    {"name": "sec_poison_id", "value": "3c83f72a-bd78-4958-a679-e658f5425833", "domain": ".xiaohongshu.com", "path": "/"},
]

# Global state
scrape_results = []
log_queue = queue.Queue()
is_scraping = False


def push_log(msg):
    log_queue.put({"type": "log", "message": msg, "time": datetime.now().strftime("%H:%M:%S")})


def push_result(data):
    log_queue.put({"type": "result", "data": data})


def push_done(total):
    log_queue.put({"type": "done", "total": total})


def push_error(msg):
    log_queue.put({"type": "error", "message": msg})


def run_scraper(keywords, max_scroll):
    global scrape_results, is_scraping
    scrape_results = []
    is_scraping = True

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            context.add_cookies(COOKIES)
            page = context.new_page()

            for keyword in keywords:
                push_log(f"🔍 Scraping keyword: '{keyword}'...")

                try:
                    page.goto(f"https://www.xiaohongshu.com/search_result?keyword={keyword}")
                    page.wait_for_load_state("networkidle")
                    time.sleep(random.uniform(3, 5))

                    if "login" in page.url:
                        push_error("⚠️ Cookie expired! Please update cookies in app.py")
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
                                push_result(row)
                                count += 1
                        except:
                            pass

                    push_log(f"   ✅ Keyword '{keyword}' done: {count} results")
                    time.sleep(random.uniform(5, 8))

                except Exception as e:
                    push_error(f"❌ Error on keyword '{keyword}': {str(e)}")

            browser.close()

    except Exception as e:
        push_error(f"❌ Browser error: {str(e)}")
    finally:
        is_scraping = False
        push_done(len(scrape_results))


@app.route("/api/scrape", methods=["POST"])
def start_scrape():
    global is_scraping, log_queue
    if is_scraping:
        return jsonify({"error": "Scraping already in progress"}), 400

    body = request.json
    keywords = [k.strip() for k in body.get("keywords", []) if k.strip()]
    max_scroll = int(body.get("max_scroll", 5))

    if not keywords:
        return jsonify({"error": "No keywords provided"}), 400

    # Clear queue
    while not log_queue.empty():
        log_queue.get()

    thread = threading.Thread(target=run_scraper, args=(keywords, max_scroll))
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


@app.route("/api/download/csv")
def download_csv():
    if not scrape_results:
        return jsonify({"error": "No data available"}), 400

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["keyword", "title", "link", "author", "likes", "date"])
    writer.writeheader()
    writer.writerows(scrape_results)

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=rednote_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@app.route("/api/status")
def status():
    return jsonify({"is_scraping": is_scraping, "total_results": len(scrape_results)})


if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)