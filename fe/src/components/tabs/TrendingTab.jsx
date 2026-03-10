import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const API = "http://localhost:5001";

const fetchTrending   = () => fetch(`${API}/api/trending`).then(r => r.json());
const fetchHashtags   = () => fetch(`${API}/api/trending/hashtags`).then(r => r.json());
const fetchTopics     = () => fetch(`${API}/api/trending/topics`).then(r => r.json());
const startScrape     = () => fetch(`${API}/api/trending/scrape`, { method: "POST" }).then(r => r.json());

const GRADIENT = ["#ff2442", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
const getColor = (i) => GRADIENT[i % GRADIENT.length];

const EmptyState = ({ msg }) => (
  <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
    <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
    <div style={{ fontSize: 12 }}>{msg}</div>
  </div>
);

const SectionHeader = ({ title, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
    {count > 0 && (
      <span style={{ background: "#1e2330", border: "1px solid #2d3748", borderRadius: 10, padding: "1px 8px", fontSize: 10, color: "#64748b" }}>
        {count}
      </span>
    )}
  </div>
);

// ── Hashtag pill cloud ──────────────────────────────
const HashtagCloud = ({ items }) => {
  const max = items[0]?.count || 1;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((item, i) => {
        const weight = item.count / max;
        const size = 10 + Math.round(weight * 8);
        const opacity = 0.5 + weight * 0.5;
        return (
          <span key={i} style={{
            background: "#1e2330",
            border: `1px solid ${getColor(i)}44`,
            color: getColor(i),
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: size,
            fontWeight: 600,
            opacity,
            cursor: "default",
            transition: "all .2s",
          }}
            title={`${item.count} posts`}
          >
            {item.hashtag}
            <span style={{ fontSize: 9, color: "#64748b", marginLeft: 5 }}>{item.count}</span>
          </span>
        );
      })}
    </div>
  );
};

