from playwright.sync_api import sync_playwright
import time
import random
import state
from database import (
    db_save_session, db_finish_session, db_save_result,
    db_update_detail, db_get_undetailed_ids, db_save_comments
)
from sentiment import analyze_sentiment


# ── SEARCH SCRAPER ───────────────────────────────────
def run_scraper(keywords, max_posts, cookies, auto_sentiment=False):
    state.scrape_results = []
    state.is_scraping = True
    session_id = db_save_session(keywords, max_posts)
    state.push_log(f"📦 Session #{session_id} created in database")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ]
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1440, "height": 900},
                java_script_enabled=True,
                ignore_https_errors=True,
            )
            # Sembunyikan tanda-tanda automation
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});
                Object.defineProperty(navigator, 'languages', {get: () => ['zh-CN','zh','en']});
            """)
            # Log cookies yang akan di-set
            ws_check = next((c for c in cookies if c["name"] == "web_session"), None)
            state.push_log(f"   Setting {len(cookies)} cookies, web_session: {'OK' if ws_check else 'MISSING'}")

            context.add_cookies(cookies)
            page = context.new_page()

            # Verifikasi cookies berhasil di-set
            ctx_cookies = context.cookies(["https://www.rednote.com"])
            web_session = next((c for c in ctx_cookies if c["name"] == "web_session"), None)
            state.push_log(f"   Cookies in context: {len(ctx_cookies)}, web_session: {'OK' if web_session else 'MISSING'}")

            # Visit homepage dulu agar cookies aktif
            page.goto("https://www.rednote.com")
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            state.push_log(f"   Homepage URL: {page.url}")

            for keyword in keywords:
                state.push_log(f"Scraping keyword: '{keyword}'...")
                try:
                    page.goto(f"https://www.rednote.com/search_result?keyword={keyword}&type=51")
                    page.wait_for_load_state("networkidle")
                    time.sleep(random.uniform(3, 5))
                    state.push_log(f"   Current URL: {page.url}")

                    if "login" in page.url or "signin" in page.url:
                        state.push_error("Cookie expired! Please update cookies.")
                        break

                    # Tunggu sampai konten JS render — coba beberapa selector
                    state.push_log("   Waiting for content to render...")
                    content_loaded = False
                    for wait_sel in [
                        "section.note-item",
                        "[class*='note-item']",
                        "[class*='feeds-container']",
                        "[class*='search-result']",
                        "section",
                    ]:
                        try:
                            page.wait_for_selector(wait_sel, timeout=8000)
                            state.push_log(f"   Content found via: {wait_sel}")
                            content_loaded = True
                            break
                        except:
                            continue

                    if not content_loaded:
                        state.push_log("   Content not detected after wait, proceeding anyway...")
                        time.sleep(5)
                    else:
                        # Extra wait untuk virtual scroll render semua cards
                        time.sleep(3)
                        # Scroll sedikit untuk trigger virtual scroll
                        page.mouse.wheel(0, 300)
                        time.sleep(2)
                        page.mouse.wheel(0, -300)
                        time.sleep(1)

                    # Scroll sampai cukup post terkumpul atau tidak ada post baru
                    seen_links = set()
                    count = 0
                    scroll_round = 0
                    max_scroll_rounds = 30  # safety limit
                    no_new_count = 0

                    def get_cards():
                        # Coba semua selector yang mungkin
                        for sel in [
                            "section.note-item",
                            "section[class*='note']",
                            "[class*='note-item']",
                            "[class*='noteItem']",
                            "[class*='feed-item']",
                            "[class*='feedItem']",
                            "section",
                        ]:
                            try:
                                cards = page.locator(sel).all()
                                if cards and len(cards) > 0:
                                    return cards
                            except:
                                continue
                        return []

                    state.push_log(f"   Target: {max_posts} posts")

                    while count < max_posts and scroll_round < max_scroll_rounds:
                        scroll_round += 1
                        cards = get_cards()
                        prev_count = count

                        # Process new cards
                        for card in cards:
                            if count >= max_posts:
                                break
                            try:
                                title = None
                                for sel in ["a.title span", "span[data-v-51ec0135]", "[class*='title'] span"]:
                                    try:
                                        title = card.locator(sel).first.inner_text(timeout=2000).strip()
                                        if title: break
                                    except: continue

                                link = None
                                # Coba ambil dari href attribute langsung
                                for sel in ["a[href*='/search_result/']", "a[href*='/explore/']", "a.cover", "a[href]"]:
                                    try:
                                        href = card.locator(sel).first.get_attribute("href", timeout=2000)
                                        if href and ('/explore/' in href or '/search_result/' in href):
                                            link = href
                                            break
                                    except: continue

                                if not title or not link or link in seen_links:
                                    continue
                                seen_links.add(link)

                                author = None
                                for sel in ["div.name", "[class*='name']"]:
                                    try:
                                        author = card.locator(sel).first.inner_text(timeout=2000).strip()
                                        if author: break
                                    except: continue

                                likes = None
                                for sel in ["span.count", "[class*='count']"]:
                                    try:
                                        likes = card.locator(sel).first.inner_text(timeout=2000).strip()
                                        if likes: break
                                    except: continue

                                date = None
                                for sel in ["div.time", "[class*='time']"]:
                                    try:
                                        date = card.locator(sel).first.inner_text(timeout=2000).strip()
                                        if date: break
                                    except: continue

                                sentiment, score = (None, None)
                                if auto_sentiment:
                                    sentiment, score = analyze_sentiment(title)

                                row = {
                                    "keyword": keyword,
                                    "title": title.strip(),
                                    "link": f"https://www.rednote.com{link}",
                                    "author": author.strip() if author else None,
                                    "likes": likes.strip() if likes else None,
                                    "date": date.strip() if date else None,
                                    "sentiment": sentiment,
                                    "sentiment_score": score,
                                }
                                db_id = db_save_result(session_id, row)
                                row["id"] = db_id
                                state.scrape_results.append(row)
                                state.push_result(row)
                                count += 1

                            except:
                                continue

                        state.push_log(f"   [{count}/{max_posts}] Scroll {scroll_round} — {len(cards)} cards visible")

                        if count >= max_posts:
                            state.push_log(f"   Target reached!")
                            break

                        # Cek apakah ada post baru setelah scroll
                        if count == prev_count:
                            no_new_count += 1
                            if no_new_count >= 3:
                                state.push_log(f"   No new posts after 3 scrolls, stopping.")
                                break
                        else:
                            no_new_count = 0

                        # Scroll untuk load lebih banyak
                        page.mouse.wheel(0, 5000)
                        time.sleep(random.uniform(2, 3))

                    if len(seen_links) == 0:
                        page.screenshot(path="/tmp/rednote_debug.png")
                        try:
                            import re
                            html = page.content()
                            sections = re.findall(r'<section[^>]*>', html)
                            state.push_log(f"   Sections: {sections[:3]}")
                            state.push_log(f"   URL: {page.url}")
                        except: pass

                    state.push_log(f"   '{keyword}' done: {count} results saved")
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

        # Comments — scroll comment section to load more
        comments = []
        try:
            # Scroll down to trigger comment load
            for _ in range(3):
                page.mouse.wheel(0, 3000)
                time.sleep(1)

            # Try various comment container selectors
            comment_items = []
            for sel in [
                ".comment-item",
                "[class*='comment-item']",
                "[class*='commentItem']",
                ".parent-comment",
                "[class*='parent-comment']",
            ]:
                try:
                    comment_items = page.locator(sel).all()
                    if comment_items:
                        break
                except:
                    continue

            for item in comment_items[:30]:
                try:
                    # Username
                    username = None
                    for usel in [".author-wrapper .name", "[class*='author'] span", "[class*='nickname']", "[class*='username']"]:
                        try:
                            username = item.locator(usel).first.inner_text(timeout=1000).strip()
                            if username: break
                        except: continue

                    # Comment text
                    comment_text = None
                    for csel in [".note-text span", "[class*='note-text'] span", "[class*='content'] span", "span[class*='text']"]:
                        try:
                            comment_text = item.locator(csel).first.inner_text(timeout=1000).strip()
                            if comment_text: break
                        except: continue

                    # Likes on comment
                    likes = None
                    for lsel in ["[class*='like'] span", ".count", "[class*='count']"]:
                        try:
                            likes = item.locator(lsel).first.inner_text(timeout=1000).strip()
                            if likes: break
                        except: continue

                    # Date
                    posted_at = None
                    for dsel in ["[class*='time']", "[class*='date']"]:
                        try:
                            posted_at = item.locator(dsel).first.inner_text(timeout=1000).strip()
                            if posted_at: break
                        except: continue

                    if comment_text and len(comment_text) > 1:
                        comments.append({
                            "username": username,
                            "content": comment_text,
                            "likes": likes,
                            "posted_at": posted_at,
                        })
                except:
                    continue

        except Exception as ce:
            print(f"Comment scrape error: {ce}")

        detail["comments"] = comments
        return detail

    except Exception as e:
        print(f"Detail scrape error: {e}")
        return None


def run_detail_scraper(result_ids, cookies):
    """Open browser and scrape details for a list of result IDs."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ]
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1440, "height": 900},
                java_script_enabled=True,
                ignore_https_errors=True,
            )
            # Sembunyikan tanda-tanda automation
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});
                Object.defineProperty(navigator, 'languages', {get: () => ['zh-CN','zh','en']});
            """)
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
                    if detail.get("comments"):
                        db_save_comments(row_id, detail["comments"])
                        state.push_log(f"      💬 {len(detail['comments'])} comments saved")
                time.sleep(random.uniform(3, 6))

            browser.close()
            state.push_log(f"✅ Detail scraping done: {len(rows)} posts updated")
            state.push_done(len(rows))

    except Exception as e:
        state.push_error(f"❌ Detail scraper error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False