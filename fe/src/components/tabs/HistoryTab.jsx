import { useState } from "react";
import { ResultsTable } from "../ResultsTable";
import { getSessionResults } from "../../api";

export const HistoryTab = ({ history, onOpenDetail }) => {
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);

  const handleSelectSession = async (id) => {
    setSelectedSession(id);
    setSessionResults([]);
    try {
      const data = await getSessionResults(id);
      setSessionResults(data);
    } catch {}
  };

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: selectedSession ? "280px 1fr" : "1fr", maxHeight: "calc(100vh - 100px)", overflow: "hidden" }}>

      {/* Session list */}
      <div style={{ borderRight: selectedSession ? "1px solid #2d3748" : "none", overflowY: "auto" }}>
        {history.length === 0 ? (
          <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🕘</div>
            <div style={{ fontSize: 13 }}>No scraping sessions yet</div>
          </div>
        ) : history.map(s => (
          <div key={s.id} onClick={() => handleSelectSession(s.id)}
            style={{
              padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid #1a1f2e",
              background: selectedSession === s.id ? "#1e2330" : "transparent",
              borderLeft: selectedSession === s.id ? "3px solid #ff2442" : "3px solid transparent",
              transition: "all .15s"
            }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>Batch #{s.id}</span>
              <span style={{ fontSize: 10, color: s.finished_at ? "#16a34a" : "#f59e0b" }}>
                {s.finished_at ? "✅ Done" : "⏳ Running"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              {(s.keywords || []).map(k => (
                <span key={k} style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 4, padding: "1px 6px", fontSize: 10, color: "#ff2442" }}>{k}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#e2e8f0" }}>
              <span>📄 {s.total_results} results</span>
              <span>🔄 {s.max_scroll}x scroll</span>
            </div>
            <div style={{ fontSize: 10, color: "#e2e8f0", marginTop: 4 }}>
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
              <button className="btn btn-ghost"
                onClick={() => window.open(`http://localhost:5001/api/download/json/${selectedSession}`, "_blank")}
                style={{ fontSize: 10, color: "#16a34a", borderColor: "#16a34a", padding: "4px 10px" }}>
                ⬇ JSON
              </button>
            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => { setSelectedSession(null); setSessionResults([]); }}>✕ Close</button>
          </div>
          {sessionResults.length === 0 ? (
            <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 40, fontSize: 13 }}>Loading...</div>
          ) : (
            <ResultsTable results={sessionResults} onOpenDetail={onOpenDetail} compact />
          )}
        </div>
      )}
    </div>
  );
};