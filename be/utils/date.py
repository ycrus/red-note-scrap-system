# date_normalizer.py
import re
from datetime import datetime, timedelta


def normalize_rednote_date(raw: str, reference_date: datetime = None) -> str | None:
    """
    Normalize RedNote date strings to YYYY-MM-DD.

    Handles:
      '03-12'          → YYYY-03-12  (current year assumed)
      '2025-10-28'     → 2025-10-28
      '1天前'           → today - 1 day
      '昨天 20:59'      → yesterday
      '4天前'           → today - 4 days
    """
    if not raw:
        return None

    s = raw.strip()
    today = reference_date or datetime.now()

    # ── 1. Full ISO date: 2025-10-28 ──
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', s)
    if m:
        return s  # already normalized

    # ── 2. MM-DD only: 03-12 ──
    m = re.match(r'^(\d{2})-(\d{2})$', s)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        year = today.year
        # If the date is in the future, it's probably last year
        candidate = datetime(year, month, day)
        if candidate > today:
            year -= 1
        return f"{year}-{month:02d}-{day:02d}"

    # ── 3. 昨天 (yesterday): 昨天 20:59 ──
    if '昨天' in s:
        d = today - timedelta(days=1)
        return d.strftime('%Y-%m-%d')

    # ── 4. N天前 (N days ago): 1天前, 4天前 ──
    m = re.search(r'(\d+)天前', s)
    if m:
        n = int(m.group(1))
        d = today - timedelta(days=n)
        return d.strftime('%Y-%m-%d')

    # ── 5. N小时前 (N hours ago) — bonus ──
    m = re.search(r'(\d+)小时前', s)
    if m:
        return today.strftime('%Y-%m-%d')
    
    m = re.search(r'(\d+)分钟前', s)
    if m:
        return today.strftime('%Y-%m-%d')

    # ── 6. 刚刚 / just now — bonus ──
    if '刚刚' in s:
        return today.strftime('%Y-%m-%d')

    return None  # unrecognized format — don't guess