from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

from database import init_db
from routes import scrape_bp, sentiment_bp, history_bp, analytics_bp, bot_bp, trending_bp, embed_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(scrape_bp)
app.register_blueprint(sentiment_bp)
app.register_blueprint(history_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(bot_bp)
app.register_blueprint(trending_bp)
app.register_blueprint(embed_bp)


if __name__ == "__main__":
    init_db()

    # Init pgvector embedding column
    try:
        from embedder import init_embedding_column
        init_embedding_column()
    except Exception as e:
        print(f"Embedding init warning: {e}")

    # Auto-load cookies from DB on startup
    try:
        from database import db_load_cookies
        from state import parse_cookie_string
        import state
        raw = db_load_cookies()
        if raw:
            state.current_cookies = parse_cookie_string(raw)
            print(f"🍪 Loaded {len(state.current_cookies)} cookies from DB")
        else:
            print("⚠️  No saved cookies found in DB")
    except Exception as e:
        print(f"⚠️  Could not load cookies: {e}")

    port = int(os.getenv("FLASK_PORT", 5001))
    print(f"🚀 Starting RedNote Scraper on port {port}")
    app.run(debug=True, port=port, threaded=True)