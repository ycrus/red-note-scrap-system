import { useState } from "react";

const Badge = ({ ok, label, style = {} }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 12px", borderRadius: 20,
    background: ok ? "#0f2a1a" : "#1a0f0f",
    border: `1px solid ${ok ? "#16a34a" : "#7f1d1d"}`,
    fontSize: 11, fontWeight: 600,
    color: ok ? "#16a34a" : "#ef4444",
    fontFamily: "IBM Plex Mono, monospace",
    ...style
  }}>
    <div style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#16a34a" : "#ef4444" }} />
    {label}
  </div>
);

const API = "http://localhost:5001";

export const Header = ({ hfConfigured, cookieStatus, cookieKeys, scraping, scraperProvider = "playwright", onProviderChange }) => {
  const [switching, setSwitching] = useState(false);

  const handleProviderToggle = async () => {
    if (switching || scraping) return;
    const next = scraperProvider === "playwright" ? "apify" : "playwright";
    setSwitching(true);
    try {
      const res = await fetch(`${API}/api/provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: next })
      });
      const data = await res.json();
      if (data.status === "ok" && onProviderChange) {
        onProviderChange(data.provider);
      }
    } catch (e) {
      console.error(e);
    }
    setSwitching(false);
  };

  const isApify = scraperProvider === "apify";

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 24px", borderBottom: "1px solid #2d3748",
      background: "#0f1117", position: "sticky", top: 0, zIndex: 100
    }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Syne, sans-serif", color: "#e2e8f0", letterSpacing: -0.5 }}>
          RedNote Scraper
        </div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
          小红书 · Data Collector + Sentiment Analysis
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge ok={hfConfigured} label={hfConfigured ? "HF Connected" : "No HF Key"} />

        {/* Provider toggle badge — clickable */}
        <div
          onClick={handleProviderToggle}
          title={`Click to switch to ${isApify ? "Playwright" : "Apify"}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 20,
            background: isApify ? "#1a1000" : "#0f1a2a",
            border: `1px solid ${isApify ? "#f59e0b" : "#0ea5e9"}`,
            fontSize: 11, fontWeight: 600,
            color: isApify ? "#f59e0b" : "#0ea5e9",
            fontFamily: "IBM Plex Mono, monospace",
            cursor: scraping ? "not-allowed" : "pointer",
            opacity: switching ? 0.6 : 1,
            transition: "all .2s",
            userSelect: "none",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: isApify ? "#f59e0b" : "#0ea5e9" }} />
          {switching ? "Switching..." : isApify ? "⚡ Apify" : "🎭 Playwright"}
          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>
            {scraping ? "" : "↕"}
          </span>
        </div>

        {/* Cookie status — hanya tampil saat Playwright */}
        {!isApify && (
          <Badge
            ok={cookieStatus === "ok"}
            label={cookieStatus === "ok" ? `Cookies OK (${cookieKeys.length})` : "No Cookies"}
          />
        )}

        <Badge ok={!scraping} label={scraping ? "Scraping..." : "Idle"} />
      </div>
    </div>
  );
};