import { useState, useEffect } from "react";
import { t } from "../../i18n";
import { createEventSource } from "../../api";

const API = "http://localhost:5001";

export const ImagePanel = ({ scraping, onStarted, lang = "en" }) => {
  const [status, setStatus]   = useState({ posts_with_images: 0, posts_downloaded: 0, posts_pending: 0, total_images: 0 });
  const [limit, setLimit]     = useState(20);
  const [loading, setLoading] = useState(false);

  const loadStatus = () => {
    fetch(`${API}/api/images/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => { loadStatus(); }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/images/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit })
      });
      const data = await res.json();
      if (data.error) { alert(data.error); setLoading(false); return; }
      onStarted?.();
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        🖼 Image Cache
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[
          { label: "Cached", value: status.posts_downloaded, color: "#16a34a" },
          { label: "Pending", value: status.posts_pending, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center", background: "#0f1117", borderRadius: 8, padding: "6px 4px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
        {status.total_images} images stored · resize 400px · JPEG 75%
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#e2e8f0" }}>Limit:</span>
        <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))}
          min={1} max={200} style={{ width: 60, padding: "4px 8px" }} />
        <span style={{ fontSize: 10, color: "#64748b" }}>posts</span>
      </div>

      <button className="btn" onClick={handleStart}
        disabled={scraping || loading || status.posts_pending === 0}
        style={{ width: "100%", background: "#0ea5e9", color: "#fff", padding: "8px 16px", fontSize: 11 }}>
        {scraping || loading ? "⏳ Downloading..." : "⬇ Download Images"}
      </button>
    </div>
  );
};