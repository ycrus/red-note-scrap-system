import queue
from datetime import datetime

# ── SHARED STATE ─────────────────────────────────────
scrape_results = []
log_queue = queue.Queue()
is_scraping = False
is_analyzing = False
current_cookies = []


# ── LOG HELPERS ──────────────────────────────────────
def push_log(msg):
    log_queue.put({"type": "log", "message": msg, "time": datetime.now().strftime("%H:%M:%S")})

def push_result(data):
    log_queue.put({"type": "result", "data": data})

def push_done(total):
    log_queue.put({"type": "done", "total": total})

def push_error(msg):
    log_queue.put({"type": "error", "message": msg, "time": datetime.now().strftime("%H:%M:%S")})

def clear_queue():
    while not log_queue.empty():
        log_queue.get()


# ── COOKIE HELPER ────────────────────────────────────
def parse_cookie_string(cookie_str):
    cookies = []
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, _, value = part.partition("=")
            cookies.append({
                "name": name.strip(),
                "value": value.strip(),
                "domain": ".rednote.com",
                "path": "/"
            })
    return cookies