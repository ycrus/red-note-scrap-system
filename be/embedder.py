import time
import os
import state
from database import engine
from sqlalchemy import text

EMBED_DIM = 384
_model = None


def get_model():
    """Load sentence-transformers model (lokal, tidak butuh API)."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            state.push_log("Loading embedding model (first time ~30s)...")
            _model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
            state.push_log("Embedding model loaded!")
        except ImportError:
            state.push_error("sentence-transformers not installed. Run: pip3 install sentence-transformers --break-system-packages")
            return None
        except Exception as e:
            state.push_error(f"Model load error: {e}")
            return None
    return _model


def get_embedding(text_input):
    """Generate embedding untuk satu teks."""
    model = get_model()
    if not model:
        return None
    try:
        emb = model.encode(text_input, normalize_embeddings=True)
        return emb.tolist()
    except Exception as e:
        print(f"Embedding error: {e}")
        return None


def get_embeddings_batch(texts):
    """Generate embeddings untuk list of texts sekaligus."""
    model = get_model()
    if not model:
        return []
    try:
        embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
        return [e.tolist() for e in embeddings]
    except Exception as e:
        print(f"Batch embedding error: {e}")
        return []


def init_embedding_column():
    """Tambah kolom embedding ke tabel results jika belum ada."""
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except:
            conn.rollback()

        try:
            conn.execute(text(f"""
                ALTER TABLE results
                ADD COLUMN IF NOT EXISTS embedding vector({EMBED_DIM})
            """))
            conn.commit()
            print(f"Embedding column ready (dim={EMBED_DIM})")
        except Exception as e:
            conn.rollback()
            print(f"Embedding column error: {e}")

        # Index untuk similarity search (buat setelah ada data)
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS results_embedding_idx
                ON results USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 10)
            """))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Index warning (ok if no data yet): {e}")


def run_embed_posts(limit=100):
    """Generate embeddings untuk posts yang belum punya embedding."""
    # Ambil posts yang belum di-embed
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, title FROM results
            WHERE title IS NOT NULL
              AND embedding IS NULL
            ORDER BY scraped_at DESC
            LIMIT :lim
        """), {"lim": limit}).fetchall()

    if not rows:
        state.push_log("All posts already have embeddings.")
        state.push_done(0)
        state.is_scraping = False
        return

    state.push_log(f"Generating embeddings for {len(rows)} posts...")

    # Load model sekali
    model = get_model()
    if not model:
        state.is_scraping = False
        return

    total = len(rows)
    done = 0
    batch_size = 32

    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        titles = [r[1] for r in batch]
        ids = [r[0] for r in batch]

        state.push_log(f"   Batch {i//batch_size + 1}: {len(titles)} posts...")

        try:
            embeddings = get_embeddings_batch(titles)
        except Exception as e:
            state.push_log(f"   Batch error: {e}, trying one by one...")
            embeddings = [get_embedding(t) for t in titles]

        with engine.connect() as conn:
            for row_id, emb in zip(ids, embeddings):
                if emb and len(emb) == EMBED_DIM:
                    try:
                        conn.execute(text("""
                            UPDATE results SET embedding = :emb WHERE id = :id
                        """), {"emb": str(emb), "id": row_id})
                        done += 1
                    except Exception as e:
                        print(f"Save error id={row_id}: {e}")
            conn.commit()

        state.push_log(f"   Done: {done}/{total}")

    state.push_log(f"Embedding complete: {done}/{total} posts")
    state.push_done(done)
    state.is_scraping = False


def semantic_search(query, limit=20, session_id=None):
    """Cari post yang semantically mirip dengan query."""
    query_emb = get_embedding(query)
    if not query_emb:
        return [], "Failed to generate query embedding"

    try:
        with engine.connect() as conn:
            params = {"qemb": str(query_emb), "lim": limit}
            if session_id:
                params["sid"] = session_id
                sql = """
                    SELECT id, keyword, title, author, likes, post_date,
                           sentiment, link,
                           1 - (embedding <=> CAST(:qemb AS vector)) AS similarity
                    FROM results
                    WHERE embedding IS NOT NULL AND session_id = :sid
                    ORDER BY embedding <=> CAST(:qemb AS vector)
                    LIMIT :lim
                """
            else:
                sql = """
                    SELECT id, keyword, title, author, likes, post_date,
                           sentiment, link,
                           1 - (embedding <=> CAST(:qemb AS vector)) AS similarity
                    FROM results
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:qemb AS vector)
                    LIMIT :lim
                """
            rows = conn.execute(text(sql), params).fetchall()

        results = [{
            "id": r[0], "keyword": r[1], "title": r[2],
            "author": r[3], "likes": r[4], "date": r[5],
            "sentiment": r[6], "link": r[7],
            "similarity": round(float(r[8]), 4),
        } for r in rows]

        return results, None

    except Exception as e:
        return [], str(e)


def embedding_status():
    """Status berapa post sudah punya embedding."""
    try:
        with engine.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM results")).fetchone()[0]
            embedded = conn.execute(text(
                "SELECT COUNT(*) FROM results WHERE embedding IS NOT NULL"
            )).fetchone()[0]
        return {"total": total, "embedded": embedded, "pending": total - embedded}
    except:
        return {"total": 0, "embedded": 0, "pending": 0}