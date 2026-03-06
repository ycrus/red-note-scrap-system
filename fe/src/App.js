import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer, CartesianGrid } from "recharts";

const API = "http://localhost:5001";

const Badge = ({ ok, label }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: ok ? "#f0fdf4" : "#fff1f0",
    color: ok ? "#16a34a" : "#e53e3e",
    border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`
  }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#16a34a" : "#e53e3e", animation: ok ? "none" : "pulse 1s infinite" }} />
    {label}
  </span>
);

const SentimentBadge = ({ sentiment, score }) => {
  if (!sentiment) return <span style={{ color: "#334155", fontSize: 11 }}>—</span>;
  const config = {
    positive: { bg: "#f0fdf4", color: "#16a34a", border: "#86efac", icon: "😊" },
    negative: { bg: "#fff1f0", color: "#e53e3e", border: "#fca5a5", icon: "😞" },
    neutral:  { bg: "#f8fafc", color: "#64748b", border: "#cbd5e1", icon: "😐" },
  };
  const c = config[sentiment] || config.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`
    }}>
      {c.icon} {sentiment}
      {score && <span style={{ opacity: 0.7 }}>({Math.round(score * 100)}%)</span>}
    </span>
  );
};

export default function App() {
  const [keywords, setKeywords] = useState("");
  const [maxScroll, setMaxScroll] = useState(5);
  const [autoSentiment, setAutoSentiment] = useState(false);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [scraping, setScraping] = useState(false);
  const [tab, setTab] = useState("logs");
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");

  // Cookie state
  const [cookieRaw, setCookieRaw] = useState("");
  const [cookieKeys, setCookieKeys] = useState([]);
  const [cookieStatus, setCookieStatus] = useState("empty");
  const [showCookiePanel, setShowCookiePanel] = useState(false);

  // Sentiment analysis state
  const [sentimentStatus, setSentimentStatus] = useState({ analyzed: 0, total: 0, pending: 0, is_analyzing: false });
  const [hfConfigured, setHfConfigured] = useState(false);
  const [analyzeLimit, setAnalyzeLimit] = useState(50);

  // History state
  const [history, setHistory] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);

  // Detail post state
  const [detailPost, setDetailPost] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStatus, setDetailStatus] = useState({ total: 0, scraped: 0, pending: 0 });
  const [detailLimit, setDetailLimit] = useState(20);

  // Dashboard state
  const [dashKeywords, setDashKeywords] = useState([]);
  const [dashSentiment, setDashSentiment] = useState({ overall: [], by_keyword: [] });
  const [dashTimeline, setDashTimeline] = useState([]);
  const [dashAuthors, setDashAuthors] = useState([]);

  const logRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    fetch(`${API}/api/cookies`).then(r => r.json()).then(d => {
      if (d.count > 0) { setCookieKeys(d.keys); setCookieStatus("ok"); }
    }).catch(() => {});

    fetch(`${API}/api/status`).then(r => r.json()).then(d => {
      setHfConfigured(d.hf_configured || false);
    }).catch(() => {});

    fetchSentimentStatus();
    fetchHistory();
    fetchDetailStatus();
  }, []);

  const fetchHistory = () => {
    fetch(`${API}/api/history`).then(r => r.json()).then(d => setHistory(d)).catch(() => {});
  };

  const fetchDashboard = () => {
    fetch(`${API}/api/analytics/keywords`).then(r => r.json()).then(d => setDashKeywords(d)).catch(() => {});
    fetch(`${API}/api/analytics/sentiment`).then(r => r.json()).then(d => setDashSentiment(d)).catch(() => {});
    fetch(`${API}/api/analytics/timeline`).then(r => r.json()).then(d => setDashTimeline([...d].reverse())).catch(() => {});
    fetch(`${API}/api/analytics/top-authors`).then(r => r.json()).then(d => setDashAuthors(d)).catch(() => {});
  };

  const fetchDetailStatus = () => {
    fetch(`${API}/api/scrape/detail/status`).then(r => r.json()).then(d => setDetailStatus(d)).catch(() => {});
  };

  const openPostDetail = async (resultId) => {
    setDetailLoading(true);
    setDetailPost(null);
    try {
      const res = await fetch(`${API}/api/results/${resultId}/detail`);
      const data = await res.json();
      setDetailPost(data);
    } catch {}
    setDetailLoading(false);
  };

  const startDetailScrape = async (sessionId = null) => {
    if (cookieStatus !== "ok") return alert("Please set cookies first!");
    try {
      const body = { limit: detailLimit };
      if (sessionId) body.session_id = sessionId;
      const res = await fetch(`${API}/api/scrape/detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.status === "started") {
        setTab("logs");
      } else {
        alert(data.error || "Failed to start");
      }
    } catch (err) {
      alert("Connection error: " + err.message);
    }
  };

  const fetchSessionResults = async (sessionId) => {
    setSelectedSession(sessionId);
    setSessionResults([]);
    try {
      const res = await fetch(`${API}/api/history/${sessionId}`);
      const data = await res.json();
      setSessionResults(data);
    } catch {}
  };

  const fetchSentimentStatus = () => {
    fetch(`${API}/api/sentiment/status`).then(r => r.json()).then(d => {
      setSentimentStatus(d);
    }).catch(() => {});
  };

  // Poll sentiment status while analyzing
  useEffect(() => {
    if (!sentimentStatus.is_analyzing) return;
    const interval = setInterval(fetchSentimentStatus, 3000);
    return () => clearInterval(interval);
  }, [sentimentStatus.is_analyzing]);

  const saveCookies = async () => {
    if (!cookieRaw.trim()) return;
    try {
      const res = await fetch(`${API}/api/cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: cookieRaw.trim() })
      });
      const data = await res.json();
      if (data.status === "ok") {
        setCookieKeys(data.keys);
        setCookieStatus("ok");
        setShowCookiePanel(false);
      }
    } catch { setCookieStatus("error"); }
  };

  const startScrape = async () => {
    if (cookieStatus !== "ok") { setShowCookiePanel(true); return alert("Please set cookies first!"); }
    const kws = keywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) return alert("Please enter at least one keyword.");

    setLogs([]); setResults([]); setScraping(true); setTab("logs");
    if (esRef.current) esRef.current.close();

    try {
      await fetch(`${API}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: kws, max_scroll: maxScroll, auto_sentiment: autoSentiment })
      });

      const es = new EventSource(`${API}/api/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "ping") return;
        if (item.type === "log") setLogs(prev => [...prev, { ...item, id: Date.now() + Math.random() }]);
        else if (item.type === "result") setResults(prev => [...prev, item.data]);
        else if (item.type === "error") setLogs(prev => [...prev, { type: "error", message: item.message, time: item.time || "--", id: Date.now() }]);
        else if (item.type === "done") {
          setLogs(prev => [...prev, { type: "done", message: `✅ Done! ${item.total} results collected.`, time: new Date().toLocaleTimeString(), id: Date.now() }]);
          setScraping(false);
          setTab("results");
          fetchSentimentStatus();
          fetchHistory();
          fetchDashboard();
          es.close();
        }
      };
      es.onerror = () => { setScraping(false); es.close(); };
    } catch (err) {
      setScraping(false);
      setLogs(prev => [...prev, { type: "error", message: `Connection error: ${err.message}`, time: "--", id: Date.now() }]);
    }
  };

  const startManualAnalysis = async () => {
    try {
      const res = await fetch(`${API}/api/sentiment/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: analyzeLimit })
      });
      const data = await res.json();
      if (data.status === "started") {
        setSentimentStatus(prev => ({ ...prev, is_analyzing: true }));
      } else {
        alert(data.error || "Failed to start analysis");
      }
    } catch (err) {
      alert("Connection error: " + err.message);
    }
  };

  const filteredResults = results.filter(r => {
    const matchSearch = !search || r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.author?.toLowerCase().includes(search.toLowerCase()) ||
      r.keyword?.toLowerCase().includes(search.toLowerCase());
    const matchSentiment = sentimentFilter === "all" || r.sentiment === sentimentFilter;
    return matchSearch && matchSentiment;
  });

  const sentimentCounts = {
    positive: results.filter(r => r.sentiment === "positive").length,
    negative: results.filter(r => r.sentiment === "negative").length,
    neutral: results.filter(r => r.sentiment === "neutral").length,
    unanalyzed: results.filter(r => !r.sentiment).length,
  };

  const logColor = (type) => type === "error" ? "#ef4444" : type === "done" ? "#16a34a" : "#94a3b8";

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
        .btn-red { background: #ff2442; color: #fff; padding: 10px 20px; font-size: 13px; }
        .btn-red:not(:disabled):hover { background: #e01e38; transform: translateY(-1px); }
        .btn-ghost { background: #1e2330; color: #94a3b8; padding: 8px 14px; font-size: 12px; border: 1px solid #2d3748; }
        .btn-ghost:not(:disabled):hover { background: #2d3748; color: #e2e8f0; }
        .btn-green { background: #16a34a; color: #fff; padding: 8px 16px; font-size: 12px; }
        .btn-green:not(:disabled):hover { background: #15803d; }
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

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2d3748", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "#ff2442", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📕</div>
          <div>
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 17, fontWeight: 800 }}>RedNote Scraper</div>
            <div style={{ fontSize: 10, color: "#475569" }}>小红书 · Data Collector + Sentiment Analysis</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge ok={hfConfigured} label={hfConfigured ? "HF Connected" : "No HF Key"} />
          <Badge ok={cookieStatus === "ok"} label={cookieStatus === "ok" ? `Cookies OK (${cookieKeys.length})` : "No Cookies"} />
          <Badge ok={!scraping} label={scraping ? "Scraping..." : "Idle"} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: "calc(100vh - 57px)" }}>

        {/* Sidebar */}
        <div style={{ borderRight: "1px solid #2d3748", padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

          {/* Cookie Panel */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>🍪 Cookies</div>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setShowCookiePanel(p => !p)}>
                {showCookiePanel ? "Close" : cookieStatus === "ok" ? "Update" : "Set Cookies"}
              </button>
            </div>
            {showCookiePanel && (
              <div style={{ animation: "slideDown .2s ease" }}>
                <textarea value={cookieRaw} onChange={e => setCookieRaw(e.target.value)}
                  placeholder="a1=xxx; web_session=yyy; webId=zzz; ..."
                  style={{ width: "100%", height: 80, padding: "8px 10px", resize: "vertical", fontSize: 11, marginBottom: 8 }} />
                <button className="btn btn-green" style={{ width: "100%" }} onClick={saveCookies}>✓ Save Cookies</button>
              </div>
            )}
            {!showCookiePanel && cookieStatus === "ok" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {cookieKeys.map(k => <span key={k} style={{ background: "#1e2330", border: "1px solid #2d3748", borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#64748b" }}>{k}</span>)}
              </div>
            )}
            {!showCookiePanel && cookieStatus !== "ok" && (
              <div style={{ fontSize: 11, color: "#475569" }}>No cookies loaded. Click <strong style={{ color: "#ff2442" }}>Set Cookies</strong>.</div>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Keywords</label>
            <div style={{ fontSize: 11, color: "#475569", margin: "4px 0 6px" }}>One keyword per line</div>
            <textarea value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder={"高市\n日本経済\n自民党"} disabled={scraping}
              style={{ width: "100%", height: 100, padding: "8px 10px", resize: "vertical" }} />
          </div>

          {/* Scroll depth */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Scroll Depth</label>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#ff2442" }}>{maxScroll}x</span>
            </div>
            <input type="range" min={1} max={20} value={maxScroll} onChange={e => setMaxScroll(Number(e.target.value))}
              disabled={scraping} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer" }} />
          </div>

          {/* Auto Sentiment Toggle */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>🧠 Auto Sentiment</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>Analyze while scraping (slower)</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={autoSentiment} onChange={e => setAutoSentiment(e.target.checked)} disabled={!hfConfigured || scraping} />
                <span className="slider"></span>
              </label>
            </div>
            {!hfConfigured && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>⚠️ Add HUGGINGFACE_API_KEY to .env</div>}
          </div>

          <button className="btn btn-red" onClick={startScrape} disabled={scraping} style={{ width: "100%" }}>
            {scraping ? "⏳ Scraping..." : "▶ Start Scraping"}
          </button>

          {/* Manual Sentiment Analysis */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🔬 Sentiment Analysis</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[
                { label: "Analyzed", value: sentimentStatus.analyzed, color: "#16a34a" },
                { label: "Pending", value: sentimentStatus.pending, color: "#f59e0b" },
                { label: "Total", value: sentimentStatus.total, color: "#94a3b8" }
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center", background: "#0f1117", borderRadius: 8, padding: "8px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>Limit:</span>
              <input type="number" value={analyzeLimit} onChange={e => setAnalyzeLimit(Number(e.target.value))}
                min={1} max={500} style={{ width: 70, padding: "4px 8px" }} />
              <span style={{ fontSize: 10, color: "#334155" }}>results</span>
            </div>

            <button className="btn btn-purple" style={{ width: "100%" }}
              disabled={!hfConfigured || sentimentStatus.is_analyzing || sentimentStatus.pending === 0}
              onClick={startManualAnalysis}>
              {sentimentStatus.is_analyzing ? "⏳ Analyzing..." : "🔬 Analyze Now"}
            </button>

            {sentimentStatus.is_analyzing && (
              <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 6, textAlign: "center", animation: "pulse 1.5s infinite" }}>
                Processing with HuggingFace API...
              </div>
            )}
          </div>

          {/* Detail Scrape Panel */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🔍 Scrape Post Detail</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[
                { label: "Scraped", value: detailStatus.scraped, color: "#16a34a" },
                { label: "Pending", value: detailStatus.pending, color: "#f59e0b" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center", background: "#0f1117", borderRadius: 8, padding: "8px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#e2e8f0" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#e2e8f0" }}>Limit:</span>
              <input type="number" value={detailLimit} onChange={e => setDetailLimit(Number(e.target.value))}
                min={1} max={100} style={{ width: 60, padding: "4px 8px" }} />
              <span style={{ fontSize: 10, color: "#e2e8f0" }}>posts</span>
            </div>
            <button className="btn" onClick={() => startDetailScrape()}
              disabled={scraping || detailStatus.pending === 0}
              style={{ width: "100%", background: "#0ea5e9", color: "#fff", padding: "8px 16px", fontSize: 12 }}>
              {scraping ? "⏳ Running..." : "🔍 Fetch Details"}
            </button>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>
              Fetches full content, images & tags per post
            </div>
          </div>
          <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Keywords", value: keywords.split("\n").filter(k => k.trim()).length },
              { label: "Results", value: results.length },
              { label: "😊 Positive", value: sentimentCounts.positive },
              { label: "😞 Negative", value: sentimentCounts.negative },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#ff2442", fontFamily: "Syne, sans-serif" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #2d3748", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 5 }}>
              {["logs", "results", "history", "dashboard"].map(t => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => { setTab(t); if(t==="history") fetchHistory(); if(t==="dashboard") fetchDashboard(); }}>
                  {t === "logs" ? `📋 Logs (${logs.length})` : t === "results" ? `📊 Results (${results.length})` : t === "history" ? `🕘 History (${history.length})` : `📈 Dashboard`}
                </button>
              ))}
            </div>
            {tab === "results" && results.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Sentiment filter */}
                <div style={{ display: "flex", gap: 4 }}>
                  {["all", "positive", "negative", "neutral"].map(f => (
                    <button key={f} className="btn btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 11, background: sentimentFilter === f ? "#2d3748" : "#1e2330", color: sentimentFilter === f ? "#e2e8f0" : "#64748b" }}
                      onClick={() => setSentimentFilter(f)}>
                      {f === "all" ? "All" : f === "positive" ? "😊" : f === "negative" ? "😞" : "😐"}
                    </button>
                  ))}
                </div>
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: "6px 10px", width: 160 }} />
                <button className="btn btn-ghost" onClick={() => window.open(`${API}/api/download/csv`, "_blank")}>⬇ CSV</button>
              </div>
            )}
          </div>

          {/* Logs */}
          {tab === "logs" && (
            <div ref={logRef} style={{ flex: 1, padding: 20, overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
              {logs.length === 0 ? (
                <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 13 }}>Logs will appear here once scraping starts</div>
                </div>
              ) : logs.map(log => (
                <div key={log.id} style={{ display: "flex", gap: 12, fontSize: 12, animation: "fadeIn .15s ease", padding: "4px 0", borderBottom: "1px solid #1a1f2e" }}>
                  <span style={{ color: "#2d3748", minWidth: 56, flexShrink: 0 }}>{log.time}</span>
                  <span style={{ color: logColor(log.type) }}>{log.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {tab === "results" && (
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
              {filteredResults.length === 0 ? (
                <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
                  <div style={{ fontSize: 13 }}>{results.length === 0 ? "No results yet." : "No results match filter."}</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#1a1f2e", position: "sticky", top: 0 }}>
                      {["#", "Keyword", "Title", "Author", "Likes", "Date", "Sentiment", "Link"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2d3748", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #181c27" }}>
                        <td style={{ padding: "9px 12px", color: "#334155" }}>{i + 1}</td>
                        <td style={{ padding: "9px 12px" }}><span style={{ background: "#1e2330", padding: "2px 7px", borderRadius: 4, color: "#ff2442", fontSize: 10 }}>{r.keyword}</span></td>
                        <td style={{ padding: "9px 12px", maxWidth: 240 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div></td>
                        <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{r.author}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b", textAlign: "right" }}>{r.likes}</td>
                        <td style={{ padding: "9px 12px", color: "#475569", whiteSpace: "nowrap" }}>{r.date}</td>
                        <td style={{ padding: "9px 12px" }}><SentimentBadge sentiment={r.sentiment} score={r.sentiment_score} /></td>
                        <td style={{ padding: "9px 12px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open ↗</a>
                            {r.id && <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => openPostDetail(r.id)}>Detail</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* History */}
          {tab === "history" && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: selectedSession ? "280px 1fr" : "1fr", maxHeight: "calc(100vh - 100px)", overflow: "hidden" }}>

              {/* Session list */}
              <div style={{ borderRight: selectedSession ? "1px solid #2d3748" : "none", overflowY: "auto" }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🕘</div>
                    <div style={{ fontSize: 13 }}>No scraping sessions yet</div>
                  </div>
                ) : history.map(s => (
                  <div key={s.id} onClick={() => fetchSessionResults(s.id)}
                    style={{
                      padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid #1a1f2e",
                      background: selectedSession === s.id ? "#1e2330" : "transparent",
                      borderLeft: selectedSession === s.id ? "3px solid #ff2442" : "3px solid transparent",
                      transition: "all .15s"
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>Session #{s.id}</span>
                      <span style={{ fontSize: 10, color: s.finished_at ? "#16a34a" : "#f59e0b" }}>
                        {s.finished_at ? "✅ Done" : "⏳ Running"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {(s.keywords || []).map(k => (
                        <span key={k} style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 4, padding: "1px 6px", fontSize: 10, color: "#ff2442" }}>{k}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#475569" }}>
                      <span>📄 {s.total_results} results</span>
                      <span>🔄 {s.max_scroll}x scroll</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>
                      {s.started_at ? new Date(s.started_at).toLocaleString() : "—"}
                    </div>
                  </div>
                ))}
              </div>

              {/* Session detail */}
              {selectedSession && (
                <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #2d3748", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>Session #{selectedSession} — {sessionResults.length} results</span>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setSelectedSession(null); setSessionResults([]); }}>✕ Close</button>
                  </div>
                  {sessionResults.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 40, fontSize: 13 }}>Loading...</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#1a1f2e", position: "sticky", top: 0 }}>
                          {["#", "Keyword", "Title", "Author", "Likes", "Date", "Sentiment", "Link"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2d3748", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sessionResults.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #181c27" }}>
                            <td style={{ padding: "8px 12px", color: "#334155" }}>{i + 1}</td>
                            <td style={{ padding: "8px 12px" }}><span style={{ background: "#1e2330", padding: "2px 6px", borderRadius: 4, color: "#ff2442", fontSize: 10 }}>{r.keyword}</span></td>
                            <td style={{ padding: "8px 12px", maxWidth: 220 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div></td>
                            <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{r.author}</td>
                            <td style={{ padding: "8px 12px", color: "#64748b", textAlign: "right" }}>{r.likes}</td>
                            <td style={{ padding: "8px 12px", color: "#475569", whiteSpace: "nowrap" }}>{r.date}</td>
                            <td style={{ padding: "8px 12px" }}><SentimentBadge sentiment={r.sentiment} score={r.sentiment_score} /></td>
                            <td style={{ padding: "8px 12px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open ↗</a>
                                {r.id && <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => openPostDetail(r.id)}>Detail</button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Dashboard */}
          {tab === "dashboard" && (() => {
            const COLORS = { positive: "#16a34a", negative: "#ef4444", neutral: "#64748b" };
            const PIE_COLORS = ["#16a34a", "#ef4444", "#64748b", "#f59e0b"];
            const totalResults = dashKeywords.reduce((a, b) => a + b.total, 0);

            const StatCard = ({ label, value, sub, color }) => (
              <div className="card" style={{ padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: color || "#ff2442", fontFamily: "Syne, sans-serif" }}>{value}</div>
                <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>{label}</div>
                {sub && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{sub}</div>}
              </div>
            );

            return (
              <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)", padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>Analytics Dashboard</div>
                  <button className="btn btn-ghost" onClick={fetchDashboard} style={{ fontSize: 11 }}>↻ Refresh</button>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                  <StatCard label="Total Posts" value={totalResults} />
                  <StatCard label="Keywords Tracked" value={dashKeywords.length} color="#7c3aed" />
                  <StatCard label="Positive" value={dashSentiment.overall.find(s => s.sentiment === "positive")?.total || 0} color="#16a34a" />
                  <StatCard label="Negative" value={dashSentiment.overall.find(s => s.sentiment === "negative")?.total || 0} color="#ef4444" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

                  {/* Keyword Volume Bar Chart */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>📊 Posts per Keyword</div>
                    {dashKeywords.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#334155", padding: "30px 0", fontSize: 12 }}>No data yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={dashKeywords.slice(0, 10)} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" />
                          <XAxis dataKey="keyword" tick={{ fill: "#64748b", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e2e8f0" }} />
                          <Bar dataKey="total" fill="#ff2442" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Sentiment Pie Chart */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>🎭 Sentiment Distribution</div>
                    {dashSentiment.overall.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#334155", padding: "30px 0", fontSize: 12 }}>No sentiment data yet — run analysis first</div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <ResponsiveContainer width="60%" height={200}>
                          <PieChart>
                            <Pie data={dashSentiment.overall} dataKey="total" nameKey="sentiment" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                              {dashSentiment.overall.map((entry, i) => (
                                <Cell key={i} fill={COLORS[entry.sentiment] || PIE_COLORS[i]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {dashSentiment.overall.map((s, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[s.sentiment] || PIE_COLORS[i], flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize" }}>{s.sentiment}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginLeft: "auto" }}>{s.total}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                  {/* Timeline */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>📅 Scraping Timeline</div>
                    {dashTimeline.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#334155", padding: "30px 0", fontSize: 12 }}>No data yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={dashTimeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" />
                          <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 9 }} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }} />
                          <Line type="monotone" dataKey="total" stroke="#ff2442" strokeWidth={2} dot={{ fill: "#ff2442", r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Top Authors */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>👤 Top Authors</div>
                    {dashAuthors.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#334155", padding: "30px 0", fontSize: 12 }}>No data yet</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                        {dashAuthors.slice(0, 8).map((a, i) => {
                          const pct = Math.round((a.total / dashAuthors[0].total) * 100);
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: "#475569", minWidth: 16, textAlign: "right" }}>{i + 1}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <span style={{ fontSize: 11, color: "#e2e8f0" }}>{a.author}</span>
                                  <span style={{ fontSize: 11, color: "#64748b" }}>{a.total}</span>
                                </div>
                                <div style={{ height: 4, background: "#1e2330", borderRadius: 2 }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: "#ff2442", borderRadius: 2, transition: "width .5s" }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>
      {/* Post Detail Modal */}
      {(detailPost || detailLoading) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => { setDetailPost(null); }}>
          <div style={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "85vh", overflowY: "auto", padding: 28 }}
            onClick={e => e.stopPropagation()}>

            {detailLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div>Loading post detail...</div>
              </div>
            ) : detailPost && (
              <>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 8 }}>{detailPost.title}</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748b" }}>
                      <span>👤 {detailPost.author}</span>
                      <span>❤️ {detailPost.likes}</span>
                      {detailPost.comments_count && <span>💬 {detailPost.comments_count}</span>}
                      <span>📅 {detailPost.date}</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }} onClick={() => setDetailPost(null)}>✕</button>
                </div>

                {/* Sentiment */}
                {detailPost.sentiment && (
                  <div style={{ marginBottom: 16 }}>
                    <SentimentBadge sentiment={detailPost.sentiment} score={detailPost.sentiment_score} />
                  </div>
                )}

                {/* Images */}
                {detailPost.images && detailPost.images.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Images ({detailPost.images.length})</div>
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                      {detailPost.images.map((src, i) => (
                        <img key={i} src={src} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #2d3748" }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Content */}
                {detailPost.content ? (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Content</div>
                    <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.7, background: "#0f1117", padding: 14, borderRadius: 8, border: "1px solid #2d3748", whiteSpace: "pre-wrap" }}>
                      {detailPost.content}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 20, padding: 16, background: "#0f1117", borderRadius: 8, border: "1px solid #2d3748", textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#334155" }}>
                      {detailPost.detail_scraped ? "No content found for this post" : "Detail not scraped yet — click Fetch Details in sidebar"}
                    </div>
                    {!detailPost.detail_scraped && (
                      <button className="btn" onClick={() => { setDetailPost(null); startDetailScrape(); }}
                        style={{ marginTop: 10, background: "#0ea5e9", color: "#fff", padding: "6px 16px", fontSize: 11 }}>
                        🔍 Fetch Now
                      </button>
                    )}
                  </div>
                )}

                {/* Tags */}
                {detailPost.tags && detailPost.tags.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tags</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {detailPost.tags.map((tag, i) => (
                        <span key={i} style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#ff2442" }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Link */}
                <a href={detailPost.link} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0ea5e9", marginTop: 4 }}>
                  Open original post ↗
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}