import { useState, useEffect, useRef } from "react";

const API = "http://localhost:5001";

const StatusBadge = ({ scraping }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: scraping ? "#fff1f0" : "#f0fdf4",
    color: scraping ? "#e53e3e" : "#16a34a",
    border: `1px solid ${scraping ? "#fca5a5" : "#86efac"}`
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: "50%",
      background: scraping ? "#e53e3e" : "#16a34a",
      animation: scraping ? "pulse 1s infinite" : "none"
    }} />
    {scraping ? "Scraping..." : "Idle"}
  </span>
);

export default function App() {
  const [keywords, setKeywords] = useState("");
  const [maxScroll, setMaxScroll] = useState(5);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [scraping, setScraping] = useState(false);
  const [tab, setTab] = useState("logs");
  const [search, setSearch] = useState("");
  const logRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const startScrape = async () => {
    const kws = keywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) return alert("Please enter at least one keyword.");

    setLogs([]);
    setResults([]);
    setScraping(true);
    setTab("logs");

    // Close existing stream
    if (esRef.current) esRef.current.close();

    try {
      await fetch(`${API}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: kws, max_scroll: maxScroll })
      });

      const es = new EventSource(`${API}/api/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "ping") return;

        if (item.type === "log") {
          setLogs(prev => [...prev, { ...item, id: Date.now() + Math.random() }]);
        } else if (item.type === "result") {
          setResults(prev => [...prev, item.data]);
        } else if (item.type === "error") {
          setLogs(prev => [...prev, { type: "error", message: item.message, time: item.time || "--", id: Date.now() }]);
        } else if (item.type === "done") {
          setLogs(prev => [...prev, {
            type: "done", message: `✅ Done! Total ${item.total} results collected.`,
            time: new Date().toLocaleTimeString(), id: Date.now()
          }]);
          setScraping(false);
          setTab("results");
          es.close();
        }
      };

      es.onerror = () => {
        setScraping(false);
        es.close();
      };
    } catch (err) {
      setScraping(false);
      setLogs(prev => [...prev, { type: "error", message: `Connection error: ${err.message}`, time: "--", id: Date.now() }]);
    }
  };

  const downloadCSV = () => {
    window.open(`${API}/api/download/csv`, "_blank");
  };

  const filteredResults = results.filter(r =>
    !search || r.title?.toLowerCase().includes(search.toLowerCase()) ||
    r.author?.toLowerCase().includes(search.toLowerCase()) ||
    r.keyword?.toLowerCase().includes(search.toLowerCase())
  );

  const logColor = (type) => {
    if (type === "error") return "#ef4444";
    if (type === "done") return "#16a34a";
    return "#94a3b8";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #1e2330; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; }
        .btn { cursor: pointer; border: none; border-radius: 8px; font-family: inherit; font-weight: 600; transition: all .15s; }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .btn-primary { background: #ff2442; color: #fff; padding: 10px 24px; font-size: 14px; }
        .btn-primary:not(:disabled):hover { background: #e01e38; transform: translateY(-1px); }
        .btn-secondary { background: #1e2330; color: #94a3b8; padding: 8px 16px; font-size: 13px; border: 1px solid #2d3748; }
        .btn-secondary:not(:disabled):hover { background: #2d3748; color: #e2e8f0; }
        .tab { padding: 8px 20px; cursor: pointer; border-radius: 8px; font-size: 13px; font-weight: 600; transition: all .15s; border: none; background: transparent; color: #64748b; font-family: inherit; }
        .tab.active { background: #1e2330; color: #e2e8f0; border: 1px solid #2d3748; }
        .tab:not(.active):hover { color: #94a3b8; }
        input, textarea { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; color: #e2e8f0; font-family: inherit; font-size: 13px; outline: none; transition: border .15s; }
        input:focus, textarea:focus { border-color: #ff2442; }
        tr:hover td { background: #1e2330 !important; }
        a { color: #ff2442; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2d3748", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "#ff2442", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📕</div>
          <div>
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>RedNote Scraper</div>
            <div style={{ fontSize: 11, color: "#475569" }}>小红书 · Data Collector</div>
          </div>
        </div>
        <StatusBadge scraping={scraping} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 0, minHeight: "calc(100vh - 65px)" }}>

        {/* Sidebar */}
        <div style={{ borderRight: "1px solid #2d3748", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Keywords</label>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, marginTop: 2 }}>One keyword per line</div>
            <textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder={"高市\n日本経済\n自民党"}
              disabled={scraping}
              style={{ width: "100%", height: 140, padding: "10px 12px", resize: "vertical" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Scroll Depth</label>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, marginTop: 2 }}>More scrolls = more results (slower)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range" min={1} max={20} value={maxScroll}
                onChange={e => setMaxScroll(Number(e.target.value))}
                disabled={scraping}
                style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#ff2442", minWidth: 24, textAlign: "right" }}>{maxScroll}x</span>
            </div>
          </div>

          <button className="btn btn-primary" onClick={startScrape} disabled={scraping} style={{ width: "100%", fontSize: 14 }}>
            {scraping ? "⏳ Scraping..." : "▶ Start Scraping"}
          </button>

          {/* Stats */}
          <div className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Keywords", value: keywords.split("\n").filter(k => k.trim()).length },
              { label: "Results", value: results.length },
              { label: "Logs", value: logs.length },
              { label: "Scrolls", value: maxScroll }
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#ff2442", fontFamily: "Syne, sans-serif" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>How to Use</div>
            {[
              "Enter keywords (one per line)",
              "Set scroll depth (higher = more data)",
              "Click Start Scraping",
              "Monitor live logs",
              "Download results as CSV"
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: "#94a3b8", alignItems: "flex-start" }}>
                <span style={{ color: "#ff2442", fontWeight: 700, minWidth: 16 }}>{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: "#334155", textAlign: "center" }}>
            ⚠️ Update cookies in app.py when expired
          </div>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column" }}>

          {/* Tabs */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #2d3748", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["logs", "results"].map(t => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t === "logs" ? `📋 Logs (${logs.length})` : `📊 Results (${results.length})`}
                </button>
              ))}
            </div>
            {tab === "results" && results.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="Search results..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: "6px 12px", width: 200 }}
                />
                <button className="btn btn-secondary" onClick={downloadCSV}>
                  ⬇ Download CSV
                </button>
              </div>
            )}
          </div>

          {/* Logs Tab */}
          {tab === "logs" && (
            <div ref={logRef} style={{ flex: 1, padding: 24, overflowY: "auto", maxHeight: "calc(100vh - 130px)" }}>
              {logs.length === 0 ? (
                <div style={{ textAlign: "center", color: "#334155", paddingTop: 80 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 14 }}>Logs will appear here once scraping starts</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {logs.map(log => (
                    <div key={log.id} style={{ display: "flex", gap: 12, fontSize: 12, animation: "fadeIn .2s ease", padding: "4px 0", borderBottom: "1px solid #1e2330" }}>
                      <span style={{ color: "#334155", minWidth: 60, flexShrink: 0 }}>{log.time}</span>
                      <span style={{ color: logColor(log.type) }}>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Results Tab */}
          {tab === "results" && (
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 130px)" }}>
              {filteredResults.length === 0 ? (
                <div style={{ textAlign: "center", color: "#334155", paddingTop: 80 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 14 }}>
                    {results.length === 0 ? "No results yet. Start scraping first." : "No results match your search."}
                  </div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#1a1f2e", position: "sticky", top: 0, zIndex: 1 }}>
                      {["#", "Keyword", "Title", "Author", "Likes", "Date", "Link"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2d3748", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1a1f2e" }}>
                        <td style={{ padding: "10px 16px", color: "#475569" }}>{i + 1}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ background: "#1e2330", padding: "2px 8px", borderRadius: 4, color: "#ff2442", fontSize: 11 }}>{r.keyword}</span>
                        </td>
                        <td style={{ padding: "10px 16px", maxWidth: 280 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e2e8f0" }}>{r.title}</div>
                        </td>
                        <td style={{ padding: "10px 16px", color: "#94a3b8", whiteSpace: "nowrap" }}>{r.author}</td>
                        <td style={{ padding: "10px 16px", color: "#94a3b8", textAlign: "right" }}>{r.likes}</td>
                        <td style={{ padding: "10px 16px", color: "#64748b", whiteSpace: "nowrap" }}>{r.date}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open ↗</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}