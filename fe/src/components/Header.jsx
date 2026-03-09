import { Badge } from "./ui/Badges";

export const Header = ({ hfConfigured, cookieStatus, cookieKeys, scraping }) => (
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
);