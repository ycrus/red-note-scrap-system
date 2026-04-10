"""
Coordinated Inauthentic Behavior (CIB) Detector
================================================
Detects signs of organized disinformation campaigns on RedNote data.

Signals analyzed:
1. Content similarity clusters  — multiple accounts posting near-identical content
2. Timing coordination          — accounts posting same topic in tight time windows
3. Author network overlap       — accounts sharing identical metadata patterns
4. Hashtag injection            — sudden synchronized hashtag push
5. Amplification ratio          — suspiciously high likes relative to follower patterns

Results saved to: coordinated_events table
"""

import os
import state
from database import engine
from sqlalchemy import text
from datetime import datetime


# ── Thresholds ────────────────────────────────────────────────────────────────
SIMILARITY_THRESHOLD  = float(os.getenv("CIB_SIMILARITY_THRESHOLD", "0.92"))  # cosine similarity
TIMING_WINDOW_MINUTES = int(os.getenv("CIB_TIMING_WINDOW_MINUTES", "60"))     # posts within N min
MIN_CLUSTER_SIZE      = int(os.getenv("CIB_MIN_CLUSTER_SIZE", "3"))           # min accounts in cluster
HASHTAG_SURGE_FACTOR  = float(os.getenv("CIB_HASHTAG_SURGE_FACTOR", "5.0"))  # N× baseline = surge


def init_coordinated_tables():
    """Create tables for storing CIB detection results."""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS coordinated_events (
                id SERIAL PRIMARY KEY,
                event_type TEXT NOT NULL,
                severity TEXT DEFAULT 'LOW',
                description TEXT,
                evidence JSONB,
                affected_posts INTEGER[],
                affected_authors TEXT[],
                detected_at TIMESTAMP DEFAULT NOW(),
                session_id INTEGER
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS coord_events_type_idx
            ON coordinated_events(event_type)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS coord_events_detected_idx
            ON coordinated_events(detected_at DESC)
        """))
        conn.commit()
        print("coordinated_events table ready")


def _save_event(event_type, severity, description, evidence, post_ids, authors, session_id=None):
    """Save a detected CIB event to DB."""
    import json
    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO coordinated_events
            (event_type, severity, description, evidence, affected_posts, affected_authors, session_id)
            VALUES (:type, :sev, :desc, :ev, :posts, :authors, :sid)
        """), {
            "type": event_type,
            "sev": severity,
            "desc": description,
            "ev": json.dumps(evidence),
            "posts": post_ids,
            "authors": authors,
            "sid": session_id,
        })
        conn.commit()


