import { useState, useEffect } from "react";
import { createEventSource } from "../../api";

const API = "http://localhost:5001";

const SEVERITY_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#16a34a" };
const SEVERITY_BG = { HIGH: "#7f1d1d", MEDIUM: "#451a03", LOW: "#052e16" };
const TYPE_LABEL = {
  CONTENT_SIMILARITY: "Content similarity",
  TIMING_COORDINATION: "Timing coordination",
  HASHTAG_INJECTION: "Hashtag injection",
  BOT_AMPLIFICATION: "Bot amplification",
};
const TYPE_ICON = {
  CONTENT_SIMILARITY: "📋",
  TIMING_COORDINATION: "⏱",
  HASHTAG_INJECTION: "📌",
  BOT_AMPLIFICATION: "🤖",
};

export const CIBTab = ({ lang = "en" }) => {
  const [events, setEvents]       = useState([]);
  const [stats, setStats]         = useState({ total_events: 0, by_type: [] });
  const [running, setRunning]     = useState(false);
  const [logs, setLogs]           = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions]   = useState([]);

  useEffect(() => {
    loadData();
    fetch(`${API}/api/history`).then(r => r.json()).then(setSessions).catch(() => {});
  }, []);

  const loadData = () => {
    fetch(`${API}/api/cib/stats`).then(r => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/api/cib/events`).then(r => r.json()).then(setEvents).catch(() => {});
  };

  const handleRun = async () => {
    setRunning(true);
    setLogs([]);
    try {
      await fetch(`${API}/api/cib/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId ? parseInt(sessionId) : null })
      });
      const es = createEventSource();
      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "log")   setLogs(prev => [...prev, item.message]);
        if (item.type === "done") { es.close(); setRunning(false); loadData(); }
        if (item.type === "error"){ es.close(); setRunning(false); setLogs(prev => [...prev, `❌ ${item.message}`]); }
      };
      es.onerror = () => { es.close(); setRunning(false); };
    } catch(e) {
      setRunning(false);
    }
  };

  const highEvents = events.filter(e => e.severity === "HIGH");
  const medEvents  = events.filter(e => e.severity === "MEDIUM");

  return (
    <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)", padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>
            Coordinated Behavior Detection
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Detects signs of disinformation campaigns · cognitive warfare signals
          </div>
        </div>
        <button className="btn btn-ghost" onClick={loadData} style={{ fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total events",  value: stats.total_events, color: "#e2e8f0" },
          { label: "HIGH severity", value: highEvents.length,  color: "#ef4444" },
          { label: "MEDIUM",        value: medEvents.length,   color: "#f59e0b" },
          { label: "Types detected",value: stats.by_type?.length || 0, color: "#7c3aed" },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Run controls */}
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          Run Detection
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: logs.length > 0 ? 10 : 0 }}>
          <select value={sessionId} onChange={e => setSessionId(e.target.value)}
            style={{ flex: 1, padding: "8px 10px", fontSize: 12 }}>
            <option value="">All sessions</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                Session #{s.id} — {s.keywords?.join(", ")} ({s.total_results} posts)
              </option>
            ))}
          </select>
          <button className="btn" onClick={handleRun} disabled={running}
            style={{ background: "#7c3aed", color: "#fff", fontSize: 12, padding: "8px 18px", minWidth: 120 }}>
            {running ? "⏳ Analyzing..." : "🔍 Run CIB Analysis"}
          </button>
        </div>

        {/* Signals legend */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: logs.length > 0 ? 10 : 0 }}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <div key={k} style={{ fontSize: 10, color: "#64748b", display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 12 }}>{TYPE_ICON[k]}</span> {v}
            </div>
          ))}
        </div>

        {logs.length > 0 && (
          <div style={{ background: "#0f1117", borderRadius: 8, padding: 10, maxHeight: 120, overflowY: "auto" }}>
            {logs.slice(-10).map((log, i) => (
              <div key={i} style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{log}</div>
            ))}
          </div>
        )}
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🛡</div>
          <div style={{ fontSize: 12 }}>No coordinated behavior detected yet. Run analysis to start.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* HIGH first */}
          {["HIGH", "MEDIUM", "LOW"].map(sev => {
            const filtered = events.filter(e => e.severity === sev);
            if (!filtered.length) return null;
            return (
              <div key={sev}>
                <div style={{ fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[sev], textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  {sev} severity — {filtered.length} event{filtered.length > 1 ? "s" : ""}
                </div>
                {filtered.map((ev, i) => (
                  <div key={i} className="card" style={{
                    padding: 14, marginBottom: 8,
                    borderLeft: `3px solid ${SEVERITY_COLOR[sev]}`,
                    borderRadius: "0 8px 8px 0",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{TYPE_ICON[ev.event_type] || "⚠️"}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
                          {TYPE_LABEL[ev.event_type] || ev.event_type}
                        </span>
                        <span style={{
                          fontSize: 9, padding: "2px 8px", borderRadius: 10,
                          background: SEVERITY_BG[sev], color: SEVERITY_COLOR[sev],
                          fontWeight: 700, textTransform: "uppercase"
                        }}>{sev}</span>
                      </div>
                      <span style={{ fontSize: 10, color: "#475569" }}>
                        {ev.detected_at ? new Date(ev.detected_at).toLocaleString() : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, lineHeight: 1.5 }}>
                      {ev.description}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#475569" }}>
                      <span>📮 {ev.affected_posts_count} posts</span>
                      <span>👤 {ev.affected_authors?.length || 0} accounts</span>
                      {ev.evidence?.keyword && <span>🔑 #{ev.evidence.keyword}</span>}
                      {ev.evidence?.max_similarity && <span>🔗 {(ev.evidence.max_similarity * 100).toFixed(1)}% similar</span>}
                      {ev.evidence?.bot_ratio && <span>🤖 {(ev.evidence.bot_ratio * 100).toFixed(0)}% bots</span>}
                    </div>
                    {ev.affected_authors?.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {ev.affected_authors.slice(0, 8).map((a, j) => (
                          <span key={j} style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 10,
                            background: "#1e2330", color: "#94a3b8", border: "1px solid #2d3748"
                          }}>{a}</span>
                        ))}
                        {ev.affected_authors.length > 8 && (
                          <span style={{ fontSize: 10, color: "#475569" }}>+{ev.affected_authors.length - 8} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};