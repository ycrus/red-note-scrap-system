from playwright.sync_api import sync_playwright
import time
import random
import re
import state
from database import db_save_trending


def scrape_trending_explore(cookies):
    """
    Scrape halaman explore RedNote untuk ambil konten trending.
    Return list of {hashtag, post_count, sample_titles, source}
    """
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            if cookies:
                context.add_cookies(cookies)
            page = context.new_page()

            state.push_log("Opening RedNote explore page...")
            page.goto("https://www.rednote.com/explore", timeout=60000)
            page.wait_for_load_state("networkidle")
            time.sleep(random.uniform(3, 5))

            if "login" in page.url:
                state.push_log("Redirected to login — using DB-only mode")
                browser.close()
                return []

            state.push_log(f"   URL: {page.url}")

            # Scroll beberapa kali untuk load lebih banyak konten
            for i in range(3):
                page.mouse.wheel(0, 3000)
                time.sleep(random.uniform(1.5, 2.5))

            html = page.content()

            # Extract semua hashtag dari HTML
            hashtags_raw = re.findall(r'#([\u4e00-\u9fffA-Za-z0-9_\-]+)', html)
            hashtag_counts = {}
            for tag in hashtags_raw:
                tag = tag.strip().lower()
                if len(tag) > 1:
                    hashtag_counts[tag] = hashtag_counts.get(tag, 0) + 1

            # Extract judul post
            titles = []
            try:
                title_els = page.locator("a.title span, [class*='title'] span").all()
                for el in title_els[:50]:
                    try:
                        txt = el.inner_text(timeout=1000).strip()
                        if txt and len(txt) > 3:
                            titles.append(txt)
                    except:
                        continue
            except:
                pass

            state.push_log(f"   Found {len(hashtag_counts)} hashtags, {len(titles)} titles")

            # Dedupe titles + extract hashtags dari titles juga
            for title in titles:
                tags_in_title = re.findall(r'#([\u4e00-\u9fffA-Za-z0-9_]+)', title)
                for t in tags_in_title:
                    hashtag_counts[t.lower()] = hashtag_counts.get(t.lower(), 0) + 2  # bobot lebih tinggi

            # Build result list
            sorted_tags = sorted(hashtag_counts.items(), key=lambda x: x[1], reverse=True)[:40]
            for tag, count in sorted_tags:
                # Ambil sample titles yang mengandung hashtag ini
                samples = [t for t in titles if tag.lower() in t.lower()][:3]
                results.append({
                    "hashtag": f"#{tag}",
                    "post_count": count,
                    "sample_titles": samples,
                    "source": "explore"
                })

            browser.close()
            state.push_log(f"   Scraped {len(results)} trending hashtags from explore")

    except Exception as e:
        state.push_log(f"   Explore scrape error: {e}")

    return results


def run_trending_scraper(cookies=None):
    """
    Main entry point:
    1. Scrape explore page (butuh cookies)
    2. Selalu gabungkan dengan DB analytics
    3. Simpan ke trending table
    """
    try:
        state.push_log("Starting trending analysis...")
        all_items = []

        # 1. Scrape dari explore (kalau ada cookies)
        if cookies:
            explore_items = scrape_trending_explore(cookies)
            all_items.extend(explore_items)
        else:
            state.push_log("   No cookies — skipping live scrape")

        # 2. Selalu extract dari DB (tidak butuh cookies)
        state.push_log("Extracting hashtags from scraped data in DB...")
        from database import db_hashtags_from_results
        db_items = db_hashtags_from_results(limit=50)
        state.push_log(f"   Found {len(db_items)} hashtags in DB")

        # Gabungkan — DB items sebagai source "db"
        all_items.extend(db_items)

        if not all_items:
            state.push_log("   No trending data found")
            state.push_done(0)
            return

        # Simpan ke DB
        db_save_trending(all_items)
        state.push_log(f"Saved {len(all_items)} trending items")
        state.push_done(len(all_items))

    except Exception as e:
        state.push_error(f"Trending scraper error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False