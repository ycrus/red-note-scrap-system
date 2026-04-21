"""
Velocity Spike Detector
=======================
Detects abnormal surges in post volume per keyword/topic.

Algorithm:
  1. Divide time into windows (default 30 min)
  2. Count posts per keyword per window
  3. Compare recent window vs baseline (avg of past N windows)
  4. If ratio > threshold -> spike detected

Spike severity:
  - WATCH   : 200-299% increase
  - ALERT   : 300-499% increase
  - CRITICAL: 500%+   increase

Saved to: velocity_spikes table
"""

import os
import state
from database import engine
from sqlalchemy import text
from datetime import timedelta


WINDOW_MINUTES     = int(os.getenv("SPIKE_WINDOW_MINUTES", "30"))
BASELINE_WINDOWS   = int(os.getenv("SPIKE_BASELINE_WINDOWS", "6"))
WATCH_THRESHOLD    = float(os.getenv("SPIKE_WATCH_THRESHOLD", "2.0"))
ALERT_THRESHOLD    = float(os.getenv("SPIKE_ALERT_THRESHOLD", "3.0"))
CRITICAL_THRESHOLD = float(os.getenv("SPIKE_CRITICAL_THRESHOLD", "5.0"))
MIN_POSTS_TRIGGER  = int(os.getenv("SPIKE_MIN_POSTS", "3"))


