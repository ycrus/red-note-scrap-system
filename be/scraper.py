from playwright.sync_api import sync_playwright
import time
import random
import state
from database import (
    db_save_session, db_finish_session, db_save_result,
    db_update_detail, db_get_undetailed_ids
)
from sentiment import analyze_sentiment

def parse_cookie_string(cookie_string: str):
    cookies = []
    for item in cookie_string.split(";"):
        item = item.strip()
        if "=" not in item:
            continue

        name, value = item.split("=", 1)

        cookies.append({
            "name": name,
            "value": value,
            "domain": ".rednote.com",
            "path": "/"
        })

    return cookies


# ── SEARCH SCRAPER ───────────────────────────────────
def run_scraper(keywords, max_scroll, cookies, auto_sentiment=False):
    state.scrape_results = []
    state.is_scraping = True
    session_id = db_save_session(keywords, max_scroll)
    state.push_log(f"📦 Session #{session_id} created in database")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            if isinstance(cookies, str):
                cookies = parse_cookie_string(cookies)

            context.add_cookies(cookies)
            page = context.new_page()

            for keyword in keywords:
                state.push_log(f"🔍 Scraping keyword: '{keyword}'...")
                try:
                    page.goto(f"https://www.rednote.com/search_result?keyword={keyword}")
                    page.wait_for_load_state("networkidle")
                    time.sleep(random.uniform(3, 5))

                    if "login" in page.url:
                        state.push_error("⚠️ Cookie expired! Please update cookies.")
                        break

                    for i in range(max_scroll):
                        state.push_log(f"   Scrolling... ({i+1}/{max_scroll})")
                        page.mouse.wheel(0, 5000)
                        time.sleep(random.uniform(1.5, 2.5))

                    # Selector utama berdasarkan struktur HTML RedNote
                    cards = page.locator("section.note-item").all()
                    state.push_log(f"   Found {len(cards)} cards (section.note-item)")

                    # Fallback selectors jika masih kosong
                    if len(cards) == 0:
                        for sel in ["section[data-v-79abd645]", "[class*='note-item']", "section"]:
                            cards = page.locator(sel).all()
                            if len(cards) > 0:
                                state.push_log(f"   Fallback '{sel}': {len(cards)} cards")
                                break

                    if len(cards) == 0:
                        page.screenshot(path="/tmp/rednote_debug.png")
                        state.push_log(f"   ⚠️ Screenshot saved to /tmp/rednote_debug.png")

                    seen_links = set()
                    count = 0

                    for card in cards:
                        try:
                            # Title: a.title span atau span[data-v-51ec0135]
                            title = None
                            for sel in ["a.title span", "span[data-v-51ec0135]", "[class*='title'] span"]:
                                try:
                                    title = card.locator(sel).first.inner_text(timeout=2000).strip()
                                    if title: break
                                except: continue

                            # Link: a.cover[href] atau a[href*='/explore/'] atau a[href*='/search_result/']
                            link = None
                            for sel in ["a.cover", "a[href*='/explore/']", "a[href*='/search_result/']"]:
                                try:
                                    link = card.locator(sel).first.get_attribute("href")
                                    if link: break
                                except: continue

                            # Author: div.name
                            author = None
                            for sel in ["div.name", "[class*='name']"]:
                                try:
                                    author = card.locator(sel).first.inner_text(timeout=2000).strip()
                                    if author: break
                                except: continue

                            # Likes: span.count
                            likes = None
                            for sel in ["span.count", "[class*='count']"]:
                                try:
                                    likes = card.locator(sel).first.inner_text(timeout=2000).strip()
                                    if likes: break
                                except: continue

                            # Date: div.time
                            date = None
                            for sel in ["div.time", "[class*='time']"]:
                                try:
                                    date = card.locator(sel).first.inner_text(timeout=2000).strip()
                                    if date: break
                                except: continue

                            if not title or not link or link in seen_links:
                                continue
                            seen_links.add(link)

                            sentiment, score = (None, None)
                            if auto_sentiment:
                                sentiment, score = analyze_sentiment(title)

                            row = {
                                "keyword": keyword,
                                "title": title.strip(),
                                "link": f"https://www.rednote.com{link}",
                                "author": author.strip(),
                                "likes": likes.strip(),
                                "date": date.strip(),
                                "sentiment": sentiment,
                                "sentiment_score": score,
                            }
                            db_id = db_save_result(session_id, row)
                            row["id"] = db_id
                            state.scrape_results.append(row)
                            state.push_result(row)
                            count += 1
                        except:
                            pass

                    state.push_log(f"   ✅ '{keyword}' done: {count} results saved")
                    time.sleep(random.uniform(5, 8))

                except Exception as e:
                    state.push_error(f"❌ Error on '{keyword}': {str(e)}")

            browser.close()

    except Exception as e:
        state.push_error(f"❌ Browser error: {str(e)}")
    finally:
        state.is_scraping = False
        db_finish_session(session_id, len(state.scrape_results))
        state.push_done(len(state.scrape_results))


# ── DETAIL SCRAPER ───────────────────────────────────
def scrape_post_detail(page, url):
    """Visit a post page and extract full content, comments, images, tags."""
    try:
        page.goto(url, timeout=60000)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(random.uniform(3, 5))

        if "login" in page.url:
            return None

        detail = {}

        # Content
        for selector in ["#detail-desc span", ".desc span", ".content span", "[class*='desc'] span", "article span"]:
            try:
                text = page.locator(selector).first.inner_text(timeout=3000).strip()
                if text and len(text) > 5:
                    detail["content"] = text
                    break
            except:
                continue
        detail.setdefault("content", None)

        # Comments count
        for selector in [".count-text", ".comment-count", "[class*='comment'] span", "[class*='chat'] span"]:
            try:
                text = page.locator(selector).first.inner_text(timeout=2000).strip()
                if text:
                    detail["comments_count"] = text
                    break
            except:
                continue
        detail.setdefault("comments_count", None)

        # Images
        try:
            imgs = page.locator(".swiper-slide img, .note-image img, [class*='slide'] img").all()
            detail["images"] = [img.get_attribute("src") for img in imgs[:9] if img.get_attribute("src")]
        except:
            detail["images"] = []

        # Tags
        try:
            tags = []
            for t in page.locator("a[href*='search'] span, .tag, [class*='tag']").all()[:10]:
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
    """Open browser and scrape details for a list of result IDs."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            if isinstance(cookies, str):
                cookies = parse_cookie_string(cookies)

            context.add_cookies(cookies)
            page = context.new_page()

            from database import engine
            from sqlalchemy import text
            with engine.connect() as conn:
                rows = conn.execute(text("""
                    SELECT id, link FROM results
                    WHERE id = ANY(:ids) AND detail_scraped IS NOT TRUE
                """), {"ids": result_ids}).fetchall()

            state.push_log(f"🔍 Fetching details for {len(rows)} posts...")

            for i, (row_id, link) in enumerate(rows):
                state.push_log(f"   [{i+1}/{len(rows)}] {link[:60]}...")
                detail = scrape_post_detail(page, link)
                if detail:
                    db_update_detail(row_id, detail)
                time.sleep(random.uniform(3, 6))

            browser.close()
            state.push_log(f"✅ Detail scraping done: {len(rows)} posts updated")
            state.push_done(len(rows))

    except Exception as e:
        state.push_error(f"❌ Detail scraper error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False