// ── Trending rank list ──────────────────────────────
const TrendingList = ({ items, label = "count" }) => {
  const max = items[0]?.[label === "count" ? "count" : "count"] || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.slice(0, 15).map((item, i) => {
        const name = item.hashtag || item.topic;
        const count = item.count;
        const pct = Math.round((count / max) * 100);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, minWidth: 20, textAlign: "right",
              color: i < 3 ? getColor(i) : "#475569"
            }}>
              {i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: "#e2e8f0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{count}</span>
              </div>
              <div style={{ height: 3, background: "#1e2330", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: getColor(i), borderRadius: 2, transition: "width .5s" }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Main TrendingTab ────────────────────────────────
export const TrendingTab = ({ scraping, onScrapeStarted }) => {
  const [liveData, setLiveData]       = useState({ trending: [], last_scraped: null });
  const [dbHashtags, setDbHashtags]   = useState([]);
  const [dbTopics, setDbTopics]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [activeView, setActiveView]   = useState("hashtags"); // hashtags | topics | live | chart

  const loadAll = async () => {
    setLoading(true);
    try {
      const [t, h, tp] = await Promise.all([fetchTrending(), fetchHashtags(), fetchTopics()]);
      setLiveData(t);
      setDbHashtags(h.hashtags || []);
      setDbTopics(tp.topics || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Reload setelah scraping selesai
  useEffect(() => {
    if (!scraping) loadAll();
  }, [scraping]);

  const handleStartScrape = async () => {
    try {
      await startScrape();
      onScrapeStarted?.();
    } catch (e) {
      alert("Failed to start trending scrape: " + e.message);
    }
  };

  const hasDbData   = dbHashtags.length > 0 || dbTopics.length > 0;
  const hasLiveData = liveData.trending.length > 0;

  // Chart data — gabungkan DB hashtags
  const chartData = dbHashtags.slice(0, 15).map(h => ({
    name: h.hashtag.replace("#", ""),
    count: h.count,
  }));

  return (
    <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)", padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>🔥 Trending Topics</div>
          {liveData.last_scraped && (
            <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
              Last live scrape: {new Date(liveData.last_scraped).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={loadAll} style={{ fontSize: 11 }}>↻ Refresh</button>
          <button
            className="btn btn-red"
            onClick={handleStartScrape}
            disabled={scraping}
            style={{ fontSize: 11 }}
          >
            {scraping ? "Scraping..." : "🔍 Scrape Live Trends"}
          </button>
        </div>
      </div>

      {/* Info banner kalau belum ada data */}
      {!hasDbData && !loading && (
        <div style={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 11, color: "#64748b" }}>
          💡 Scrape beberapa keyword dulu agar hashtag & topik bisa dianalisis dari data lokal.
          Atau klik <strong style={{ color: "#ff2442" }}>Scrape Live Trends</strong> untuk ambil langsung dari RedNote (butuh cookies valid).
        </div>
      )}

      {/* Sub-tab navigation */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid #1e2330", paddingBottom: 12 }}>
        {[
          { key: "hashtags", label: `# Hashtags (${dbHashtags.length})` },
          { key: "topics",   label: `💬 Topics (${dbTopics.length})` },
          { key: "chart",    label: "📊 Chart" },
          { key: "live",     label: `🌐 Live (${liveData.trending.length})` },
        ].map(({ key, label }) => (
          <button key={key}
            className={`tab ${activeView === key ? "active" : ""}`}
            onClick={() => setActiveView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", color: "#334155", padding: 40, fontSize: 12 }}>Loading...</div>
      )}

      {/* HASHTAGS VIEW */}
      {!loading && activeView === "hashtags" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <SectionHeader title="Top Hashtags — Ranking" count={dbHashtags.length} />
            {dbHashtags.length === 0
              ? <EmptyState msg="No hashtags found. Scrape some keywords first." />
              : <TrendingList items={dbHashtags} />
            }
          </div>
          <div className="card" style={{ padding: 16 }}>
            <SectionHeader title="Hashtag Cloud" count={dbHashtags.length} />
            {dbHashtags.length === 0
              ? <EmptyState msg="No hashtags yet." />
              : <HashtagCloud items={dbHashtags.slice(0, 30)} />
            }
          </div>
        </div>
      )}

      {/* TOPICS VIEW */}
      {!loading && activeView === "topics" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <SectionHeader title="Hot Topics — Kata Paling Sering Muncul" count={dbTopics.length} />
            {dbTopics.length === 0
              ? <EmptyState msg="No topic data. Scrape some keywords first." />
              : <TrendingList items={dbTopics.map(t => ({ ...t, hashtag: t.topic }))} />
            }
          </div>
          <div className="card" style={{ padding: 16 }}>
            <SectionHeader title="Topic Cloud" count={dbTopics.length} />
            {dbTopics.length === 0
              ? <EmptyState msg="No topics yet." />
              : <HashtagCloud items={dbTopics.slice(0, 30).map(t => ({ hashtag: t.topic, count: t.count }))} />
            }
          </div>
        </div>
      )}

      {/* CHART VIEW */}
      {!loading && activeView === "chart" && (
        <div className="card" style={{ padding: 16 }}>
          <SectionHeader title="Top 15 Hashtags — Bar Chart" count={chartData.length} />
          {chartData.length === 0
            ? <EmptyState msg="No data for chart." />
            : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" />
                  <XAxis dataKey="name" tick={{ fill: "#e2e8f0", fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: "#e2e8f0", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`${v} posts`, "Count"]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      )}

      {/* LIVE TRENDING VIEW */}
      {!loading && activeView === "live" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <SectionHeader title="Live Trending dari RedNote Explore" count={liveData.trending.length} />
            {liveData.trending.length === 0 ? (
              <EmptyState msg='Belum ada data live. Klik "Scrape Live Trends" (butuh cookies valid).' />
            ) : (
              <TrendingList items={liveData.trending.map(t => ({ hashtag: t.hashtag, count: t.count }))} />
            )}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <SectionHeader title="Sample Posts per Hashtag" />
            {liveData.trending.length === 0 ? (
              <EmptyState msg="No live data yet." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 400, overflowY: "auto" }}>
                {liveData.trending.filter(t => t.sample_titles?.length > 0).slice(0, 10).map((item, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: getColor(i), marginBottom: 4 }}>{item.hashtag}</div>
                    {item.sample_titles.map((title, j) => (
                      <div key={j} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 0 2px 10px", borderLeft: `2px solid ${getColor(i)}44` }}>
                        {title}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};