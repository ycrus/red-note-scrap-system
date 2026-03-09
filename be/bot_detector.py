from playwright.sync_api import sync_playwright
import time
import random
import re
import state
from database import engine, db_update_author_bot_score
from sqlalchemy import text

# ── BOT SCORE WEIGHTS ────────────────────────────────
# Total max = 100
WEIGHT_USERNAME       = 20   # angka random di username
WEIGHT_FOLLOWERS      = 25   # followers banyak, akun baru
WEIGHT_LIKES_RATIO    = 25   # rasio likes/followers tidak wajar
WEIGHT_POST_INTERVAL  = 30   # pola posting terlalu konsisten


def score_username(username):
    """Skor berdasarkan pola username mencurigakan."""
    score = 0
    if not username:
        return 0
    # Banyak angka di akhir (user_12345678)
    trailing_digits = re.search(r'\d{5,}', username)
    if trailing_digits:
        score += 15
    # Pola random chars + angka
    if re.search(r'[a-z]{2,}\d{4,}', username.lower()):
        score += 10
    return min(score, WEIGHT_USERNAME)


def score_followers(followers, following, join_days):
    """Skor berdasarkan followers vs umur akun."""
    score = 0
    if followers is None:
        return 0
    # Akun baru (< 180 hari) tapi followers > 1000
    if join_days and join_days < 180 and followers > 1000:
        score += 20
    # Followers jauh lebih banyak dari following (beli followers)
    if following and following > 0:
        ratio = followers / following
        if ratio > 100:
            score += 15
        elif ratio > 50:
            score += 8
    return min(score, WEIGHT_FOLLOWERS)


def score_likes_ratio(total_likes, followers):
    """Skor berdasarkan engagement rate yang tidak wajar."""
    score = 0
    if not followers or followers == 0 or total_likes is None:
        return 0
    ratio = total_likes / followers
    # Engagement terlalu tinggi (> 50x followers) = beli likes
    if ratio > 50:
        score += 25
    # Engagement sangat rendah (< 0.001) = ghost followers
    elif ratio < 0.001 and followers > 5000:
        score += 20
    return min(score, WEIGHT_LIKES_RATIO)


def score_post_interval(post_dates):
    """Skor berdasarkan konsistensi interval posting."""
    score = 0
    if not post_dates or len(post_dates) < 3:
        return 0
    try:
        from datetime import datetime
        dates = sorted([datetime.strptime(d, "%Y-%m-%d") for d in post_dates if d])
        if len(dates) < 3:
            return 0
        intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
        if not intervals:
            return 0
        avg = sum(intervals) / len(intervals)
        # Standar deviasi rendah = posting sangat konsisten (bot-like)
        variance = sum((x - avg) ** 2 for x in intervals) / len(intervals)
        std_dev = variance ** 0.5
        if avg > 0 and std_dev / max(avg, 1) < 0.1:
            score += 25  # sangat konsisten
        elif avg > 0 and std_dev / max(avg, 1) < 0.2:
            score += 15
    except Exception as e:
        print(f"Interval scoring error: {e}")
    return min(score, WEIGHT_POST_INTERVAL)


def score_content_repetition(titles):
    """Skor berdasarkan kemiripan konten antar post."""
    if not titles or len(titles) < 2:
        return 0
    # Hitung kata-kata yang sama antar judul
    similar_count = 0
    pairs = 0
    for i in range(len(titles)):
        for j in range(i+1, min(i+5, len(titles))):
            words_i = set(titles[i].lower().split())
            words_j = set(titles[j].lower().split())
            if not words_i or not words_j:
                continue
            overlap = len(words_i & words_j) / max(len(words_i | words_j), 1)
            if overlap > 0.7:
                similar_count += 1
            pairs += 1
    if pairs == 0:
        return 0
    repetition_rate = similar_count / pairs
    if repetition_rate > 0.5:
        return 20
    elif repetition_rate > 0.3:
        return 10
    return 0


def classify_bot_score(score):
    """Klasifikasi dari skor numerik."""
    if score >= 70:
        return "high"      # kemungkinan besar bot
    elif score >= 40:
        return "medium"    # mencurigakan
    elif score >= 20:
        return "low"       # sedikit mencurigakan
    return "clean"         # kemungkinan besar manusia


