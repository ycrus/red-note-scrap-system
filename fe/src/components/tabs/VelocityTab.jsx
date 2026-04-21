import { useState, useEffect, useCallback } from "react";
import { createEventSource } from "../../api";

const API = "http://localhost:5001";

const SEV_COLOR = { CRITICAL: "#ef4444", ALERT: "#f97316", WATCH: "#f59e0b" };
const SEV_BG    = { CRITICAL: "#450a0a", ALERT: "#431407", WATCH: "#451a03" };
const SEV_ICON  = { CRITICAL: "🚨", ALERT: "⚠️", WATCH: "👁" };

const SeverityBadge = ({ severity }) => (
  <span style={{
    fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
    background: SEV_BG[severity] || "#1e2330",
    color: SEV_COLOR[severity] || "#64748b",
    letterSpacing: 0.5, whiteSpace: "nowrap",
  }}>
    {SEV_ICON[severity]} {severity}
  </span>
);

const RatioBar = ({ ratio, max = 10 }) => {
  const pct = Math.min((ratio / max) * 100, 100);
  const color = ratio >= 5 ? "#ef4444" : ratio >= 3 ? "#f97316" : "#f59e0b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "#1a1f2e", borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width .4s" }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 36 }}>{ratio}x</span>
    </div>
  );
};

