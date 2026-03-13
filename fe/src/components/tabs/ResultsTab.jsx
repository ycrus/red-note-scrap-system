import { t } from "../../i18n";
import { useState } from "react";
import { ResultsTable } from "../ResultsTable";
import { downloadCsv } from "../../api";

export const ResultsTab = ({ results, onOpenDetail, lang = "en" }) => {
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");

  const filtered = results.filter(r => {
    const matchSearch = !search ||
      r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.author?.toLowerCase().includes(search.toLowerCase()) ||
      r.keyword?.toLowerCase().includes(search.toLowerCase());
    const matchSentiment = sentimentFilter === "all" || r.sentiment === sentimentFilter;
    return matchSearch && matchSentiment;
  });

  return (
    <>
      {/* Toolbar */}
      {results.length > 0 && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #2d3748", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["all", "positive", "negative", "neutral"].map(f => (
              <button key={f} className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11, background: sentimentFilter === f ? "#2d3748" : "#1e2330", color: sentimentFilter === f ? "#e2e8f0" : "#e2e8f0" }}
                onClick={() => setSentimentFilter(f)}>
                {f === "all" ? t("all", lang) : f === "positive" ? "😊" : f === "negative" ? "😞" : "😐"}
              </button>
            ))}
          </div>
          <input placeholder={t("search", lang)} value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: "6px 10px", width: 160 }} />
          <button className="btn btn-ghost" onClick={downloadCsv}>⬇ CSV</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 13 }}>{results.length === 0 ? t("noResults", lang) : t("noResultsFilter", lang)}</div>
          </div>
        ) : (
          <ResultsTable results={filtered} onOpenDetail={onOpenDetail} />
        )}
      </div>
    </>
  );
};