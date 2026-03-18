import { useState, useEffect } from "react";
import { t } from "../../i18n";
import { SentimentBadge } from "../ui/SentimentBadge";

const API = "http://localhost:5001";

const SIMILARITY_COLOR = (score) => {
  if (score >= 0.85) return "#16a34a";
  if (score >= 0.70) return "#f59e0b";
  return "#64748b";
};

const SimilarityBar = ({ score }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div style={{ flex: 1, height: 3, background: "#1e2330", borderRadius: 2 }}>
      <div style={{
        height: "100%",
        width: `${Math.round(score * 100)}%`,
        background: SIMILARITY_COLOR(score),
        borderRadius: 2,
        transition: "width .5s"
      }} />
    </div>
    <span style={{ fontSize: 10, fontWeight: 700, color: SIMILARITY_COLOR(score), minWidth: 36 }}>
      {Math.round(score * 100)}%
    </span>
  </div>
);

export const SemanticSearchTab = ({ lang = "en" }) => {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [status, setStatus]       = useState({ total: 0, embedded: 0, pending: 0 });
  const [embedding, setEmbedding] = useState(false);
  const [embedLimit, setEmbedLimit] = useState(100);
  const [embedLog, setEmbedLog]   = useState([]);

  const loadStatus = () => {
    fetch(`${API}/api/embed/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch(`${API}/api/embed/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), limit: 20 })
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setResults(data.results || []); }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleEmbed = async () => {
    setEmbedding(true);
    setEmbedLog([]);
    try {
      await fetch(`${API}/api/embed/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: embedLimit })
      });
      // Subscribe to SSE stream
      const es = new EventSource(`${API}/api/stream`);
      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "log")  setEmbedLog(prev => [...prev, item.message]);
        if (item.type === "done") {
          es.close();
          setEmbedding(false);
          loadStatus();
        }
        if (item.type === "error") {
          es.close();
          setEmbedding(false);
          setError(item.message);
        }
      };
      es.onerror = () => { es.close(); setEmbedding(false); };
    } catch (e) {
      setEmbedding(false);
      setError(e.message);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)", padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>
            Semantic Search
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Search By meaning, not keyword
          </div>
        </div>
        <button className="btn btn-ghost" onClick={loadStatus} style={{ fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* Embedding status + generate */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>
            Vector Index
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>Limit:</span>
            <input type="number" value={embedLimit} onChange={e => setEmbedLimit(Number(e.target.value))}
              min={10} max={500} style={{ width: 60, padding: "4px 8px", fontSize: 11 }} />
            <button className="btn btn-purple" onClick={handleEmbed} disabled={embedding}
              style={{ fontSize: 11 }}>
              {embedding ? "⏳ Embedding..." : "⚡ Generate Embeddings"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: embedLog.length > 0 ? 12 : 0 }}>
          {[
            { label: "Total Posts", value: status.total, color: "#e2e8f0" },
            { label: "Embedded", value: status.embedded, color: "#16a34a" },
            { label: "Pending", value: status.pending, color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "#0f1117", borderRadius: 8, padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "Syne, sans-serif" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Embed log */}
        {embedLog.length > 0 && (
          <div style={{ background: "#0f1117", borderRadius: 8, padding: 10, maxHeight: 100, overflowY: "auto" }}>
            {embedLog.slice(-8).map((log, i) => (
              <div key={i} style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{log}</div>
            ))}
          </div>
        )}
      </div>

      {/* Search box */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          SEARCH
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder=''
            style={{ flex: 1, padding: "10px 14px", fontSize: 12, borderRadius: 8 }}
            disabled={loading || status.embedded === 0}
          />
          <button className="btn btn-red" onClick={handleSearch}
            disabled={loading || !query.trim() || status.embedded === 0}
            style={{ fontSize: 12, minWidth: 80 }}>
            {loading ? "⏳" : "🔍 Cari"}
          </button>
        </div>
        {status.embedded === 0 && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8 }}>
            ⚠️ Belum ada embedding. Klik "Generate Embeddings" dulu.
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#fca5a5" }}>
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>
            {results.length} hasil untuk "{query}"
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r, i) => (
              <div key={r.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: "#475569", minWidth: 16 }}>#{i+1}</span>
                      <a href={r.link} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, lineHeight: 1.4, textDecoration: "none" }}>
                        {r.title}
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#64748b", paddingLeft: 24 }}>
                      {r.author && <span>👤 {r.author}</span>}
                      {r.likes  && <span>❤️ {r.likes}</span>}
                      {r.date   && <span>📅 {r.date}</span>}
                      {r.keyword && <span style={{ color: "#7c3aed" }}>🔑 {r.keyword}</span>}
                      {r.sentiment && <SentimentBadge sentiment={r.sentiment} score={null} />}
                    </div>
                  </div>
                  <div style={{ minWidth: 100 }}>
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, textAlign: "right" }}>similarity</div>
                    <SimilarityBar score={r.similarity} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && query && !error && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 12 }}>Tidak ada hasil. Coba query yang berbeda.</div>
        </div>
      )}
    </div>
  );
};