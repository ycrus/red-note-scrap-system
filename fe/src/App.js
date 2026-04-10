import { useState, useEffect, useRef } from "react";
import { t, getLang, setLang } from "./i18n";
import { LanguageSwitcher } from "./components/ui/LanguageSwitcher";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { LogsTab } from "./components/tabs/LogsTab";
import { ResultsTab } from "./components/tabs/ResultsTab";
import { HistoryTab } from "./components/tabs/HistoryTab";
import { DashboardTab } from "./components/tabs/DashboardTab";
import { TrendingTab } from "./components/tabs/TrendingTab";
import { SemanticSearchTab } from "./components/tabs/SemanticSearchTab";
import { CIBTab } from "./components/tabs/CIBTab";
import { PostDetailModal } from "./components/ui/PostDetailModal";
import {
  getCookies, getStatus, startScrape, createEventSource,
  startDetailScrape, getDetailStatus, getResultDetail,
  getSentimentStatus, getHistory,
  getAnalyticsKeywords, getAnalyticsSentiment,
  getAnalyticsTimeline, getAnalyticsTopAuthors,
} from "./api";

export default function App() {
  // ── Scrape state ──────────────────────────────────
  const [keywords, setKeywords]     = useState("");
  const [maxPosts, setMaxPosts]     = useState(50);
  const [autoSentiment, setAutoSentiment] = useState(false);
  const [minLikes, setMinLikes]         = useState(0);
  const [scrapeDetail, setScrapeDetail] = useState(false);
  const [logs, setLogs]             = useState([]);
  const [results, setResults]       = useState([]);
  const [scraping, setScraping]     = useState(false);
  const [tab, setTab]               = useState("logs");

  // ── Cookie state ──────────────────────────────────
  const [cookieStatus, setCookieStatus] = useState("empty");
  const [cookieKeys, setCookieKeys]     = useState([]);

  // ── HF state ──────────────────────────────────────
  const [hfConfigured, setHfConfigured]   = useState(false);
  const [scraperProvider, setScraperProvider] = useState("playwright");
  const [sentimentStatus, setSentimentStatus] = useState({ analyzed: 0, total: 0, pending: 0, is_analyzing: false });

  // ── History state ─────────────────────────────────
  const [history, setHistory] = useState([]);

  // ── Detail state ──────────────────────────────────
  const [detailPost, setDetailPost]     = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStatus, setDetailStatus] = useState({ total: 0, scraped: 0, pending: 0 });

  // ── Bot state ─────────────────────────────────────
  const [botStatus, setBotStatus] = useState({ total: 0, checked: 0, pending: 0 });

  // ── Dashboard state ───────────────────────────────
  const [dashKeywords, setDashKeywords]   = useState([]);
  const [dashSentiment, setDashSentiment] = useState({ overall: [], by_keyword: [] });
  const [dashTimeline, setDashTimeline]   = useState([]);
  const [dashAuthors, setDashAuthors]     = useState([]);

  const [lang, setLangState] = useState(getLang());
  const esRef = useRef(null);

  const handleChangeLang = (code) => { setLang(code); setLangState(code); };
  const handleProviderChange = (p) => setScraperProvider(p);

  // ── Init ──────────────────────────────────────────
  useEffect(() => {
    getCookies().then(d => { if (d.count > 0) { setCookieKeys(d.keys); setCookieStatus("ok"); } }).catch(() => {});
    getStatus().then(d => {
      setHfConfigured(d.hf_configured || false);
      setScraperProvider(d.scraper_provider || "playwright");
    }).catch(() => {});
    fetch("http://localhost:5001/api/provider")
      .then(r => r.json())
      .then(d => setScraperProvider(d.provider || "playwright"))
      .catch(() => {});
    getSentimentStatus().then(setSentimentStatus).catch(() => {});
    getHistory().then(setHistory).catch(() => {});
    getDetailStatus().then(setDetailStatus).catch(() => {});
    fetch("http://localhost:5001/api/bot/status").then(r => r.json()).then(setBotStatus).catch(() => {});
  }, []);

  // ── Poll sentiment while analyzing ────────────────
  useEffect(() => {
    if (!sentimentStatus.is_analyzing) return;
    const interval = setInterval(() => getSentimentStatus().then(setSentimentStatus).catch(() => {}), 3000);
    return () => clearInterval(interval);
  }, [sentimentStatus.is_analyzing]);

  // ── Helpers ───────────────────────────────────────
  const fetchDashboard = () => {
    getAnalyticsKeywords().then(setDashKeywords).catch(() => {});
    getAnalyticsSentiment().then(setDashSentiment).catch(() => {});
    getAnalyticsTimeline().then(d => setDashTimeline([...d].reverse())).catch(() => {});
    getAnalyticsTopAuthors().then(setDashAuthors).catch(() => {});
  };

  const subscribeToStream = (onDone) => {
    if (esRef.current) esRef.current.close();
    const es = createEventSource();
    esRef.current = es;
    es.onmessage = (e) => {
      const item = JSON.parse(e.data);
      if (item.type === "ping") return;
      if (item.type === "log")   setLogs(prev => [...prev, { ...item, id: Date.now() + Math.random() }]);
      if (item.type === "error") setLogs(prev => [...prev, { type: "error", message: item.message, time: item.time || "--", id: Date.now() }]);
      if (item.type === "result") setResults(prev => [...prev, item.data]);
      if (item.type === "done") { onDone(item); es.close(); }
    };
    es.onerror = () => es.close();
  };

  // ── Handlers ──────────────────────────────────────
  const handleStartScrape = async () => {
    if (cookieStatus !== "ok") return alert("Please set cookies first!");
    const kws = keywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) return alert("Please enter at least one keyword.");

    setLogs([]); setResults([]); setScraping(true); setTab("logs");

    try {
      await startScrape(kws, maxPosts, autoSentiment, minLikes, scrapeDetail);
      subscribeToStream((item) => {
        setLogs(prev => [...prev, { type: "done", message: `✅ Done! ${item.total} results collected.`, time: new Date().toLocaleTimeString(), id: Date.now() }]);
        setScraping(false);
        setTab("results");
        getSentimentStatus().then(setSentimentStatus).catch(() => {});
        getHistory().then(setHistory).catch(() => {});
        fetchDashboard();
      });
    } catch (err) {
      setScraping(false);
      setLogs(prev => [...prev, { type: "error", message: `Connection error: ${err.message}`, time: "--", id: Date.now() }]);
    }
  };

  const handleBotDetectionStarted = () => {
    setTab("logs");
    setLogs([]);
    subscribeToStream((item) => {
      setLogs(prev => [...prev, { type: "done", message: `✅ Bot detection done! ${item.total} authors analyzed.`, time: new Date().toLocaleTimeString(), id: Date.now() }]);
      fetch("http://localhost:5001/api/bot/status").then(r => r.json()).then(setBotStatus).catch(() => {});
    });
  };

  const handleTrendingScrapeStarted = () => {
    setTab("logs");
    setLogs([]);
    subscribeToStream((item) => {
      setLogs(prev => [...prev, { type: "done", message: `Trending scrape done! ${item.total} items found.`, time: new Date().toLocaleTimeString(), id: Date.now() }]);
      setScraping(false);
    });
  };

  const handleDetailScrapeStarted = () => {
    setTab("logs");
    setLogs([]);
    subscribeToStream((item) => {
      setLogs(prev => [...prev, { type: "done", message: `✅ Detail scraping done! ${item.total} posts updated.`, time: new Date().toLocaleTimeString(), id: Date.now() }]);
      getDetailStatus().then(setDetailStatus).catch(() => {});
    });
  };

  const handleOpenDetail = async (id) => {
    setDetailLoading(true);
    setDetailPost(null);
    try {
      const data = await getResultDetail(id);
      setDetailPost(data);
    } catch {}
    setDetailLoading(false);
  };

  // ── Tab labels ────────────────────────────────────
  const tabLabel = (tab) => ({
    logs:      `${t("tabLogs", lang)} (${logs.length})`,
    results:   `${t("tabResults", lang)} (${results.length})`,
    history:   `${t("tabHistory", lang)} (${history.length})`,
    dashboard: t("tabDashboard", lang),
    trending:  t("tabTrending", lang),
    search:    "🔎 Semantic Search",
    cib:       "🛡 CIB",
  }[tab]);

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1e2330; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; }
        .btn { cursor: pointer; border: none; border-radius: 8px; font-family: inherit; font-weight: 600; transition: all .15s; }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .btn-red    { background: #ff2442; color: #fff; padding: 10px 20px; font-size: 13px; }
        .btn-red:not(:disabled):hover    { background: #e01e38; transform: translateY(-1px); }
        .btn-ghost  { background: #1e2330; color: #94a3b8; padding: 8px 14px; font-size: 12px; border: 1px solid #2d3748; }
        .btn-ghost:not(:disabled):hover  { background: #2d3748; color: #e2e8f0; }
        .btn-green  { background: #16a34a; color: #fff; padding: 8px 16px; font-size: 12px; }
        .btn-green:not(:disabled):hover  { background: #15803d; }
        .btn-purple { background: #7c3aed; color: #fff; padding: 8px 16px; font-size: 12px; }
        .btn-purple:not(:disabled):hover { background: #6d28d9; }
        input, textarea { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; color: #e2e8f0; font-family: inherit; font-size: 12px; outline: none; transition: border .15s; }
        input:focus, textarea:focus { border-color: #ff2442; }
        .tab { padding: 7px 16px; cursor: pointer; border-radius: 7px; font-size: 12px; font-weight: 600; transition: all .15s; border: none; background: transparent; color: #64748b; font-family: inherit; }
        .tab.active { background: #1e2330; color: #e2e8f0; border: 1px solid #2d3748; }
        tr:hover td { background: #1a2030 !important; }
        a { color: #ff2442; text-decoration: none; } a:hover { text-decoration: underline; }
        .toggle { position: relative; display: inline-block; width: 36px; height: 20px; }
        .toggle input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; inset: 0; background: #2d3748; border-radius: 20px; transition: .3s; }
        .slider:before { position: absolute; content: ""; width: 14px; height: 14px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; }
        input:checked + .slider { background: #7c3aed; }
        input:checked + .slider:before { transform: translateX(16px); }
      `}</style>

      <Header
        hfConfigured={hfConfigured}
        cookieStatus={cookieStatus}
        cookieKeys={cookieKeys}
        scraping={scraping}
        scraperProvider={scraperProvider}
        onProviderChange={handleProviderChange}
      />

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: "calc(100vh - 57px)" }}>
        <Sidebar
          cookieStatus={cookieStatus}
          cookieKeys={cookieKeys}
          onCookiesSaved={(keys) => { setCookieKeys(keys); setCookieStatus("ok"); }}
          keywords={keywords} setKeywords={setKeywords}
          maxPosts={maxPosts} setMaxPosts={setMaxPosts}
          autoSentiment={autoSentiment} setAutoSentiment={setAutoSentiment}
          hfConfigured={hfConfigured}
          scraping={scraping}
          onStartScrape={handleStartScrape}
          minLikes={minLikes} setMinLikes={setMinLikes}
          scrapeDetail={scrapeDetail} setScrapeDetail={setScrapeDetail}
          sentimentStatus={sentimentStatus}
          onSentimentAnalysisStarted={() => setSentimentStatus(p => ({ ...p, is_analyzing: true }))}
          detailStatus={detailStatus}
          onDetailScrapeStarted={handleDetailScrapeStarted}
          botStatus={botStatus}
          onBotDetectionStarted={handleBotDetectionStarted}
          results={results}
          lang={lang}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Tab bar */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #2d3748", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 5 }}>
              {["logs", "results", "history", "dashboard", "trending", "search", "cib"].map(t => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`}
                  onClick={() => { setTab(t); if (t === "history") getHistory().then(setHistory).catch(() => {}); if (t === "dashboard") fetchDashboard(); }}>
                  {tabLabel(t)}
                </button>
              ))}
            </div>
            <LanguageSwitcher lang={lang} onChangeLang={handleChangeLang} />
          </div>

          {tab === "logs"      && <LogsTab logs={logs} lang={lang} />}
          {tab === "results"   && <ResultsTab results={results} onOpenDetail={handleOpenDetail} lang={lang} />}
          {tab === "history"   && <HistoryTab history={history} onOpenDetail={handleOpenDetail} lang={lang} />}
          {tab === "search" && <SemanticSearchTab lang={lang} />}
          {tab === "cib" && <CIBTab lang={lang} />}
          {tab === "trending" && (
            <TrendingTab
              scraping={scraping}
              onScrapeStarted={() => { setScraping(true); handleTrendingScrapeStarted(); }}
              lang={lang}
            />
          )}
          {tab === "dashboard" && (
            <DashboardTab
              keywords={dashKeywords}
              sentiment={dashSentiment}
              timeline={dashTimeline}
              authors={dashAuthors}
              onRefresh={fetchDashboard}
              lang={lang}
            />
          )}
        </div>
      </div>

      <PostDetailModal
        post={detailPost}
        loading={detailLoading}
        onClose={() => setDetailPost(null)}
        onFetchDetail={handleDetailScrapeStarted}
        lang={lang}
      />
    </div>
  );
}