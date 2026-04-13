"""
Narrative Framing Classifier
============================
Uses Claude API to analyze posts for disinformation framing signals.

Detects per post:
- blame_target     : who is blamed/accused
- emotion_trigger  : dominant emotion being triggered
- framing_angle    : victim / aggressor / hero / neutral / alarmist
- narrative_theme  : war / economy / health / politics / culture / religion
- manipulation     : propaganda technique used (if any)
- is_disinfo_risk  : boolean flag
- risk_score       : 0-100
- explanation      : brief EN explanation

Requires: ANTHROPIC_API_KEY in .env
"""

import os
import json
import time
import requests
import state
from database import engine
from sqlalchemy import text

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"


def is_configured():
    return bool(GROQ_API_KEY)


SYSTEM_PROMPT = """You are an expert analyst in disinformation detection, cognitive warfare, and narrative analysis.
You analyze social media posts from RedNote (小红书) for narrative framing signals.

Your task: analyze the given post and return a JSON object with these exact fields:

{
  "blame_target": "string or null — who/what is blamed (e.g. 'USA', 'China', 'Israel', 'government', 'media', null)",
  "emotion_trigger": "one of: fear, anger, pride, disgust, hope, sadness, null",
  "framing_angle": "one of: victim, aggressor, hero, neutral, alarmist, divisive",
  "narrative_theme": "one of: war, economy, health, politics, culture, religion, technology, other",
  "manipulation_technique": "one of: appeal_to_fear, false_dichotomy, scapegoating, emotional_manipulation, disinformation, propaganda, bandwagon, none",
  "is_disinfo_risk": true or false,
  "risk_score": integer 0-100,
  "explanation": "1-2 sentence explanation in English"
}

Risk score guidelines:
- 0-20: Normal content, no manipulation
- 21-40: Mild bias or emotional framing
- 41-60: Moderate manipulation, one-sided narrative
- 61-80: Strong propaganda signals, likely coordinated
- 81-100: Clear disinformation or cognitive warfare content

Respond ONLY with the JSON object, no markdown, no preamble."""