def init_spike_table():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS velocity_spikes (
                id SERIAL PRIMARY KEY,
                keyword TEXT NOT NULL,
                severity TEXT NOT NULL,
                window_start TIMESTAMP NOT NULL,
                window_end TIMESTAMP NOT NULL,
                current_count INTEGER NOT NULL,
                baseline_avg FLOAT NOT NULL,
                spike_ratio FLOAT NOT NULL,
                post_ids INTEGER[],
                detected_at TIMESTAMP DEFAULT NOW(),
                session_id INTEGER
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS velocity_spikes_keyword_idx ON velocity_spikes(keyword)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS velocity_spikes_detected_idx ON velocity_spikes(detected_at DESC)"))
        conn.commit()
        print("velocity_spikes table ready")


def _get_severity(ratio):
    if ratio >= CRITICAL_THRESHOLD:
        return "CRITICAL"
    elif ratio >= ALERT_THRESHOLD:
        return "ALERT"
    elif ratio >= WATCH_THRESHOLD:
        return "WATCH"
    return None


def run_spike_detection(session_id=None, lookback_hours=24):
    """Analyze post timestamps to find abnormal volume surges per keyword."""
    state.push_log("⚡ Starting velocity spike detection...")
    spikes_found = []

    try:
        init_spike_table()

        with engine.connect() as conn:
            # Get keywords to analyze
            if session_id:
                kw_rows = conn.execute(text("""
                    SELECT DISTINCT keyword FROM results
                    WHERE session_id = :sid AND scraped_at IS NOT NULL
                """), {"sid": session_id}).fetchall()
            else:
                kw_rows = conn.execute(text(f"""
                    SELECT DISTINCT keyword FROM results
                    WHERE scraped_at > NOW() - INTERVAL '{lookback_hours} hours'
                      AND scraped_at IS NOT NULL
                """)).fetchall()

            keywords = [r[0] for r in kw_rows if r[0]]
            state.push_log(f"   Analyzing {len(keywords)} keywords over {lookback_hours}h...")

            for keyword in keywords:
                # Count posts per time window
                if session_id:
                    rows = conn.execute(text(f"""
                        SELECT
                            date_trunc('hour', scraped_at) +
                            (EXTRACT(MINUTE FROM scraped_at)::int / {WINDOW_MINUTES} * {WINDOW_MINUTES})
                            * INTERVAL '1 minute' AS window_start,
                            COUNT(*) as post_count,
                            ARRAY_AGG(id) as post_ids
                        FROM results
                        WHERE keyword = :kw AND session_id = :sid AND scraped_at IS NOT NULL
                        GROUP BY 1 ORDER BY 1
                    """), {"kw": keyword, "sid": session_id}).fetchall()
                else:
                    rows = conn.execute(text(f"""
                        SELECT
                            date_trunc('hour', scraped_at) +
                            (EXTRACT(MINUTE FROM scraped_at)::int / {WINDOW_MINUTES} * {WINDOW_MINUTES})
                            * INTERVAL '1 minute' AS window_start,
                            COUNT(*) as post_count,
                            ARRAY_AGG(id) as post_ids
                        FROM results
                        WHERE keyword = :kw
                          AND scraped_at > NOW() - INTERVAL '{lookback_hours} hours'
                          AND scraped_at IS NOT NULL
                        GROUP BY 1 ORDER BY 1
                    """), {"kw": keyword}).fetchall()

                if len(rows) < 2:
                    continue

                counts = [(r[0], int(r[1]), r[2]) for r in rows]

                # Need enough windows for baseline
                start_idx = min(BASELINE_WINDOWS, len(counts) - 1)
                for i in range(start_idx, len(counts)):
                    cur_start, cur_count, cur_post_ids = counts[i]
                    if cur_count < MIN_POSTS_TRIGGER:
                        continue

                    baseline_slice = counts[max(0, i - BASELINE_WINDOWS):i]
                    baseline_avg = sum(c[1] for c in baseline_slice) / max(len(baseline_slice), 1)

                    if baseline_avg == 0:
                        ratio = CRITICAL_THRESHOLD + 1 if cur_count >= MIN_POSTS_TRIGGER else 0
                    else:
                        ratio = cur_count / baseline_avg

                    severity = _get_severity(ratio)
                    if not severity:
                        continue

                    cur_end = cur_start + timedelta(minutes=WINDOW_MINUTES)
                    state.push_log(
                        f"   🚨 {severity}: '{keyword}' — {cur_count} posts "
                        f"(baseline: {baseline_avg:.1f}, {ratio:.1f}x surge)"
                    )

                    with engine.connect() as c2:
                        c2.execute(text("""
                            INSERT INTO velocity_spikes
                            (keyword, severity, window_start, window_end,
                             current_count, baseline_avg, spike_ratio, post_ids, session_id)
                            VALUES (:kw,:sev,:ws,:we,:cc,:ba,:sr,:pids,:sid)
                        """), {
                            "kw": keyword, "sev": severity,
                            "ws": cur_start, "we": cur_end,
                            "cc": cur_count, "ba": round(baseline_avg, 2),
                            "sr": round(ratio, 3),
                            "pids": list(cur_post_ids or [])[:50],
                            "sid": session_id,
                        })
                        c2.commit()

                    spikes_found.append({"keyword": keyword, "severity": severity, "ratio": round(ratio, 2)})

        c_count = sum(1 for s in spikes_found if s["severity"] == "CRITICAL")
        a_count = sum(1 for s in spikes_found if s["severity"] == "ALERT")
        w_count = sum(1 for s in spikes_found if s["severity"] == "WATCH")
        state.push_log(f"✅ Spike detection done: {len(spikes_found)} spikes ({c_count} CRITICAL, {a_count} ALERT, {w_count} WATCH)")
        state.push_done(len(spikes_found))

    except Exception as e:
        import traceback
        state.push_error(f"❌ Spike detection error: {str(e)}")
        print(traceback.format_exc())
        state.push_done(0)
    finally:
        state.is_scraping = False


def get_spike_events(session_id=None, limit=100):
    try:
        with engine.connect() as conn:
            if session_id:
                rows = conn.execute(text("""
                    SELECT keyword, severity, window_start, window_end,
                           current_count, baseline_avg, spike_ratio, post_ids, detected_at, session_id
                    FROM velocity_spikes WHERE session_id = :sid
                    ORDER BY detected_at DESC LIMIT :lim
                """), {"sid": session_id, "lim": limit}).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT keyword, severity, window_start, window_end,
                           current_count, baseline_avg, spike_ratio, post_ids, detected_at, session_id
                    FROM velocity_spikes
                    ORDER BY detected_at DESC LIMIT :lim
                """), {"lim": limit}).fetchall()
        return [{
            "keyword": r[0], "severity": r[1],
            "window_start": r[2].isoformat() if r[2] else None,
            "window_end":   r[3].isoformat() if r[3] else None,
            "current_count": r[4],
            "baseline_avg":  round(float(r[5]), 2) if r[5] else 0,
            "spike_ratio":   round(float(r[6]), 2) if r[6] else 0,
            "affected_posts": len(r[7] or []),
            "detected_at":   r[8].isoformat() if r[8] else None,
            "session_id":    r[9],
        } for r in rows]
    except Exception as e:
        print(f"get_spike_events error: {e}")
        return []


def get_spike_stats():
    try:
        with engine.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM velocity_spikes")).fetchone()[0]
            by_sev = conn.execute(text("""
                SELECT severity, COUNT(*) FROM velocity_spikes
                GROUP BY severity ORDER BY 2 DESC
            """)).fetchall()
            top_kw = conn.execute(text("""
                SELECT keyword, COUNT(*) as spikes, MAX(spike_ratio) as max_ratio, MAX(severity) as max_sev
                FROM velocity_spikes GROUP BY keyword ORDER BY spikes DESC LIMIT 10
            """)).fetchall()
        return {
            "total": total,
            "by_severity": [{"severity": r[0], "count": r[1]} for r in by_sev],
            "top_keywords": [{"keyword": r[0], "spike_count": r[1], "max_ratio": round(float(r[2] or 0), 2), "max_severity": r[3]} for r in top_kw],
        }
    except Exception as e:
        print(f"get_spike_stats error: {e}")
        return {"total": 0, "by_severity": [], "top_keywords": []}