def scrape_author_profile(page, author_username):
    """Scrape halaman profil author dan return data mentah."""
    try:
        url = f"https://www.rednote.com/user/profile/{author_username}"
        page.goto(url, timeout=60000)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(random.uniform(3, 5))

        if "login" in page.url:
            return None

        profile = {}

        # Followers
        for sel in ["[class*='followers'] span", "[class*='fan'] span", ".follow-info span"]:
            try:
                txt = page.locator(sel).first.inner_text(timeout=2000).strip()
                if txt:
                    profile["followers_text"] = txt
                    profile["followers"] = parse_count(txt)
                    break
            except:
                continue

        # Following
        for sel in ["[class*='following'] span", "[class*='follow'] span"]:
            try:
                txt = page.locator(sel).first.inner_text(timeout=2000).strip()
                if txt:
                    profile["following"] = parse_count(txt)
                    break
            except:
                continue

        # Total likes received
        for sel in ["[class*='like'] span", "[class*='liked'] span"]:
            try:
                txt = page.locator(sel).first.inner_text(timeout=2000).strip()
                if txt:
                    profile["total_likes"] = parse_count(txt)
                    break
            except:
                continue

        # Recent post dates (from post cards on profile)
        try:
            date_els = page.locator("[class*='time'], [class*='date']").all()[:10]
            dates = []
            for el in date_els:
                try:
                    txt = el.inner_text(timeout=1000).strip()
                    if txt and re.match(r'\d{4}-\d{2}-\d{2}', txt):
                        dates.append(txt[:10])
                except:
                    continue
            profile["post_dates"] = dates
        except:
            profile["post_dates"] = []

        # Recent post titles
        try:
            title_els = page.locator("[class*='title'] span, [class*='note'] span").all()[:10]
            titles = []
            for el in title_els:
                try:
                    txt = el.inner_text(timeout=1000).strip()
                    if txt and len(txt) > 2:
                        titles.append(txt)
                except:
                    continue
            profile["titles"] = titles
        except:
            profile["titles"] = []

        return profile

    except Exception as e:
        print(f"Profile scrape error for {author_username}: {e}")
        return None


def parse_count(text):
    """Parse '1.2万' → 12000, '1000' → 1000."""
    if not text:
        return None
    text = text.strip().replace(",", "")
    try:
        if "万" in text:
            return int(float(text.replace("万", "")) * 10000)
        elif "k" in text.lower():
            return int(float(text.lower().replace("k", "")) * 1000)
        return int(float(re.sub(r'[^\d.]', '', text)))
    except:
        return None


def analyze_bot(author_username, profile, existing_titles=None):
    """Run all scoring functions and return final bot analysis."""
    scores = {}
    scores["username"]    = score_username(author_username)
    scores["followers"]   = score_followers(
        profile.get("followers"),
        profile.get("following"),
        profile.get("join_days")
    )
    scores["likes_ratio"] = score_likes_ratio(
        profile.get("total_likes"),
        profile.get("followers")
    )
    scores["interval"]    = score_post_interval(profile.get("post_dates", []))
    scores["repetition"]  = score_content_repetition(
        (profile.get("titles", []) or []) + (existing_titles or [])
    )

    total = sum(scores.values())
    total = min(total, 100)

    return {
        "bot_score": total,
        "bot_label": classify_bot_score(total),
        "score_breakdown": scores,
        "followers": profile.get("followers"),
        "following": profile.get("following"),
        "total_likes": profile.get("total_likes"),
    }


def run_bot_detection(author_usernames_map, cookies):
    """
    author_usernames_map: dict {author_name: [result_ids]}
    Scrape each author profile and compute bot score.
    """
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            )
            context.add_cookies(cookies)
            page = context.new_page()

            total = len(author_usernames_map)
            state.push_log(f"🤖 Analyzing {total} authors for bot behavior...")

            for i, (author, result_ids) in enumerate(author_usernames_map.items()):
                state.push_log(f"   [{i+1}/{total}] Checking: {author}")

                # Get existing titles for this author from DB
                with engine.connect() as conn:
                    rows = conn.execute(text("""
                        SELECT title FROM results WHERE author = :a AND title IS NOT NULL LIMIT 20
                    """), {"a": author}).fetchall()
                existing_titles = [r[0] for r in rows]

                # Try to find author profile URL
                # RedNote uses numeric user IDs in URLs, we search for it
                profile = {}
                try:
                    page.goto(f"https://www.rednote.com/search_result?keyword={author}&type=user")
                    page.wait_for_load_state("domcontentloaded")
                    time.sleep(random.uniform(2, 3))

                    # Click first user result
                    user_link = page.locator("a[href*='/user/profile/']").first
                    href = user_link.get_attribute("href")
                    if href:
                        full_url = f"https://www.rednote.com{href}" if href.startswith("/") else href
                        profile = scrape_author_profile(page, href.split("/")[-1]) or {}
                except Exception as e:
                    print(f"Could not find profile for {author}: {e}")

                result = analyze_bot(author, profile, existing_titles)
                state.push_log(f"   → Score: {result['bot_score']}/100 ({result['bot_label']})")

                # Save to DB for all results by this author
                db_update_author_bot_score(author, result)
                time.sleep(random.uniform(3, 5))

            browser.close()
            state.push_log(f"✅ Bot detection complete: {total} authors analyzed")
            state.push_done(total)

    except Exception as e:
        state.push_error(f"❌ Bot detection error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False