import requests as http_requests
import time
import os
from database import db_get_unanalyzed_ids, db_update_sentiment

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY", "")
HF_MODEL = "lxyuan/distilbert-base-multilingual-cased-sentiments-student"
HF_URL = f"https://router.huggingface.co/hf-inference/models/{HF_MODEL}"


def analyze_sentiment(title):
    """Call HuggingFace API to get sentiment of a single title."""
    if not HF_API_KEY:
        print("❌ No HF API key!")
        return None, None
    try:
        print(f"🔍 Analyzing: {title[:50]}")
        resp = http_requests.post(
            HF_URL,
            headers={"Authorization": f"Bearer {HF_API_KEY}"},
            json={"inputs": title},
            timeout=15
        )
        print(f"   Status: {resp.status_code} | Response: {resp.text[:300]}")
        data = resp.json()

        # Handle cold start / model loading
        if isinstance(data, dict) and "error" in data:
            print(f"   HF Error: {data['error']}")
            if "loading" in data.get("error", "").lower():
                time.sleep(10)
                resp = http_requests.post(
                    HF_URL,
                    headers={"Authorization": f"Bearer {HF_API_KEY}"},
                    json={"inputs": title},
                    timeout=20
                )
                data = resp.json()
                print(f"   Retry: {resp.text[:300]}")

        if isinstance(data, list) and len(data) > 0:
            scores = data[0] if isinstance(data[0], list) else data
            best = max(scores, key=lambda x: x["score"])
            print(f"   ✅ {best['label']} ({best['score']:.2f})")
            return best["label"].lower(), round(best["score"], 4)
        else:
            print(f"   ⚠️ Unexpected format: {data}")

    except Exception as e:
        print(f"❌ Sentiment exception: {e}")

    return None, None


def analyze_batch(result_ids):
    """Analyze sentiment for a batch of result IDs, updating DB directly."""
    from database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, title FROM results
            WHERE id = ANY(:ids) AND sentiment IS NULL
        """), {"ids": result_ids}).fetchall()

    updated = 0
    for row_id, title in rows:
        if not title:
            continue
        sentiment, score = analyze_sentiment(title)
        if sentiment:
            db_update_sentiment(row_id, sentiment, score)
            updated += 1
        time.sleep(0.3)  # Rate limit buffer

    return updated


def is_configured():
    return bool(HF_API_KEY)