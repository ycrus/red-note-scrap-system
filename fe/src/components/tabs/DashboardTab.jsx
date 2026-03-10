import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer, CartesianGrid } from "recharts";

const COLORS = { positive: "#16a34a", negative: "#ef4444", neutral: "#64748b" };
const PIE_COLORS = ["#16a34a", "#ef4444", "#64748b", "#f59e0b"];

const BOT_CONFIG = {
  high:   { label: "BOT",        bg: "#7f1d1d", color: "#fca5a5", border: "#ef4444" },
  medium: { label: "SUSPICIOUS", bg: "#451a03", color: "#fcd34d", border: "#f59e0b" },
  low:    { label: "LOW RISK",   bg: "#1e1b4b", color: "#a5b4fc", border: "#6366f1" },
  clean:  { label: "CLEAN",      bg: "#052e16", color: "#86efac", border: "#16a34a" },
};

const BotBadge = ({ label, score }) => {
  if (!label) return <span style={{ fontSize: 10, color: "#475569" }}>—</span>;
  const cfg = BOT_CONFIG[label] || BOT_CONFIG.clean;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700,
      letterSpacing: 0.5, whiteSpace: "nowrap"
    }}>
      {cfg.label}{score != null ? ` ${score}` : ""}
    </span>
  );
};

const StatCard = ({ label, value, color }) => (
  <div className="card" style={{ padding: 16, textAlign: "center" }}>
    <div style={{ fontSize: 28, fontWeight: 800, color: color || "#ff2442", fontFamily: "Syne, sans-serif" }}>{value}</div>
    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2 }}>{label}</div>
  </div>
);

const EmptyChart = () => (
  <div style={{ textAlign: "center", color: "#334155", padding: "30px 0", fontSize: 12 }}>No data yet</div>
);

export const DashboardTab = ({ keywords, sentiment, timeline, authors, onRefresh }) => {
  const totalResults = keywords.reduce((a, b) => a + b.total, 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 100px)", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Syne, sans-serif" }}>Analytics Dashboard</div>
        <button className="btn btn-ghost" onClick={onRefresh} style={{ fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Posts"       value={totalResults} />
        <StatCard label="Keywords Tracked"  value={keywords.length}  color="#7c3aed" />
        <StatCard label="Positive"          value={sentiment.overall?.find(s => s.sentiment === "positive")?.total || 0} color="#16a34a" />
        <StatCard label="Negative"          value={sentiment.overall?.find(s => s.sentiment === "negative")?.total || 0} color="#ef4444" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Keyword Volume */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>📊 Posts per Keyword</div>
          {keywords.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={keywords.slice(0, 10)} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" />
                <XAxis dataKey="keyword" tick={{ fill: "#e2e8f0", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#e2e8f0", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" fill="#ff2442" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sentiment Pie */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>🎭 Sentiment Distribution</div>
          {!sentiment.overall?.length ? <EmptyChart /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie data={sentiment.overall} dataKey="total" nameKey="sentiment" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                    {sentiment.overall.map((entry, i) => (
                      <Cell key={i} fill={COLORS[entry.sentiment] || PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sentiment.overall.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[s.sentiment] || PIE_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#e2e8f0", textTransform: "capitalize" }}>{s.sentiment}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginLeft: "auto" }}>{s.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Timeline */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>📅 Scraping Timeline</div>
          {timeline.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" />
                <XAxis dataKey="day" tick={{ fill: "#e2e8f0", fontSize: 9 }} />
                <YAxis tick={{ fill: "#e2e8f0", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="total" stroke="#ff2442" strokeWidth={2} dot={{ fill: "#ff2442", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Authors */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>👤 Top Authors</div>
          {authors.length === 0 ? <EmptyChart /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {authors.slice(0, 8).map((a, i) => {
                const pct = Math.round((a.total / authors[0].total) * 100);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#64748b", minWidth: 16, textAlign: "right" }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "#e2e8f0", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.author}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <BotBadge label={a.bot_label} score={a.bot_score} />
                          <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 20, textAlign: "right" }}>{a.total}</span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: "#1e2330", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#ff2442", borderRadius: 2, transition: "width .5s" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};