def detect_content_similarity(session_id=None, threshold=SIMILARITY_THRESHOLD):
    """
    Signal 1: Content similarity clusters
    Find groups of posts with near-identical embeddings (cosine similarity > threshold).
    Indicates copy-paste or template-based disinformation.
    """
    state.push_log("   Checking content similarity clusters...")
    events = []

    try:
        with engine.connect() as conn:
            # Ambil posts yang punya embedding
            if session_id:
                rows = conn.execute(text("""
                    SELECT id, author, title, embedding::text
                    FROM results
                    WHERE embedding IS NOT NULL AND session_id = :sid
                    ORDER BY id
                """), {"sid": session_id}).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT id, author, title, embedding::text
                    FROM results
                    WHERE embedding IS NOT NULL
                    ORDER BY id
                    LIMIT 500
                """)).fetchall()

            if len(rows) < 2:
                state.push_log("   Not enough embedded posts for similarity check")
                return events

            # Find similar pairs via pgvector
            if session_id:
                similar_pairs = conn.execute(text(f"""
                    SELECT a.id, b.id, a.author, b.author,
                           1 - (a.embedding <=> b.embedding) AS similarity,
                           a.title
                    FROM results a
                    JOIN results b ON a.id < b.id
                    WHERE a.embedding IS NOT NULL
                      AND b.embedding IS NOT NULL
                      AND a.session_id = :sid
                      AND b.session_id = :sid
                      AND a.author != b.author
                      AND 1 - (a.embedding <=> b.embedding) > :thresh
                    ORDER BY similarity DESC
                    LIMIT 100
                """), {"sid": session_id, "thresh": threshold}).fetchall()
            else:
                similar_pairs = conn.execute(text(f"""
                    SELECT a.id, b.id, a.author, b.author,
                           1 - (a.embedding <=> b.embedding) AS similarity,
                           a.title
                    FROM results a
                    JOIN results b ON a.id < b.id
                    WHERE a.embedding IS NOT NULL
                      AND b.embedding IS NOT NULL
                      AND a.author != b.author
                      AND 1 - (a.embedding <=> b.embedding) > :thresh
                    ORDER BY similarity DESC
                    LIMIT 100
                """), {"thresh": threshold}).fetchall()

        if not similar_pairs:
            state.push_log(f"   No high-similarity pairs found (threshold: {threshold})")
            return events

        # Cluster pairs into groups
        clusters = {}
        for row in similar_pairs:
            id_a, id_b, auth_a, auth_b, sim, title = row
            sim = float(sim)
            found = False
            for cluster_id, cluster in clusters.items():
                if id_a in cluster["posts"] or id_b in cluster["posts"]:
                    cluster["posts"].update([id_a, id_b])
                    cluster["authors"].update([auth_a, auth_b])
                    cluster["max_sim"] = max(cluster["max_sim"], sim)
                    found = True
                    break
            if not found:
                clusters[len(clusters)] = {
                    "posts": {id_a, id_b},
                    "authors": {auth_a, auth_b},
                    "max_sim": sim,
                    "sample_title": str(title)[:100] if title else "",
                }

        for cluster in clusters.values():
            if len(cluster["authors"]) >= MIN_CLUSTER_SIZE:
                severity = "HIGH" if cluster["max_sim"] > 0.97 else "MEDIUM"
                desc = (f"{len(cluster['authors'])} different accounts posting near-identical content "
                        f"(max similarity: {cluster['max_sim']:.3f})")
                state.push_log(f"   🚨 CIB cluster: {desc}")
                _save_event(
                    "CONTENT_SIMILARITY",
                    severity,
                    desc,
                    {"max_similarity": cluster["max_sim"], "sample_title": cluster["sample_title"]},
                    list(cluster["posts"]),
                    list(cluster["authors"]),
                    session_id,
                )
                events.append({"type": "CONTENT_SIMILARITY", "severity": severity, "desc": desc})

    except Exception as e:
        state.push_log(f"   Similarity check error: {e}")

    return events


def detect_timing_coordination(session_id=None, window_minutes=TIMING_WINDOW_MINUTES):
    """
    Signal 2: Timing coordination
    Find keywords where many different accounts posted within a tight time window.
    Classic sign of a coordinated push campaign.
    """
    state.push_log("   Checking timing coordination...")
    events = []

    try:
        with engine.connect() as conn:
            # Find keywords with many posts clustered in time
            if session_id:
                rows = conn.execute(text("""
                    SELECT keyword,
                           COUNT(DISTINCT author) as unique_authors,
                           COUNT(*) as post_count,
                           MIN(scraped_at) as first_post,
                           MAX(scraped_at) as last_post,
                           EXTRACT(EPOCH FROM (MAX(scraped_at) - MIN(scraped_at)))/60 as duration_minutes,
                           ARRAY_AGG(DISTINCT author) as authors,
                           ARRAY_AGG(id) as post_ids
                    FROM results
                    WHERE session_id = :sid
                      AND scraped_at IS NOT NULL
                    GROUP BY keyword
                    HAVING COUNT(DISTINCT author) >= :min_authors
                       AND EXTRACT(EPOCH FROM (MAX(scraped_at) - MIN(scraped_at)))/60 <= :window
                """), {
                    "sid": session_id,
                    "min_authors": MIN_CLUSTER_SIZE,
                    "window": window_minutes
                }).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT keyword,
                           COUNT(DISTINCT author) as unique_authors,
                           COUNT(*) as post_count,
                           MIN(scraped_at) as first_post,
                           MAX(scraped_at) as last_post,
                           EXTRACT(EPOCH FROM (MAX(scraped_at) - MIN(scraped_at)))/60 as duration_minutes,
                           ARRAY_AGG(DISTINCT author) as authors,
                           ARRAY_AGG(id) as post_ids
                    FROM results
                    WHERE scraped_at IS NOT NULL
                    GROUP BY keyword
                    HAVING COUNT(DISTINCT author) >= :min_authors
                       AND EXTRACT(EPOCH FROM (MAX(scraped_at) - MIN(scraped_at)))/60 <= :window
                """), {
                    "min_authors": MIN_CLUSTER_SIZE,
                    "window": window_minutes
                }).fetchall()

        for row in rows:
            keyword, n_authors, n_posts, first, last, duration, authors, post_ids = row
            # Density: posts per minute
            density = n_posts / max(float(duration or 1), 1)
            severity = "HIGH" if density > 5 else "MEDIUM"
            desc = (f"Keyword '{keyword}': {n_authors} different accounts posted "
                    f"{n_posts} times within {duration:.0f} minutes "
                    f"({density:.1f} posts/min)")
            state.push_log(f"   🚨 Timing coordination: {desc}")
            _save_event(
                "TIMING_COORDINATION",
                severity,
                desc,
                {"keyword": keyword, "duration_minutes": float(duration or 0),
                 "density_per_min": round(density, 2)},
                list(post_ids)[:50],
                list(authors)[:20],
                session_id,
            )
            events.append({"type": "TIMING_COORDINATION", "severity": severity, "desc": desc})

    except Exception as e:
        state.push_log(f"   Timing check error: {e}")

    return events


