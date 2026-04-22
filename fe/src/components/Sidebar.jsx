import { CookiePanel } from "./panels/CookiePanel";
import { SentimentPanel } from "./panels/SentimentPanel";
import { DetailScrapePanel } from "./panels/DetailScrapePanel";
import { t } from "../i18n";
import { BotPanel } from "./panels/BotPanel";
import { ImagePanel } from "./panels/ImagePanel";

export const Sidebar = ({ lang = "en",
  // Cookie
  cookieStatus, cookieKeys, onCookiesSaved,
  // Scrape controls
  keywords, setKeywords, maxPosts, setMaxPosts,
  autoSentiment, setAutoSentiment, hfConfigured,
  scraping, onStartScrape,
  minLikes, setMinLikes, scrapeDetail, setScrapeDetail,
  scraperProvider = "playwright",
  // Date filter  ← tambah
  dateFrom, setDateFrom, dateTo, setDateTo,
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

      {scraperProvider === "apify" ? (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            ⚡ Apify Mode
          </div>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
            Scraping via Apify cloud — no login required. Switch to 🎭 Playwright in header to use cookies.
          </div>
        </div>
      ) : (
        <CookiePanel cookieStatus={cookieStatus} cookieKeys={cookieKeys} onCookiesSaved={onCookiesSaved} lang={lang} />
      )}

      {/* Keywords */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>{t("keywords", lang)}</label>
        <div style={{ fontSize: 11, color: "#e2e8f0", margin: "4px 0 6px" }}>{t("keywordsHint", lang)}</div>
        <textarea value={keywords} onChange={e => setKeywords(e.target.value)}
          placeholder={"高市\n日本経済\n自民党"} disabled={scraping}
          style={{ width: "100%", height: 100, padding: "8px 10px", resize: "vertical" }} />
      </div>

      {/* Max posts */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>{t("maxPosts", lang)}</label>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ff2442" }}>{maxPosts}</span>
        </div>
        <input type="range" min={10} max={200} step={10} value={maxPosts} onChange={e => setMaxPosts(Number(e.target.value))}
          disabled={scraping} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 10, color: "#475569" }}>10</span>
          <span style={{ fontSize: 10, color: "#475569" }}>100</span>
          <span style={{ fontSize: 10, color: "#475569" }}>200</span>
        </div>
      </div>

      {/* Auto Sentiment */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>{t("autoSentiment", lang)}</div>
            <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 2 }}>{t("autoSentimentHint", lang)}</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={autoSentiment} onChange={e => setAutoSentiment(e.target.checked)} disabled={!hfConfigured || scraping} />
            <span className="slider"></span>
          </label>
        </div>
        {!hfConfigured && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>⚠️ Add HUGGINGFACE_API_KEY to .env</div>}
      </div>

      {/* Min Likes Filter */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>
            ❤️ Min Likes
          </label>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ff2442" }}>{minLikes > 0 ? minLikes.toLocaleString() : "All"}</span>
        </div>
        <input type="range" min={0} max={10000} step={100} value={minLikes}
          onChange={e => setMinLikes(Number(e.target.value))}
          disabled={scraping} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 10, color: "#475569" }}>0</span>
          <span style={{ fontSize: 10, color: "#475569" }}>5k</span>
          <span style={{ fontSize: 10, color: "#475569" }}>10k</span>
        </div>
        {minLikes > 0 && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>
            ⚠️ Only posts with ≥ {minLikes.toLocaleString()} likes
          </div>
        )}
      </div>

      {/* Date Filter */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          📅 Date Filter
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <label style={{ fontSize: 10, color: "#94a3b8", display: "block", marginBottom: 3 }}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              disabled={scraping}
              style={{
                width: "100%", padding: "5px 8px", fontSize: 12,
                background: "#1e293b", border: "1px solid #334155",
                color: dateFrom ? "#e2e8f0" : "#475569", borderRadius: 4,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#94a3b8", display: "block", marginBottom: 3 }}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              disabled={scraping}
              style={{
                width: "100%", padding: "5px 8px", fontSize: 12,
                background: "#1e293b", border: "1px solid #334155",
                color: dateTo ? "#e2e8f0" : "#475569", borderRadius: 4,
              }}
            />
          </div>
        </div>

        {/* Validation warning */}
        {dateFrom && dateTo && dateFrom > dateTo && (
          <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>
            ⚠️ "From" must be before "To"
          </div>
        )}

        {/* Active filter badge */}
        {(dateFrom || dateTo) && !(dateFrom && dateTo && dateFrom > dateTo) && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 6 }}>
            🗓 {dateFrom || "∞"} → {dateTo || "∞"}
          </div>
        )}

        {/* Clear button */}
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            disabled={scraping}
            style={{
              marginTop: 8, width: "100%", padding: "4px 0", fontSize: 10,
              background: "transparent", border: "1px solid #334155",
              color: "#94a3b8", borderRadius: 4, cursor: "pointer",
            }}
          >
            ✕ Clear dates
          </button>
        )}
      </div>

      {/* Auto Scrape Detail */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>🔍 Auto Detail</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Scrape content, comments & images</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={scrapeDetail} onChange={e => setScrapeDetail(e.target.checked)} disabled={scraping} />
            <span className="slider"></span>
          </label>
        </div>
        {scrapeDetail && (
          <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 6 }}>
            ⚠️ ~30s per post — scraping will be slower
          </div>
        )}
      </div>

      <button className="btn btn-red" onClick={onStartScrape} disabled={scraping} style={{ width: "100%" }}>
        {scraping ? t("scraping", lang) : t("startScrape", lang)}
      </button>

      <SentimentPanel
        hfConfigured={hfConfigured}
        sentimentStatus={sentimentStatus}
        onAnalysisStarted={onSentimentAnalysisStarted}
      lang={lang}
      />

      <DetailScrapePanel
        detailStatus={detailStatus}
        scraping={scraping}
        cookieStatus={cookieStatus}
        onStarted={onDetailScrapeStarted}
      lang={lang}
      />

      <BotPanel
        botStatus={botStatus}
        scraping={scraping}
        cookieStatus={cookieStatus}
        onStarted={onBotDetectionStarted}
      lang={lang}
      />

      <ImagePanel
        scraping={scraping}
        onStarted={onDetailScrapeStarted}
        lang={lang}
      />

      {/* Stats */}
      <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: t("keywords", lang), value: keywords.split("\n").filter(k => k.trim()).length },
          { label: t("results", lang),  value: results.length },
          { label: `😊 ${t("positive", lang)}`, value: sentimentCounts.positive },
          { label: `😞 ${t("negative", lang)}`, value: sentimentCounts.negative },
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