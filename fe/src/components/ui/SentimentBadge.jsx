export const SentimentBadge = ({ sentiment, score }) => {
  if (!sentiment) return <span style={{ color: "#334155", fontSize: 11 }}>—</span>;
  const config = {
    positive: { bg: "#f0fdf4", color: "#16a34a", border: "#86efac", icon: "😊" },
    negative: { bg: "#fff1f0", color: "#e53e3e", border: "#fca5a5", icon: "😞" },
    neutral:  { bg: "#f8fafc", color: "#64748b", border: "#cbd5e1", icon: "😐" },
  };
  const c = config[sentiment] || config.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`
    }}>
      {c.icon} {sentiment}
      {score && <span style={{ opacity: 0.7 }}>({Math.round(score * 100)}%)</span>}
    </span>
  );
};