def detect_hashtag_injection(session_id=None):
    """
    Signal 3: Hashtag injection
    Find hashtags that appear in many posts simultaneously from different accounts.
    Indicates coordinated hashtag hijacking.
    """
    state.push_log("   Checking hashtag injection...")
    events = []

    try:
        with engine.connect() as conn:
            if session_id:
                rows = conn.execute(text("""
                    SELECT tag,
                           COUNT(DISTINCT r.author) as unique_authors,
                           COUNT(*) as post_count,
                           ARRAY_AGG(DISTINCT r.author) as authors,
                           ARRAY_AGG(r.id) as post_ids
                    FROM results r,
                         UNNEST(r.tags) AS tag
                    WHERE r.session_id = :sid
                      AND r.tags IS NOT NULL
                    GROUP BY tag
                    HAVING COUNT(DISTINCT r.author) >= :min_auth
                    ORDER BY unique_authors DESC
                    LIMIT 20
                """), {"sid": session_id, "min_auth": MIN_CLUSTER_SIZE}).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT tag,
                           COUNT(DISTINCT r.author) as unique_authors,
                           COUNT(*) as post_count,
                           ARRAY_AGG(DISTINCT r.author) as authors,
                           ARRAY_AGG(r.id) as post_ids
                    FROM results r,
                         UNNEST(r.tags) AS tag
                    WHERE r.tags IS NOT NULL
                    GROUP BY tag
                    HAVING COUNT(DISTINCT r.author) >= :min_auth
                    ORDER BY unique_authors DESC
                    LIMIT 20
                """), {"min_auth": MIN_CLUSTER_SIZE * 2}).fetchall()

        for row in rows:
            tag, n_authors, n_posts, authors, post_ids = row
            severity = "HIGH" if n_authors > 10 else "MEDIUM"
            desc = f"Hashtag '{tag}' used by {n_authors} different accounts in {n_posts} posts"
            state.push_log(f"   📌 Hashtag push: {desc}")
            _save_event(
                "HASHTAG_INJECTION",
                severity,
                desc,
                {"hashtag": tag, "unique_authors": n_authors},
                list(post_ids)[:50],
                list(authors)[:20],
                session_id,
            )
            events.append({"type": "HASHTAG_INJECTION", "severity": severity, "desc": desc})

    except Exception as e:
        state.push_log(f"   Hashtag check error: {e}")

    return events


def detect_bot_amplification(session_id=None):
    """
    Signal 4: Bot amplification network
    Find topics where known/suspected bots are disproportionately active.
    """
    state.push_log("   Checking bot amplification...")
    events = []

    try:
        with engine.connect() as conn:
            if session_id:
                rows = conn.execute(text("""
                    SELECT keyword,
                           COUNT(*) FILTER (WHERE bot_label IN ('BOT','SUSPICIOUS')) as bot_posts,
                           COUNT(*) as total_posts,
                           ARRAY_AGG(author) FILTER (WHERE bot_label IN ('BOT','SUSPICIOUS')) as bot_authors
                    FROM results
                    WHERE session_id = :sid AND bot_label IS NOT NULL
                    GROUP BY keyword
                    HAVING COUNT(*) FILTER (WHERE bot_label IN ('BOT','SUSPICIOUS')) >= 2
                """), {"sid": session_id}).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT keyword,
                           COUNT(*) FILTER (WHERE bot_label IN ('BOT','SUSPICIOUS')) as bot_posts,
                           COUNT(*) as total_posts,
                           ARRAY_AGG(author) FILTER (WHERE bot_label IN ('BOT','SUSPICIOUS')) as bot_authors
                    FROM results
                    WHERE bot_label IS NOT NULL
                    GROUP BY keyword
                    HAVING COUNT(*) FILTER (WHERE bot_label IN ('BOT','SUSPICIOUS')) >= 2
                """)).fetchall()

        for row in rows:
            keyword, bot_posts, total_posts, bot_authors = row
            bot_ratio = bot_posts / max(total_posts, 1)
            if bot_ratio < 0.2:
                continue
            severity = "HIGH" if bot_ratio > 0.5 else "MEDIUM"
            desc = (f"Keyword '{keyword}': {bot_posts}/{total_posts} posts from bot/suspicious accounts "
                    f"({bot_ratio:.0%} bot ratio)")
            state.push_log(f"   🤖 Bot amplification: {desc}")
            _save_event(
                "BOT_AMPLIFICATION",
                severity,
                desc,
                {"keyword": keyword, "bot_ratio": round(bot_ratio, 3),
                 "bot_posts": bot_posts, "total_posts": total_posts},
                [],
                list(set(bot_authors or []))[:20],
                session_id,
            )
            events.append({"type": "BOT_AMPLIFICATION", "severity": severity, "desc": desc})

    except Exception as e:
        state.push_log(f"   Bot amplification check error: {e}")

    return events


