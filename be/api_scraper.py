"""
Apify-based scraper for RedNote (Xiaohongshu).
Tidak memerlukan login akun — Apify handle anti-bot via residential proxy.

Konfigurasi via .env:
  SCRAPER_PROVIDER=apify          # 'apify' atau 'playwright' (default)
  APIFY_API_TOKEN=apify_xxx...
  APIFY_ACTOR_ID=easyapi~all-in-one-rednote-xiaohongshu-scraper
  APIFY_BASE_URL=https://api.apify.com/v2
"""

import os
import time
import requests
import state
from database import db_save_session, db_finish_session, db_save_result
from sentiment import analyze_sentiment

APIFY_BASE_URL = os.getenv("APIFY_BASE_URL", "https://api.apify.com/v2")
APIFY_API_TOKEN = os.getenv("APIFY_API_TOKEN", "")
APIFY_ACTOR_ID = os.getenv("APIFY_ACTOR_ID", "easyapi~all-in-one-rednote-xiaohongshu-scraper")
APIFY_TIMEOUT = int(os.getenv("APIFY_TIMEOUT", "300"))  # seconds


def is_configured():
    return bool(APIFY_API_TOKEN)


def _start_actor_run(keyword, max_posts):
    """Start Apify actor run for a keyword. Return run ID."""
    url = f"{APIFY_BASE_URL}/acts/{APIFY_ACTOR_ID}/runs"
    payload = {
        "keyword": keyword,
        "maxItems": max_posts,
        "mode": "search",
        "sortType": "general",
    }
    resp = requests.post(
        url,
        params={"token": APIFY_API_TOKEN},
        json=payload,
        timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    return data["data"]["id"]


def _wait_for_run(run_id, timeout=APIFY_TIMEOUT):
    """Poll until run finishes. Return dataset ID."""
    url = f"{APIFY_BASE_URL}/actor-runs/{run_id}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = requests.get(url, params={"token": APIFY_API_TOKEN}, timeout=15)
        data = resp.json()["data"]
        status = data["status"]
        if status == "SUCCEEDED":
            return data["defaultDatasetId"]
        elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise Exception(f"Apify run {status}: {run_id}")
        time.sleep(5)
    raise Exception(f"Apify run timeout after {timeout}s")


def _fetch_dataset(dataset_id):
    """Fetch all items from Apify dataset."""
    url = f"{APIFY_BASE_URL}/datasets/{dataset_id}/items"
    resp = requests.get(
        url,
        params={"token": APIFY_API_TOKEN, "format": "json", "clean": "true"},
        timeout=60
    )
    resp.raise_for_status()
    return resp.json()


def _normalize_item(item, keyword):
    """Convert Apify response format to our internal format."""
    # Apify actors return slightly different field names depending on actor
    # Try multiple field name variants
    def get(keys, default=None):
        for k in keys if isinstance(keys, list) else [keys]:
            if k in item and item[k] is not None:
                return item[k]
        return default

    title = get(["title", "note_title", "noteTitle", "desc", "description"])
    link  = get(["url", "postUrl", "note_url", "noteUrl", "link"])
    author = get(["author", "authorName", "nickname", "user_nickname", "userName"])
    likes  = get(["likes", "liked_count", "likedCount", "like_count", "likeCount"])
    date   = get(["publishTime", "publish_time", "date", "createdAt", "created_at", "time"])
    images = get(["images", "imageUrls", "image_urls", "pics"], [])

    # Normalize link
    if link and not link.startswith("http"):
        link = f"https://www.rednote.com/explore/{link}"

    # Normalize images to list of strings
    if isinstance(images, list):
        normalized_imgs = []
        for img in images:
            if isinstance(img, str):
                normalized_imgs.append(img)
            elif isinstance(img, dict):
                url_val = img.get("url") or img.get("src") or img.get("urlDefault")
                if url_val:
                    normalized_imgs.append(url_val)
        images = normalized_imgs

    # Normalize likes to string
    if isinstance(likes, int):
        likes = str(likes)

    return {
        "keyword": keyword,
        "title": str(title).strip() if title else None,
        "link": link,
        "author": str(author).strip() if author else None,
        "likes": str(likes).strip() if likes else None,
        "date": str(date).strip() if date else None,
    }


def run_apify_scraper(keywords, max_posts, auto_sentiment=False, min_likes=0):
    """
    Main entry point — scrape RedNote via Apify actors.
    Same interface as run_scraper() in scraper.py.
    """
    state.scrape_results = []
    state.is_scraping = True
    session_id = db_save_session(keywords, max_posts)
    state.push_log(f"📦 Session #{session_id} created in database")
    state.push_log(f"🌐 Using Apify provider: {APIFY_ACTOR_ID}")

    if not is_configured():
        state.push_error("❌ APIFY_API_TOKEN not set in .env")
        state.push_done(0)
        state.is_scraping = False
        return

    total_saved = 0

    try:
        for keyword in keywords:
            state.push_log(f"Scraping keyword: '{keyword}' via Apify...")
            try:
                # 1. Start actor run
                run_id = _start_actor_run(keyword, max_posts)
                state.push_log(f"   Run started: {run_id}")

                # 2. Wait for completion
                state.push_log(f"   Waiting for Apify to finish (up to {APIFY_TIMEOUT}s)...")
                dataset_id = _wait_for_run(run_id)
                state.push_log(f"   Dataset ready: {dataset_id}")

                # 3. Fetch results
                items = _fetch_dataset(dataset_id)
                state.push_log(f"   Fetched {len(items)} items")

                # 4. Save to DB
                count = 0
                for item in items:
                    if count >= max_posts:
                        break
                    try:
                        row = _normalize_item(item, keyword)
                        if not row["title"] or not row["link"]:
                            continue

                        # Filter min_likes
                        if min_likes > 0:
                            try:
                                likes_int = int(str(row["likes"] or "0").replace("万", "0000").replace(",", ""))
                                if likes_int < min_likes:
                                    continue
                            except:
                                pass

                        # Auto sentiment
                        if auto_sentiment and row["title"]:
                            sentiment, score = analyze_sentiment(row["title"])
                            row["sentiment"] = sentiment
                            row["sentiment_score"] = score
                        else:
                            row["sentiment"] = None
                            row["sentiment_score"] = None

                        db_id = db_save_result(session_id, row)
                        row["id"] = db_id
                        state.scrape_results.append(row)
                        state.push_result(row)
                        count += 1
                        total_saved += 1

                    except Exception as e:
                        continue

                state.push_log(f"   '{keyword}' done: {count} results saved")

            except Exception as e:
                state.push_error(f"❌ Apify error on '{keyword}': {str(e)}")

        db_finish_session(session_id, total_saved)
        state.push_log(f"✅ Apify scraping complete: {total_saved} total results")
        state.push_done(total_saved)

    except Exception as e:
        state.push_error(f"❌ Apify scraper fatal error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False