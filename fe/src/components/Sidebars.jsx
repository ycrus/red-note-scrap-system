import { CookiePanel } from "./panels/CookiePanel";
import { SentimentPanel } from "./panels/SentimentPanel";
import { DetailScrapePanel } from "./panels/DetailScrapePanel";
import { BotPanel } from "./panels/BotPanel";

export const Sidebar = ({
  // Cookie
  cookieStatus, cookieKeys, onCookiesSaved,
  // Scrape controls
  keywords, setKeywords, maxScroll, setMaxScroll,
  autoSentiment, setAutoSentiment, hfConfigured,
  scraping, onStartScrape,
  // Sentiment
  sentimentStatus, onSentimentAnalysisStarted,
  // Detail
  detailStatus, onDetailScrapeStarted,
  // Bot
  botStatus, onBotDetectionStarted,
  // Stats
  results,
}) => {
  const sentimentCounts = {
    positive: results.filter(r => r.sentiment === "positive").length,
    negative: results.filter(r => r.sentiment === "negative").length,
  };

  return (
    <div style={{ borderRight: "1px solid #2d3748", padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

      <CookiePanel cookieStatus={cookieStatus} cookieKeys={cookieKeys} onCookiesSaved={onCookiesSaved} />

      {/* Keywords */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>Keywords</label>
        <div style={{ fontSize: 11, color: "#e2e8f0", margin: "4px 0 6px" }}>One keyword per line</div>
        <textarea value={keywords} onChange={e => setKeywords(e.target.value)}
          placeholder={"高市\n日本経済\n自民党"} disabled={scraping}
          style={{ width: "100%", height: 100, padding: "8px 10px", resize: "vertical" }} />
      </div>

      {/* Scroll depth */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>Scroll Depth</label>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ff2442" }}>{maxScroll}x</span>
        </div>
        <input type="range" min={1} max={20} value={maxScroll} onChange={e => setMaxScroll(Number(e.target.value))}
          disabled={scraping} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer" }} />
      </div>

      {/* Auto Sentiment */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>🧠 Auto Sentiment</div>
            <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 2 }}>Analyze while scraping (slower)</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={autoSentiment} onChange={e => setAutoSentiment(e.target.checked)} disabled={!hfConfigured || scraping} />
            <span className="slider"></span>
          </label>
        </div>
        {!hfConfigured && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>⚠️ Add HUGGINGFACE_API_KEY to .env</div>}
      </div>

      <button className="btn btn-red" onClick={onStartScrape} disabled={scraping} style={{ width: "100%" }}>
        {scraping ? "⏳ Scraping..." : "▶ Start Scraping"}
      </button>

      <SentimentPanel
        hfConfigured={hfConfigured}
        sentimentStatus={sentimentStatus}
        onAnalysisStarted={onSentimentAnalysisStarted}
      />

      <DetailScrapePanel
        detailStatus={detailStatus}
        scraping={scraping}
        cookieStatus={cookieStatus}
        onStarted={onDetailScrapeStarted}
      />

      <BotPanel
        botStatus={botStatus}
        scraping={scraping}
        cookieStatus={cookieStatus}
        onStarted={onBotDetectionStarted}
      />

      {/* Stats */}
      <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Keywords", value: keywords.split("\n").filter(k => k.trim()).length },
          { label: "Results",  value: results.length },
          { label: "😊 Positive", value: sentimentCounts.positive },
          { label: "😞 Negative", value: sentimentCounts.negative },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ff2442", fontFamily: "Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};