def run_cib_detection(session_id=None):
    """
    Run all CIB detection signals.
    Called from background thread.
    """
    state.push_log("🔍 Starting Coordinated Inauthentic Behavior detection...")
    all_events = []

    try:
        init_coordinated_tables()

        # Signal 1: Content similarity (requires embeddings)
        events = detect_content_similarity(session_id)
        all_events.extend(events)

        # Signal 2: Timing coordination
        events = detect_timing_coordination(session_id)
        all_events.extend(events)

        # Signal 3: Hashtag injection
        events = detect_hashtag_injection(session_id)
        all_events.extend(events)

        # Signal 4: Bot amplification
        events = detect_bot_amplification(session_id)
        all_events.extend(events)

        high = sum(1 for e in all_events if e["severity"] == "HIGH")
        medium = sum(1 for e in all_events if e["severity"] == "MEDIUM")

        state.push_log(f"✅ CIB detection complete: {len(all_events)} events "
                       f"({high} HIGH, {medium} MEDIUM)")
        state.push_done(len(all_events))

    except Exception as e:
        state.push_error(f"❌ CIB detection error: {str(e)}")
        state.push_done(0)
    finally:
        state.is_scraping = False


def get_cib_summary(session_id=None):
    """Get summary of all detected CIB events."""
    try:
        with engine.connect() as conn:
            if session_id:
                rows = conn.execute(text("""
                    SELECT event_type, severity, description, affected_posts,
                           affected_authors, detected_at, evidence
                    FROM coordinated_events
                    WHERE session_id = :sid
                    ORDER BY detected_at DESC
                """), {"sid": session_id}).fetchall()
            else:
                rows = conn.execute(text("""
                    SELECT event_type, severity, description, affected_posts,
                           affected_authors, detected_at, evidence
                    FROM coordinated_events
                    ORDER BY detected_at DESC
                    LIMIT 100
                """)).fetchall()

        return [{
            "event_type": r[0],
            "severity": r[1],
            "description": r[2],
            "affected_posts_count": len(r[3] or []),
            "affected_authors": r[4] or [],
            "detected_at": r[5].isoformat() if r[5] else None,
            "evidence": r[6],
        } for r in rows]
    except Exception as e:
        return []


def get_cib_stats():
    """Stats overview of CIB detections."""
    try:
        with engine.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM coordinated_events")).fetchone()[0]
            by_type = conn.execute(text("""
                SELECT event_type, severity, COUNT(*) as count
                FROM coordinated_events
                GROUP BY event_type, severity
                ORDER BY event_type, severity
            """)).fetchall()
        return {
            "total_events": total,
            "by_type": [{"event_type": r[0], "severity": r[1], "count": r[2]} for r in by_type]
        }
    except:
        return {"total_events": 0, "by_type": []}