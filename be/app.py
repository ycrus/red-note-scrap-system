from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

from database import init_db
from routes import scrape_bp, sentiment_bp, history_bp, analytics_bp, bot_bp, trending_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(scrape_bp)
app.register_blueprint(sentiment_bp)
app.register_blueprint(history_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(bot_bp)
app.register_blueprint(trending_bp)


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("FLASK_PORT", 5001))
    print(f"🚀 Starting RedNote Scraper on port {port}")
    app.run(debug=True, port=port, threaded=True)