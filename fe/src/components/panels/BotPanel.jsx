import { t } from "../../i18n";
import { useState } from "react";

const BOT_COLORS = {
  high:   { bg: "#fff1f0", color: "#e53e3e", border: "#fca5a5", icon: "🤖", label: "Bot" },
  medium: { bg: "#fffbeb", color: "#d97706", border: "#fcd34d", icon: "⚠️", label: "Suspicious" },
  low:    { bg: "#f0f9ff", color: "#0ea5e9", border: "#7dd3fc", icon: "🔍", label: "Slightly Sus" },
  clean:  { bg: "#f0fdf4", color: "#16a34a", border: "#86efac", icon: "✅", label: "Clean" },
};

export const BotBadge = ({ label, score }) => {
  if (!label) return <span style={{ color: "#334155", fontSize: 11 }}>—</span>;
  const c = BOT_COLORS[label] || BOT_COLORS.clean;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`
    }}>
      {c.icon} {c.label}
      {score != null && <span style={{ opacity: 0.7 }}>({score})</span>}
    </span>
  );
};

export const BotPanel = ({ lang = "en", botStatus, scraping, cookieStatus, onStarted }) => {
  const [limit, setLimit] = useState(10);

  const handleStart = async () => {
    if (cookieStatus !== "ok") return alert("Please set cookies first!");
    try {
      const res = await fetch("http://localhost:5001/api/bot/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit })
      });
      const data = await res.json();
      if (data.status === "started") {
        onStarted(data.authors);
      } else {
        alert(data.error || "Failed to start");
      }
    } catch (err) {
      alert("Connection error: " + err.message);
    }
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🤖 Bot Detection</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          { label: t("checked", lang),  value: botStatus.checked, color: "#16a34a" },
          { label: t("pending", lang),  value: botStatus.pending, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center", background: "#0f1117", borderRadius: 8, padding: "8px 4px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value ?? "—"}</div>
            <div style={{ fontSize: 10, color: "#e2e8f0" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#e2e8f0" }}>Limit:</span>
        <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))}
          min={1} max={50} style={{ width: 60, padding: "4px 8px" }} />
        <span style={{ fontSize: 10, color: "#e2e8f0" }}>authors</span>
      </div>

      <button className="btn" onClick={handleStart}
        disabled={scraping || botStatus.pending === 0}
        style={{ width: "100%", background: "#7c3aed", color: "#fff", padding: "8px 16px", fontSize: 12 }}>
        {scraping ? "⏳ Running..." : "🤖 Detect Bots"}
      </button>
      <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>
        Visits author profiles to score bot likelihood
      </div>
    </div>
  );
};