def classify_post(title, content=None):
    """Classify a single post via Groq API (free, fast, no rate limit issues)."""
    if not GROQ_API_KEY:
        return None

    text_input = title or ""
    if content and len(content) > 10:
        text_input += f"\n\nContent: {content[:800]}"

    for attempt in range(3):
        try:
            resp = requests.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Analyze this post:\n\n{text_input}"}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 400,
                },
                timeout=30
            )
            if resp.status_code == 429:
                wait = 10 * (attempt + 1)
                print(f"Rate limit, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            raw = data["choices"][0]["message"]["content"].strip()
            raw = raw.replace("```json", "").replace("```", "").strip()
            return json.loads(raw)
        except requests.exceptions.Timeout:
            print(f"Timeout attempt {attempt+1}, retrying...")
            time.sleep(5)
        except Exception as e:
            print(f"Framing classify error (attempt {attempt+1}): {e}")
            time.sleep(3)
    return None


def init_framing_table():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS post_framing (
                id SERIAL PRIMARY KEY,
                result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
                blame_target TEXT,
                emotion_trigger TEXT,
                framing_angle TEXT,
                narrative_theme TEXT,
                manipulation_technique TEXT,
                is_disinfo_risk BOOLEAN DEFAULT FALSE,
                risk_score INTEGER DEFAULT 0,
                explanation TEXT,
                analyzed_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS post_framing_result_idx
            ON post_framing(result_id)
        """))
        conn.execute(text("ALTER TABLE results ADD COLUMN IF NOT EXISTS framing_risk_score INTEGER"))
        conn.execute(text("ALTER TABLE results ADD COLUMN IF NOT EXISTS framing_angle TEXT"))
        conn.execute(text("ALTER TABLE results ADD COLUMN IF NOT EXISTS narrative_theme TEXT"))
        conn.commit()
        print("post_framing table ready")


def framing_status():
    try:
        with engine.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM results")).fetchone()[0]
            analyzed = conn.execute(text("SELECT COUNT(*) FROM post_framing")).fetchone()[0]
            high_risk = conn.execute(text(
                "SELECT COUNT(*) FROM post_framing WHERE risk_score >= 60"
            )).fetchone()[0]
        return {"total": total, "analyzed": analyzed, "pending": total - analyzed, "high_risk": high_risk}
    except:
        return {"total": 0, "analyzed": 0, "pending": 0, "high_risk": 0}


def run_framing_analysis(limit=50, session_id=None):
    if not is_configured():
        state.push_error("❌ ANTHROPIC_API_KEY not set in .env")
        state.push_done(0)
        state.is_scraping = False
        return

    with engine.connect() as conn:
        if session_id:
            rows = conn.execute(text("""
                SELECT r.id, r.title, r.content FROM results r
                LEFT JOIN post_framing pf ON pf.result_id = r.id
                WHERE r.session_id = :sid AND pf.result_id IS NULL AND r.title IS NOT NULL
                ORDER BY r.id DESC LIMIT :lim
            """), {"sid": session_id, "lim": limit}).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT r.id, r.title, r.content FROM results r
                LEFT JOIN post_framing pf ON pf.result_id = r.id
                WHERE pf.result_id IS NULL AND r.title IS NOT NULL
                ORDER BY r.id DESC LIMIT :lim
            """), {"lim": limit}).fetchall()

    if not rows:
        state.push_log("All posts already analyzed for framing.")
        state.push_done(0)
        state.is_scraping = False
        return

    state.push_log(f"🧠 Analyzing framing for {len(rows)} posts via Claude...")
    done = 0
    high_risk = 0

    for i, (result_id, title, content) in enumerate(rows):
        state.push_log(f"   [{i+1}/{len(rows)}] {(title or '')[:50]}...")
        result = classify_post(title, content)
        if not result:
            continue

        try:
            with engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO post_framing
                    (result_id, blame_target, emotion_trigger, framing_angle,
                     narrative_theme, manipulation_technique, is_disinfo_risk, risk_score, explanation)
                    VALUES (:rid, :blame, :emotion, :angle, :theme, :manip, :risk, :score, :expl)
                    ON CONFLICT (result_id) DO UPDATE SET
                        blame_target = EXCLUDED.blame_target,
                        emotion_trigger = EXCLUDED.emotion_trigger,
                        framing_angle = EXCLUDED.framing_angle,
                        narrative_theme = EXCLUDED.narrative_theme,
                        manipulation_technique = EXCLUDED.manipulation_technique,
                        is_disinfo_risk = EXCLUDED.is_disinfo_risk,
                        risk_score = EXCLUDED.risk_score,
                        explanation = EXCLUDED.explanation,
                        analyzed_at = NOW()
                """), {
                    "rid": result_id,
                    "blame": result.get("blame_target"),
                    "emotion": result.get("emotion_trigger"),
                    "angle": result.get("framing_angle"),
                    "theme": result.get("narrative_theme"),
                    "manip": result.get("manipulation_technique"),
                    "risk": result.get("is_disinfo_risk", False),
                    "score": result.get("risk_score", 0),
                    "expl": result.get("explanation"),
                })
                conn.execute(text("""
                    UPDATE results SET
                        framing_risk_score = :score,
                        framing_angle = :angle,
                        narrative_theme = :theme
                    WHERE id = :rid
                """), {
                    "score": result.get("risk_score", 0),
                    "angle": result.get("framing_angle"),
                    "theme": result.get("narrative_theme"),
                    "rid": result_id,
                })
                conn.commit()

            score = result.get("risk_score", 0)
            state.push_log(f"      risk={score} angle={result.get('framing_angle')} manip={result.get('manipulation_technique')}")
            if score >= 60:
                high_risk += 1
            done += 1

        except Exception as e:
            import traceback
            state.push_log(f"      ⚠️ Save error: {str(e)[:120]}")
            print(f"FRAMING SAVE ERROR: {traceback.format_exc()}")

        time.sleep(5)  # 5s delay = max 12 req/min, safe for free tier

    state.push_log(f"✅ Framing done: {done}/{len(rows)} | {high_risk} high-risk")
    state.push_done(done)
    state.is_scraping = False


def get_framing_results(session_id=None, min_risk=0, limit=100):
    with engine.connect() as conn:
        if session_id:
            rows = conn.execute(text("""
                SELECT r.id, r.title, r.author, r.keyword,
                       pf.blame_target, pf.emotion_trigger, pf.framing_angle,
                       pf.narrative_theme, pf.manipulation_technique,
                       pf.is_disinfo_risk, pf.risk_score, pf.explanation, pf.analyzed_at
                FROM results r JOIN post_framing pf ON pf.result_id = r.id
                WHERE r.session_id = :sid AND pf.risk_score >= :min
                ORDER BY pf.risk_score DESC LIMIT :lim
            """), {"sid": session_id, "min": min_risk, "lim": limit}).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT r.id, r.title, r.author, r.keyword,
                       pf.blame_target, pf.emotion_trigger, pf.framing_angle,
                       pf.narrative_theme, pf.manipulation_technique,
                       pf.is_disinfo_risk, pf.risk_score, pf.explanation, pf.analyzed_at
                FROM results r JOIN post_framing pf ON pf.result_id = r.id
                WHERE pf.risk_score >= :min
                ORDER BY pf.risk_score DESC LIMIT :lim
            """), {"min": min_risk, "lim": limit}).fetchall()

    return [{
        "id": r[0], "title": r[1], "author": r[2], "keyword": r[3],
        "blame_target": r[4], "emotion_trigger": r[5], "framing_angle": r[6],
        "narrative_theme": r[7], "manipulation_technique": r[8],
        "is_disinfo_risk": r[9], "risk_score": r[10], "explanation": r[11],
        "analyzed_at": r[12].isoformat() if r[12] else None,
    } for r in rows]


