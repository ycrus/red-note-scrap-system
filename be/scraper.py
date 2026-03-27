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
def run_scraper(keywords, max_posts, cookies, auto_sentiment=False, min_likes=0, scrape_detail=False):
    state.scrape_results = []
    state.is_scraping = True
    session_id = db_save_session(keywords, max_posts)
    state.push_log(f"📦 Session #{session_id} created in database")

    def parse_likes(likes_str):
        """Convert likes string like '1.7万' or '1500' to int."""
        if not likes_str:
            return 0
        try:
            s = str(likes_str).strip().replace(',', '')
            if '万' in s:
                return int(float(s.replace('万', '')) * 10000)
            if 'k' in s.lower():
                return int(float(s.lower().replace('k', '')) * 1000)
            return int(float(s))
        except:
            return 0

    # Pakai persistent profile yang sama dengan browser_login.py
    import os
    user_data_dir = os.path.expanduser("~/.rednote_scraper_chromium")
    os.makedirs(user_data_dir, exist_ok=True)

    try:
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1440, "height": 900},
                ignore_https_errors=True,
            )
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});
                Object.defineProperty(navigator, 'languages', {get: () => ['zh-CN','zh','en']});
            """)

            page = context.new_page()

            # Cek apakah sudah login via persistent profile
            page.goto("https://www.rednote.com")
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            state.push_log(f"   Homepage URL: {page.url}")

            # Kalau redirect ke login, coba inject cookies dari DB sebagai fallback
            if "login" in page.url or "signin" in page.url:
                state.push_log("   Not logged in via profile, injecting cookies from DB...")
                ws_check = next((c for c in cookies if c["name"] == "web_session"), None)
                state.push_log(f"   Setting {len(cookies)} cookies, web_session: {'OK' if ws_check else 'MISSING'}")
                context.add_cookies(cookies)
                page.reload()
                page.wait_for_load_state("networkidle")
                time.sleep(2)
                state.push_log(f"   After cookie inject URL: {page.url}")
                if "login" in page.url:
                    state.push_error("❌ Not logged in! Please login via browser first.")
                    context.close()
                    state.is_scraping = False
                    state.push_done(0)
                    return
            else:
                state.push_log("   ✅ Logged in via persistent profile")

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
                                # Filter min_likes
                                if min_likes > 0:
                                    post_likes = parse_likes(likes)
                                    if post_likes < min_likes:
                                        continue

                                db_id = db_save_result(session_id, row)
                                row["id"] = db_id
                                state.scrape_results.append(row)
                                state.push_result(row)
                                count += 1

                                # Auto scrape detail jika diaktifkan
                                if scrape_detail and db_id:
                                    try:
                                        post_url = row["link"]
                                        state.push_log(f"   🔍 Detail: {title[:40]}...")
                                        detail = scrape_post_detail(page, post_url)
                                        if detail:
                                            db_update_detail(db_id, detail)
                                            if detail.get("comments"):
                                                db_save_comments(db_id, detail["comments"])
                                        # Kembali ke search page
                                        page.goto(f"https://www.rednote.com/search_result?keyword={keyword}&type=51")
                                        page.wait_for_load_state("networkidle")
                                        time.sleep(random.uniform(2, 3))
                                    except Exception as de:
                                        state.push_log(f"   ⚠️ Detail error: {str(de)[:60]}")

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

            context.close()

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
        # Konversi /search_result/ ke /explore/ agar komentar muncul
        # JAGA xsec_token — jangan hapus query params!
        import re
        url = re.sub(r'/search_result/', '/explore/', url)
        page.goto(url, timeout=60000)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(random.uniform(3, 5))

        if "login" in page.url or "signin" in page.url:
            return None

        # Cek apakah post tersedia (300031 = not found/private)
        try:
            error_code = page.locator("[class*='error-code'], [class*='errorCode']").first.inner_text(timeout=2000)
            if error_code and "300031" in error_code:
                state.push_log(f"      ⚠️ Post tidak tersedia (300031): {url}")
                return None
        except:
            pass

        # Cek via JS apakah ada error state
        try:
            has_error = page.evaluate("""() => {
                const body = document.body.innerText;
                return body.includes('300031') || body.includes('该内容已被删除') || body.includes('内容不存在');
            }""")
            if has_error:
                state.push_log(f"      ⚠️ Post tidak tersedia: {url}")
                return None
        except:
            pass

        detail = {}

        # Deteksi apakah post adalah video
        is_video = False
        video_url = None
        try:
            # Cek apakah ada video player
            video_el = page.locator("video").first
            video_el.wait_for(timeout=3000)
            is_video = True
            # Ambil src dari video atau source element
            video_url = video_el.get_attribute("src")
            if not video_url:
                source_el = page.locator("video source").first
                video_url = source_el.get_attribute("src")
            # Kalau masih kosong, cari dari network request via JS
            if not video_url:
                video_url = page.evaluate("""() => {
                    const v = document.querySelector('video');
                    if (v) return v.currentSrc || v.src || null;
                    return null;
                }""")
        except:
            pass

        detail["is_video"] = is_video
        detail["video_url"] = video_url

        # Content — ambil semua teks dari #detail-desc, gabungkan
        try:
            spans = page.locator("#detail-desc .note-text span").all()
            parts = []
            for sp in spans:
                try:
                    t = sp.inner_text(timeout=1000).strip()
                    if t: parts.append(t)
                except: pass
            content_text = " ".join(parts).strip() if parts else None
            if not content_text:
                # Fallback
                content_text = page.locator("#detail-desc").first.inner_text(timeout=3000).strip()
            detail["content"] = content_text or None
        except:
            detail["content"] = None

        # Comments count — dari total text di comments section
        try:
            total_text = page.locator(".comments-el .total").first.inner_text(timeout=2000).strip()
            detail["comments_count"] = total_text  # e.g. "共 10 条评论"
        except:
            detail["comments_count"] = None

        # Images — dari swiper slides, skip duplicate
        try:
            seen_srcs = set()
            imgs = []
            for img in page.locator(".swiper-slide:not(.swiper-slide-duplicate) img").all():
                src = img.get_attribute("src")
                if src and src not in seen_srcs and "avatar" not in src:
                    seen_srcs.add(src)
                    imgs.append(src)
            detail["images"] = imgs[:9]
        except:
            detail["images"] = []

        # Tags — dari #detail-desc a.tag
        try:
            tags = []
            for a in page.locator("#detail-desc a.tag").all()[:15]:
                try:
                    txt = a.inner_text(timeout=1000).strip()
                    if txt: tags.append(txt)
                except: pass
            detail["tags"] = tags
        except:
            detail["tags"] = []

        # Comments + Replies — scroll to load
        comments = []
        try:
            for _ in range(4):
                page.mouse.wheel(0, 3000)
                time.sleep(1)

            def get_comment_fields(item):
                """Extract username, text, likes, date from a comment-item element."""
                username = None
                try:
                    username = item.locator("a.name").first.inner_text(timeout=1000).strip()
                except: pass

                comment_text = None
                try:
                    # Ambil semua teks dari note-text, skip emoji
                    spans = item.locator(".note-text span").all()
                    parts = []
                    for sp in spans:
                        try:
                            t = sp.inner_text(timeout=500).strip()
                            if t: parts.append(t)
                        except: pass
                    comment_text = " ".join(parts) if parts else None
                except: pass

                likes = None
                try:
                    likes = item.locator(".like-wrapper .count").first.inner_text(timeout=500).strip()
                    if likes in ["赞", "like"]: likes = "0"
                except: pass

                posted_at = None
                try:
                    date_text = item.locator(".date span").first.inner_text(timeout=500).strip()
                    location = ""
                    try:
                        location = item.locator(".location").first.inner_text(timeout=500).strip()
                    except: pass
                    posted_at = f"{date_text} {location}".strip() if date_text else None
                except: pass

                return username, comment_text, likes, posted_at

            # Cari semua parent-comment containers
            parent_containers = page.locator(".parent-comment").all()

            for container in parent_containers[:30]:
                try:
                    # Parent comment — comment-item tapi BUKAN comment-item-sub
                    parent_item = container.locator(".comment-item:not(.comment-item-sub)").first
                    username, comment_text, likes, posted_at = get_comment_fields(parent_item)

                    if comment_text and len(comment_text) > 0:
                        comments.append({
                            "username": username,
                            "content": comment_text,
                            "likes": likes,
                            "posted_at": posted_at,
                            "parent_username": None,
                            "is_reply": False,
                        })
                        parent_username = username

                        # Replies — comment-item-sub di dalam reply-container
                        reply_items = container.locator(".reply-container .comment-item-sub").all()
                        for reply in reply_items[:10]:
                            try:
                                ru, rt, rl, rd = get_comment_fields(reply)
                                if rt and len(rt) > 0:
                                    comments.append({
                                        "username": ru,
                                        "content": rt,
                                        "likes": rl,
                                        "posted_at": rd,
                                        "parent_username": parent_username,
                                        "is_reply": True,
                                    })
                            except: continue
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
    import os
    user_data_dir = os.path.expanduser("~/.rednote_scraper_chromium")
    os.makedirs(user_data_dir, exist_ok=True)

    try:
        with sync_playwright() as p:
            # Pakai persistent profile agar tidak perlu login ulang
            context = p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1440, "height": 900},
                ignore_https_errors=True,
            )
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});
                Object.defineProperty(navigator, 'languages', {get: () => ['zh-CN','zh','en']});
            """)
            page = context.new_page()

            # Cek login status
            page.goto("https://www.rednote.com")
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            if "login" in page.url or "signin" in page.url:
                # Fallback inject cookies
                context.add_cookies(cookies)
                page.reload()
                page.wait_for_load_state("networkidle")
                time.sleep(2)
                if "login" in page.url:
                    state.push_error("❌ Not logged in! Please login via browser first.")
                    context.close()
                    state.push_done(0)
                    state.is_scraping = False
                    return

            from database import engine
            from sqlalchemy import text
            with engine.connect() as conn:
                rows = conn.execute(text("""
                    SELECT id, link FROM results
                    WHERE id = ANY(:ids) AND detail_scraped IS NOT TRUE
                """), {"ids": result_ids}).fetchall()

            state.push_log(f"🔍 Fetching details for {len(rows)} posts...")
            done = 0

            for i, (row_id, link) in enumerate(rows):
                state.push_log(f"   [{i+1}/{len(rows)}] {link[:60]}...")
                try:
                    detail = scrape_post_detail(page, link)
                    if detail is None:
                        state.push_log(f"      ⏭ Skipped (unavailable)")
                        continue
                    db_update_detail(row_id, detail)
                    if detail.get("comments"):
                        db_save_comments(row_id, detail["comments"])
                        state.push_log(f"      💬 {len(detail['comments'])} comments")
                    if detail.get("content"):
                        state.push_log(f"      📝 Content: {detail['content'][:50]}...")
                    done += 1
                except Exception as pe:
                    state.push_log(f"      ⚠️ Error: {str(pe)[:60]}")
                time.sleep(random.uniform(2, 4))

            context.close()
            state.push_log(f"✅ Detail scraping done: {done}/{len(rows)} posts updated")
            state.push_done(done)

    except Exception as e:
        state.push_error(f"❌ Detail scraper error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False