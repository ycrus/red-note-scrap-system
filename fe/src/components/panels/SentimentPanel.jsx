import { t } from "../../i18n";
import { useState } from "react";
import { analyzeSentiment } from "../../api";

export const SentimentPanel = ({ lang = "en", hfConfigured, sentimentStatus, onAnalysisStarted }) => {
  const [limit, setLimit] = useState(50);

  const handleAnalyze = async () => {
    try {
      const data = await analyzeSentiment(limit);
      if (data.status === "started") {
        onAnalysisStarted();
      } else {
        alert(data.error || "Failed to start analysis");
      }
    } catch (err) {
      alert("Connection error: " + err.message);
    }
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🔬 Sentiment Analysis</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          { label: t("analyzed", lang), value: sentimentStatus.analyzed, color: "#16a34a" },
          { label: t("pending", lang),  value: sentimentStatus.pending,  color: "#f59e0b" },
          { label: "Total",    value: sentimentStatus.total,    color: "#94a3b8" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center", background: "#0f1117", borderRadius: 8, padding: "8px 4px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#e2e8f0" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#e2e8f0" }}>Limit:</span>
        <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))}
          min={1} max={500} style={{ width: 70, padding: "4px 8px" }} />
        <span style={{ fontSize: 10, color: "#e2e8f0" }}>results</span>
      </div>

      <button className="btn btn-purple" style={{ width: "100%" }}
        disabled={!hfConfigured || sentimentStatus.is_analyzing || sentimentStatus.pending === 0}
        onClick={handleAnalyze}>
        {sentimentStatus.is_analyzing ? "⏳ Analyzing..." : "🔬 Analyze Now"}
      </button>

      {!hfConfigured && (
        <div style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>⚠️ Add HUGGINGFACE_API_KEY to .env</div>
      )}
      {sentimentStatus.is_analyzing && (
        <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 6, textAlign: "center", animation: "pulse 1.5s infinite" }}>
          Processing with HuggingFace API...
        </div>
      )}
    </div>
  );
};