export const VelocityTab = ({ lang = "en" }) => {
  const [stats, setStats]         = useState({ total: 0, by_severity: [], top_keywords: [] });
  const [events, setEvents]       = useState([]);
  const [sessions, setSessions]   = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [lookback, setLookback]   = useState(24);
  const [running, setRunning]     = useState(false);
  const [logs, setLogs]           = useState([]);
  const [section, setSection]     = useState("overview");

  const loadAll = useCallback((sid) => {
    const s = sid !== undefined ? sid : sessionId;
    const q = s ? `/${s}` : "";
    fetch(`${API}/api/velocity/stats`).then(r => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/velocity/events${q}`).then(r => r.json()).then(setEvents).catch(() => {});
    fetch(`${API}/api/history`).then(r => r.json()).then(setSessions).catch(() => {});
  }, [sessionId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSession = (val) => { setSessionId(val); loadAll(val || undefined); };

  const handleRun = async () => {
    setRunning(true); setLogs([]);
    try {
      await fetch(`${API}/api/velocity/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId ? parseInt(sessionId) : null,
          lookback_hours: lookback,
        })
      });
      const es = createEventSource();
      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "log")   setLogs(prev => [...prev.slice(-20), item.message]);
        if (item.type === "done") { es.close(); setRunning(false); loadAll(); }
        if (item.type === "error"){ es.close(); setRunning(false); setLogs(prev => [...prev, `❌ ${item.message}`]); }
      };
      es.onerror = () => { es.close(); setRunning(false); };
    } catch { setRunning(false); }
  };

  const critical = events.filter(e => e.severity === "CRITICAL");
  const alert    = events.filter(e => e.severity === "ALERT");
  const watch    = events.filter(e => e.severity === "WATCH");

  return (
    <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)", padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>Velocity Spike Detector</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Detects abnormal surges in post volume · cognitive warfare early warning
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => loadAll()} style={{ fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total spikes",  value: stats.total,          color: "#e2e8f0" },
          { label: "🚨 Critical",   value: critical.length,      color: "#ef4444" },
          { label: "⚠️ Alert",      value: alert.length,         color: "#f97316" },
          { label: "👁 Watch",      value: watch.length,         color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={sessionId} onChange={e => handleSession(e.target.value)}
            style={{ flex: 2, minWidth: 180, padding: "8px 10px", fontSize: 12 }}>
            <option value="">All sessions</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>Session #{s.id} — {s.keywords?.join(", ")} ({s.total_results})</option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Lookback</span>
            <select value={lookback} onChange={e => setLookback(Number(e.target.value))}
              style={{ padding: "7px 10px", fontSize: 12 }}>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <button className="btn" onClick={handleRun} disabled={running}
            style={{ background: "#f97316", color: "#fff", fontSize: 12, padding: "8px 20px", minWidth: 140 }}>
            {running ? "⏳ Analyzing..." : "⚡ Run Spike Detection"}
          </button>
        </div>

        {/* Threshold legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: "WATCH", desc: "2x+ surge", color: "#f59e0b" },
            { label: "ALERT", desc: "3x+ surge", color: "#f97316" },
            { label: "CRITICAL", desc: "5x+ surge", color: "#ef4444" },
          ].map(t => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
              <span style={{ color: t.color, fontWeight: 700 }}>{t.label}</span>
              <span style={{ color: "#475569" }}>{t.desc} vs baseline</span>
            </div>
          ))}
          <span style={{ fontSize: 10, color: "#334155", marginLeft: "auto" }}>
            Window: 30min · Baseline: 3h avg
          </span>
        </div>

        {logs.length > 0 && (
          <div style={{ marginTop: 10, background: "#0f1117", borderRadius: 8, padding: 10, maxHeight: 100, overflowY: "auto" }}>
            {logs.map((l, i) => <div key={i} style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{l}</div>)}
          </div>
        )}
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["overview", "events"].map(s => (
          <button key={s} className={`tab ${section === s ? "active" : ""}`}
            onClick={() => setSection(s)} style={{ fontSize: 11, padding: "5px 14px" }}>
            {s === "overview" ? "📊 Overview" : `⚡ Spike Events (${events.length})`}
          </button>
        ))}
      </div>

      {/* Overview */}
      {section === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Severity breakdown */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>⚡ By severity</div>
            {stats.by_severity.length === 0
              ? <div style={{ fontSize: 11, color: "#475569" }}>No spikes detected yet</div>
              : stats.by_severity.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <SeverityBadge severity={s.severity} />
                  <div style={{ flex: 1, height: 12, background: "#1a1f2e", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      width: `${(s.count / Math.max(...stats.by_severity.map(x => x.count), 1)) * 100}%`,
                      height: "100%", background: SEV_COLOR[s.severity] || "#64748b",
                      borderRadius: 3
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 24, textAlign: "right" }}>{s.count}</span>
                </div>
              ))
            }
          </div>

          {/* Top keywords */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>🔑 Most spiking keywords</div>
            {stats.top_keywords.length === 0
              ? <div style={{ fontSize: 11, color: "#475569" }}>No data yet</div>
              : stats.top_keywords.map((k, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600 }}>{k.keyword}</span>
                      <SeverityBadge severity={k.max_severity} />
                    </div>
                    <span style={{ fontSize: 10, color: "#475569" }}>{k.spike_count} spikes</span>
                  </div>
                  <RatioBar ratio={k.max_ratio} />
                </div>
              ))
            }
          </div>

          {/* Recent critical spikes */}
          <div className="card" style={{ padding: 16, gridColumn: "span 2" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", marginBottom: 12 }}>🚨 Recent CRITICAL spikes</div>
            {critical.length === 0
              ? <div style={{ fontSize: 11, color: "#475569" }}>No critical spikes detected.</div>
              : critical.slice(0, 5).map((e, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 0", borderBottom: i < Math.min(critical.length, 5) - 1 ? "1px solid #1e2330" : "none"
                }}>
                  <span style={{ fontSize: 20 }}>🚨</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{e.keyword}</div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                      {e.current_count} posts in 30min · baseline: {e.baseline_avg}/window
                      · {e.window_start ? new Date(e.window_start).toLocaleString() : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444", fontFamily: "Syne, sans-serif" }}>
                      {e.spike_ratio}x
                    </div>
                    <div style={{ fontSize: 9, color: "#64748b" }}>surge</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* All events */}
      {section === "events" && (
        <div>
          {events.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
              <div style={{ fontSize: 12 }}>No spike events yet — run detection first.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["CRITICAL", "ALERT", "WATCH"].map(sev => {
                const filtered = events.filter(e => e.severity === sev);
                if (!filtered.length) return null;
                return (
                  <div key={sev}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: SEV_COLOR[sev], textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                      {SEV_ICON[sev]} {sev} — {filtered.length} event{filtered.length > 1 ? "s" : ""}
                    </div>
                    {filtered.map((e, i) => (
                      <div key={i} className="card" style={{
                        padding: 14, marginBottom: 8,
                        borderLeft: `3px solid ${SEV_COLOR[sev]}`,
                        borderRadius: "0 8px 8px 0",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>{SEV_ICON[sev]}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{e.keyword}</span>
                            <SeverityBadge severity={sev} />
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: SEV_COLOR[sev], fontFamily: "Syne, sans-serif" }}>
                            {e.spike_ratio}x
                          </div>
                        </div>
                        <RatioBar ratio={e.spike_ratio} />
                        <div style={{ display: "flex", gap: 16, fontSize: 10, color: "#475569", marginTop: 8 }}>
                          <span>📮 {e.current_count} posts in window</span>
                          <span>📉 baseline: {e.baseline_avg}/window</span>
                          <span>📋 {e.affected_posts} post IDs tracked</span>
                          {e.window_start && (
                            <span>🕐 {new Date(e.window_start).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};