import base64
import io
import os
import state
from database import engine, db_load_cookies
from sqlalchemy import text
from state import parse_cookie_string


MAX_SIZE = (400, 400)
QUALITY  = 75


def init_images_table():
    with engine.connect() as conn:
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS post_images (
                    id SERIAL PRIMARY KEY,
                    result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
                    image_index INTEGER DEFAULT 0,
                    url TEXT,
                    base64_data TEXT,
                    downloaded_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS post_images_result_idx
                ON post_images(result_id)
            """))
            conn.commit()
            print("post_images table ready")
        except Exception as e:
            conn.rollback()
            print(f"post_images init error: {e}")


def image_download_status():
    try:
        with engine.connect() as conn:
            total_posts = conn.execute(text("""
                SELECT COUNT(*) FROM results
                WHERE images IS NOT NULL AND array_length(images, 1) > 0
            """)).fetchone()[0]
            downloaded = conn.execute(text(
                "SELECT COUNT(DISTINCT result_id) FROM post_images"
            )).fetchone()[0]
            total_images = conn.execute(text(
                "SELECT COUNT(*) FROM post_images"
            )).fetchone()[0]
        return {
            "posts_with_images": total_posts,
            "posts_downloaded": downloaded,
            "posts_pending": total_posts - downloaded,
            "total_images": total_images,
        }
    except:
        return {"posts_with_images": 0, "posts_downloaded": 0, "posts_pending": 0, "total_images": 0}


def encode_image_bytes(img_bytes):
    """Resize dan encode bytes gambar ke base64."""
    from PIL import Image
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    img.thumbnail(MAX_SIZE, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=QUALITY, optimize=True)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def scrape_fresh_images(page, post_link):
    """
    Buka halaman post, ambil URL gambar fresh, download, return list base64.
    """
    from PIL import Image
    try:
        page.goto(post_link)
        page.wait_for_load_state("networkidle")
        import time; time.sleep(3)

        # Ambil semua gambar dari halaman post (bukan avatar)
        imgs = page.locator(
            "img[src*='rednotecdn.com'], img[src*='xhscdn.com']"
        ).all()

        results = []
        for img in imgs:
            src = img.get_attribute("src")
            if not src:
                continue
            # Skip avatar dan icon kecil
            if "avatar" in src or "sns-avatar" in src:
                continue

            try:
                resp = page.request.get(
                    src,
                    headers={
                        "Referer": "https://www.rednote.com/",
                        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                    }
                )
                if resp.status == 200:
                    img_bytes = resp.body()
                    if len(img_bytes) < 1000:  # skip gambar terlalu kecil
                        continue
                    b64 = encode_image_bytes(img_bytes)
                    results.append({"url": src, "base64": b64})
            except Exception as e:
                print(f"  img error: {e}")
                continue

        return results

    except Exception as e:
        print(f"scrape_fresh_images error: {e}")
        return []


def run_image_downloader(limit=50, session_id=None):
    """Download gambar dengan membuka halaman post untuk fresh URL."""
    from playwright.sync_api import sync_playwright

    try:
        # Ambil posts yang belum di-download
        with engine.connect() as conn:
            if session_id:
                rows = conn.execute(text("""
                    SELECT r.id, r.link FROM results r
                    LEFT JOIN post_images pi ON pi.result_id = r.id
                    WHERE r.link IS NOT NULL
                      AND r.session_id = :sid
                      AND pi.result_id IS NULL
                    LIMIT :lim
                """), {"sid": session_id, "lim": limit}).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT r.id, r.link FROM results r
                    LEFT JOIN post_images pi ON pi.result_id = r.id
                    WHERE r.link IS NOT NULL
                      AND pi.result_id IS NULL
                    LIMIT :lim
                """), {"lim": limit}).fetchall()

        if not rows:
            state.push_log("No posts to download images for.")
            state.push_done(0)
            state.is_scraping = False
            return

        state.push_log(f"Downloading images for {len(rows)} posts...")

        raw_cookies = db_load_cookies()
        cookies = parse_cookie_string(raw_cookies) if raw_cookies else []
        total_saved = 0

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"]
            )
            ctx = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            if cookies:
                ctx.add_cookies(cookies)
            page = ctx.new_page()

            # Login check
            page.goto("https://www.rednote.com")
            page.wait_for_load_state("networkidle")

            for i, (result_id, link) in enumerate(rows):
                state.push_log(f"   [{i+1}/{len(rows)}] Post {result_id}...")

                images = scrape_fresh_images(page, link)
                state.push_log(f"      Found {len(images)} images")

                if not images:
                    continue

                with engine.connect() as conn:
                    for idx, img_data in enumerate(images):
                        try:
                            conn.execute(text("""
                                INSERT INTO post_images (result_id, image_index, url, base64_data)
                                VALUES (:rid, :idx, :url, :b64)
                            """), {
                                "rid": result_id,
                                "idx": idx,
                                "url": img_data["url"],
                                "b64": img_data["base64"],
                            })
                            total_saved += 1
                        except Exception as e:
                            print(f"Save error: {e}")
                    conn.commit()

                state.push_log(f"      Saved {len(images)} images")

            browser.close()

        state.push_log(f"Image download complete: {total_saved} images from {len(rows)} posts")
        state.push_done(total_saved)

    except Exception as e:
        state.push_error(f"Image downloader error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False


def get_post_images(result_id):
    """Ambil semua gambar (base64) untuk satu post."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT image_index, url, base64_data
            FROM post_images
            WHERE result_id = :rid
            ORDER BY image_index
        """), {"rid": result_id}).fetchall()
    return [{"index": r[0], "url": r[1], "base64": r[2]} for r in rows]