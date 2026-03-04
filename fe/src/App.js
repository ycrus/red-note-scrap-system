import { useState, useEffect, useRef } from "react";

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

export default function App() {
  const [keywords, setKeywords] = useState("");
  const [maxScroll, setMaxScroll] = useState(5);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [scraping, setScraping] = useState(false);
  const [tab, setTab] = useState("logs");
  const [search, setSearch] = useState("");

  // Cookie state
  const [cookieRaw, setCookieRaw] = useState("");
  const [cookieKeys, setCookieKeys] = useState([]);
  const [cookieStatus, setCookieStatus] = useState("empty"); // empty | ok | error
  const [showCookiePanel, setShowCookiePanel] = useState(false);

  const logRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Load cookie status on mount
  useEffect(() => {
    fetch(`${API}/api/cookies`)
      .then(r => r.json())
      .then(d => {
        if (d.count > 0) { setCookieKeys(d.keys); setCookieStatus("ok"); }
      }).catch(() => {});
  }, []);

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
      } else {
        setCookieStatus("error");
      }
    } catch {
      setCookieStatus("error");
    }
  };

  const startScrape = async () => {
    if (cookieStatus !== "ok") {
      setShowCookiePanel(true);
      return alert("Please set cookies first!");
    }
    const kws = keywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) return alert("Please enter at least one keyword.");

    setLogs([]);
    setResults([]);
    setScraping(true);
    setTab("logs");

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
          setLogs(prev => [...prev, { type: "done", message: `✅ Done! ${item.total} results collected.`, time: new Date().toLocaleTimeString(), id: Date.now() }]);
          setScraping(false);
          setTab("results");
          es.close();
        }
      };
      es.onerror = () => { setScraping(false); es.close(); };
    } catch (err) {
      setScraping(false);
      setLogs(prev => [...prev, { type: "error", message: `Connection error: ${err.message}`, time: "--", id: Date.now() }]);
    }
  };

  const filteredResults = results.filter(r =>
    !search || r.title?.toLowerCase().includes(search.toLowerCase()) ||
    r.author?.toLowerCase().includes(search.toLowerCase()) ||
    r.keyword?.toLowerCase().includes(search.toLowerCase())
  );

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
        input, textarea { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; color: #e2e8f0; font-family: inherit; font-size: 12px; outline: none; transition: border .15s; }
        input:focus, textarea:focus { border-color: #ff2442; }
        .tab { padding: 7px 16px; cursor: pointer; border-radius: 7px; font-size: 12px; font-weight: 600; transition: all .15s; border: none; background: transparent; color: #64748b; font-family: inherit; }
        .tab.active { background: #1e2330; color: #e2e8f0; border: 1px solid #2d3748; }
        tr:hover td { background: #1a2030 !important; }
        a { color: #ff2442; text-decoration: none; } a:hover { text-decoration: underline; }
        .cookie-key { background: #1e2330; border: 1px solid #2d3748; border-radius: 4px; padding: 2px 8px; font-size: 10px; color: #64748b; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2d3748", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "#ff2442", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📕</div>
          <div>
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 17, fontWeight: 800 }}>RedNote Scraper</div>
            <div style={{ fontSize: 10, color: "#475569" }}>小红书 · Data Collector</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge ok={cookieStatus === "ok"} label={cookieStatus === "ok" ? `Cookies OK (${cookieKeys.length})` : "No Cookies"} />
          <Badge ok={!scraping} label={scraping ? "Scraping..." : "Idle"} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: "calc(100vh - 57px)" }}>

        {/* Sidebar */}
        <div style={{ borderRight: "1px solid #2d3748", padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>

          {/* Cookie Section */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>🍪 Cookies</div>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setShowCookiePanel(p => !p)}>
                {showCookiePanel ? "Close" : cookieStatus === "ok" ? "Update" : "Set Cookies"}
              </button>
            </div>

            {showCookiePanel && (
              <div style={{ animation: "slideDown .2s ease" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  Paste raw cookie string from Chrome DevTools → Application → Cookies
                </div>
                <textarea
                  value={cookieRaw}
                  onChange={e => setCookieRaw(e.target.value)}
                  placeholder="a1=xxx; web_session=yyy; webId=zzz; ..."
                  style={{ width: "100%", height: 90, padding: "8px 10px", resize: "vertical", fontSize: 11, marginBottom: 8 }}
                />
                <button className="btn btn-green" style={{ width: "100%" }} onClick={saveCookies}>
                  ✓ Save Cookies
                </button>
              </div>
            )}

            {!showCookiePanel && cookieStatus === "ok" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {cookieKeys.map(k => <span key={k} className="cookie-key">{k}</span>)}
              </div>
            )}

            {!showCookiePanel && cookieStatus !== "ok" && (
              <div style={{ fontSize: 11, color: "#475569" }}>
                No cookies loaded. Click <strong style={{ color: "#ff2442" }}>Set Cookies</strong> to add.
              </div>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Keywords</label>
            <div style={{ fontSize: 11, color: "#475569", margin: "4px 0 6px" }}>One keyword per line</div>
            <textarea
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder={"高市\n日本経済\n自民党"}
              disabled={scraping}
              style={{ width: "100%", height: 120, padding: "8px 10px", resize: "vertical" }}
            />
          </div>

          {/* Scroll depth */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Scroll Depth</label>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#ff2442" }}>{maxScroll}x</span>
            </div>
            <input type="range" min={1} max={20} value={maxScroll}
              onChange={e => setMaxScroll(Number(e.target.value))}
              disabled={scraping}
              style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155", marginTop: 2 }}>
              <span>1 (fast)</span><span>20 (thorough)</span>
            </div>
          </div>

          <button className="btn btn-red" onClick={startScrape} disabled={scraping} style={{ width: "100%" }}>
            {scraping ? "⏳ Scraping..." : "▶ Start Scraping"}
          </button>

          {/* Stats */}
          <div className="card" style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Keywords", value: keywords.split("\n").filter(k => k.trim()).length },
              { label: "Results", value: results.length },
              { label: "Cookies", value: cookieKeys.length },
              { label: "Scrolls", value: maxScroll }
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#ff2442", fontFamily: "Syne, sans-serif" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* How to get cookies */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>How to Get Cookies</div>
            {[
              "Open Chrome → xiaohongshu.com",
              "Log in to your account",
              "Press F12 → Application tab",
              "Click Cookies → xiaohongshu.com",
              'Right-click → "Copy all as cURL" OR manually copy cookie string',
              "Paste in the Cookies panel above"
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 7, marginBottom: 5, fontSize: 11, color: "#94a3b8" }}>
                <span style={{ color: "#ff2442", fontWeight: 700, minWidth: 14 }}>{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #2d3748", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 5 }}>
              {["logs", "results"].map(t => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t === "logs" ? `📋 Logs (${logs.length})` : `📊 Results (${results.length})`}
                </button>
              ))}
            </div>
            {tab === "results" && results.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: "6px 10px", width: 180 }} />
                <button className="btn btn-ghost" onClick={() => window.open(`${API}/api/download/csv`, "_blank")}>⬇ CSV</button>
              </div>
            )}
          </div>

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

          {tab === "results" && (
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
              {filteredResults.length === 0 ? (
                <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
                  <div style={{ fontSize: 13 }}>{results.length === 0 ? "No results yet." : "No results match search."}</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#1a1f2e", position: "sticky", top: 0 }}>
                      {["#", "Keyword", "Title", "Author", "Likes", "Date", "Link"].map(h => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2d3748", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #181c27" }}>
                        <td style={{ padding: "9px 14px", color: "#334155" }}>{i + 1}</td>
                        <td style={{ padding: "9px 14px" }}><span style={{ background: "#1e2330", padding: "2px 7px", borderRadius: 4, color: "#ff2442", fontSize: 10 }}>{r.keyword}</span></td>
                        <td style={{ padding: "9px 14px", maxWidth: 260 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div></td>
                        <td style={{ padding: "9px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{r.author}</td>
                        <td style={{ padding: "9px 14px", color: "#64748b", textAlign: "right" }}>{r.likes}</td>
                        <td style={{ padding: "9px 14px", color: "#475569", whiteSpace: "nowrap" }}>{r.date}</td>
                        <td style={{ padding: "9px 14px" }}><a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open ↗</a></td>
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