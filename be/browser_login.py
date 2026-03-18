from playwright.sync_api import sync_playwright
import time
import state
from database import db_save_cookies

# Global playwright instance agar browser tetap terbuka
_pw = None
_context = None


def run_browser_login():
    """
    Buka Chromium (non-headless), tunggu user login ke RedNote,
    extract & simpan cookies. Browser tetap terbuka setelah selesai.
    """
    global _pw, _context

    try:
        state.push_log("Opening Chromium for RedNote login...")

        import os
        user_data_dir = os.path.expanduser("~/.rednote_scraper_chromium")
        os.makedirs(user_data_dir, exist_ok=True)

        # Tutup instance lama kalau ada
        try:
            if _context:
                _context.close()
            if _pw:
                _pw.stop()
        except:
            pass

        # Start playwright tanpa with-block agar tidak auto-close
        _pw = sync_playwright().start()
        _context = _pw.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            args=[
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
            ignore_default_args=["--enable-automation"],
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            no_viewport=True,
            timeout=60000,
        )

        # Pakai page yang sudah ada atau buat baru
        pages = _context.pages
        page = pages[0] if pages else _context.new_page()

        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        try:
            page.goto("https://www.rednote.com", timeout=30000)
            page.wait_for_load_state("domcontentloaded")
        except Exception as ge:
            state.push_log(f"   goto error (continuing): {ge}")
        time.sleep(3)

        state.push_log(f"   URL: {page.url}")

        # Cek sudah login atau belum
        all_c = _context.cookies()
        cookies = [c for c in all_c if any(d in c.get("domain", "") for d in ["rednote", "rednote"])]
        state.push_log(f"   Cookies on open: {len(cookies)}")
        ws = next((c for c in cookies if c["name"] == "web_session"), None)

        if ws:
            state.push_log(f"   Already logged in! Saving {len(cookies)} cookies...")
            _save_cookies(_context)
            state.push_log("   Browser stays open.")
            state.push_done(len(cookies))
            return

        # Belum login — ke halaman login
        if "login" not in page.url:
            try:
                page.goto("https://www.rednote.com/login", timeout=30000)
                page.wait_for_load_state("domcontentloaded")
            except:
                pass

        state.push_log("   Please log in at the browser window (max 3 min)...")

        deadline = time.time() + 180
        logged_in = False

        while time.time() < deadline:
            time.sleep(2)
            try:
                url = page.url
                all_c = _context.cookies()
                cookies = [c for c in all_c if any(d in c.get("domain", "") for d in ["rednote", "rednote"])]
                ws = next((c for c in cookies if c["name"] == "web_session"), None)

                if ws and "login" not in url:
                    logged_in = True
                    break
            except:
                continue

        if not logged_in:
            state.push_error("Login timeout. Please try again.")
            state.push_done(0)
            return

        state.push_log("   Login detected! Saving cookies...")
        count = _save_cookies(_context)
        state.push_log("   Browser stays open.")
        state.push_done(count)

    except Exception as e:
        state.push_error(f"Browser login error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False


def _save_cookies(context):
    import state as st

    all_cookies = context.cookies()
    state.push_log(f"   Total cookies in context: {len(all_cookies)}")

    # Filter cookies milik rednote
    cookies = [c for c in all_cookies if
               any(d in c.get("domain", "") for d in ["rednote", "rednote"])]

    if not cookies:
        state.push_log("   No domain-filtered cookies, using all cookies")
        cookies = all_cookies

    state.push_log(f"   Using {len(cookies)} cookies")
    for c in cookies:
        state.push_log(f"   Cookie: {c['name']} domain={c.get('domain','?')}")

    # Build cookie string — name=value saja
    cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
    state.push_log(f"   Preview: {cookie_str[:120]}...")

    # Simpan ke DB
    db_save_cookies(cookie_str)

    # Force parse dengan domain .rednote.com — sama seperti set manual
    # Force domain ke rednote.com
    formatted = []
    for c in cookies:
        formatted.append({
            "name": c["name"],
            "value": c["value"],
            "domain": ".rednote.com",
            "path": "/",
            "httpOnly": False,
            "secure": True,
            "sameSite": "Lax",
        })
        # Tambah juga untuk www.rednote.com dan rednote.com
        formatted.append({
            "name": c["name"],
            "value": c["value"],
            "domain": "www.rednote.com",
            "path": "/",
            "httpOnly": False,
            "secure": True,
            "sameSite": "Lax",
        })

    st.current_cookies = formatted

    key_names = [c["name"] for c in cookies if c["name"] in
                 ["web_session", "a1", "webId", "gid", "id_token"]]
    state.push_log(f"   Saved {len(st.current_cookies)} cookies (with domain fix)")
    state.push_log(f"   Keys: {', '.join(key_names)}")
    state.push_log("Cookies saved!")
    return len(cookies)


def is_chrome_running():
    return _context is not None