def get_framing_summary(session_id=None):
    with engine.connect() as conn:
        p = {}
        sid_filter = ""
        if session_id:
            sid_filter = "AND r.session_id = :sid"
            p["sid"] = session_id

        emotions = conn.execute(text(f"""
            SELECT pf.emotion_trigger, COUNT(*) FROM post_framing pf
            JOIN results r ON r.id = pf.result_id
            WHERE pf.emotion_trigger IS NOT NULL {sid_filter}
            GROUP BY pf.emotion_trigger ORDER BY 2 DESC
        """), p).fetchall()

        themes = conn.execute(text(f"""
            SELECT pf.narrative_theme, COUNT(*) FROM post_framing pf
            JOIN results r ON r.id = pf.result_id
            WHERE pf.narrative_theme IS NOT NULL {sid_filter}
            GROUP BY pf.narrative_theme ORDER BY 2 DESC
        """), p).fetchall()

        blame = conn.execute(text(f"""
            SELECT pf.blame_target, COUNT(*) FROM post_framing pf
            JOIN results r ON r.id = pf.result_id
            WHERE pf.blame_target IS NOT NULL {sid_filter}
            GROUP BY pf.blame_target ORDER BY 2 DESC LIMIT 10
        """), p).fetchall()

        techniques = conn.execute(text(f"""
            SELECT pf.manipulation_technique, COUNT(*) FROM post_framing pf
            JOIN results r ON r.id = pf.result_id
            WHERE pf.manipulation_technique IS NOT NULL
              AND pf.manipulation_technique != 'none' {sid_filter}
            GROUP BY pf.manipulation_technique ORDER BY 2 DESC
        """), p).fetchall()

    return {
        "emotions":   [{"label": r[0], "count": r[1]} for r in emotions],
        "themes":     [{"label": r[0], "count": r[1]} for r in themes],
        "blame":      [{"label": r[0], "count": r[1]} for r in blame],
        "techniques": [{"label": r[0], "count": r[1]} for r in techniques],
    }