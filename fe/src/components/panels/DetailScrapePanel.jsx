import { useState } from "react";
import { t } from "../../i18n";
import { startDetailScrape as apiStartDetail } from "../../api";

export const DetailScrapePanel = ({ detailStatus, scraping, cookieStatus, onStarted, lang = "en" }) => {
  const [limit, setLimit] = useState(20);

  const handleStart = async () => {
    if (cookieStatus !== "ok") return alert(t("alertNoCookies", lang));
    try {
      const data = await apiStartDetail(limit);
      if (data.status === "started") {
        onStarted(data.count);
      } else {
        alert(data.error || t("error", lang));
      }
    } catch (err) {
      alert("Connection error: " + err.message);
    }
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{t("scrapePostDetail", lang)}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[
          { labelKey: "scraped", value: detailStatus.scraped, color: "#16a34a" },
          { labelKey: "pending", value: detailStatus.pending, color: "#f59e0b" },
        ].map(s => (
          <div key={s.labelKey} style={{ textAlign: "center", background: "#0f1117", borderRadius: 8, padding: "8px 4px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#e2e8f0" }}>{t(s.labelKey, lang)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#e2e8f0" }}>{t("limit", lang)}</span>
        <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))}
          min={1} max={100} style={{ width: 60, padding: "4px 8px" }} />
        <span style={{ fontSize: 10, color: "#e2e8f0" }}>{t("posts", lang)}</span>
      </div>

      <button className="btn" onClick={handleStart}
        disabled={scraping || detailStatus.pending === 0}
        style={{ width: "100%", background: "#0ea5e9", color: "#fff", padding: "8px 16px", fontSize: 12 }}>
        {scraping ? t("running", lang) : t("fetchDetails", lang)}
      </button>
      <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>
        {t("fetchDetailHint", lang)}
      </div>
    </div>
  );
};