import { SentimentBadge } from "./ui/SentimentBadge";
import { BotBadge } from "./panels/BotPanel";

export const ResultsTable = ({ results, onOpenDetail, compact = false }) => {
  const p = compact ? "8px 12px" : "9px 12px";
  if (results.length === 0) return null;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: "#1a1f2e", position: "sticky", top: 0 }}>
          {["#", "Keyword", "Title", "Author", "Likes", "Date", "Sentiment", "Bot", "Link"].map(h => (
            <th key={h} style={{
              padding: p, textAlign: "left", color: "#475569", fontSize: 10,
              textTransform: "uppercase", letterSpacing: 0.5,
              borderBottom: "1px solid #2d3748", whiteSpace: "nowrap"
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #181c27" }}>
            <td style={{ padding: p, color: "#334155" }}>{i + 1}</td>
            <td style={{ padding: p }}>
              <span style={{ background: "#1e2330", padding: "2px 6px", borderRadius: 4, color: "#ff2442", fontSize: 10 }}>
                {r.keyword}
              </span>
            </td>
            <td style={{ padding: p, maxWidth: 240 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
            </td>
            <td style={{ padding: p, color: "#e2e8f0", whiteSpace: "nowrap" }}>{r.author}</td>
            <td style={{ padding: p, color: "#e2e8f0", textAlign: "right" }}>{r.likes}</td>
            <td style={{ padding: p, color: "#e2e8f0", whiteSpace: "nowrap" }}>{r.date}</td>
            <td style={{ padding: p }}><SentimentBadge sentiment={r.sentiment} score={r.sentiment_score} /></td>
            <td style={{ padding: p }}><BotBadge label={r.bot_label} score={r.bot_score} /></td>
            <td style={{ padding: p }}>
              <div style={{ display: "flex", gap: 6 }}>
                <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>Open ↗</a>
                {r.id && onOpenDetail && (
                  <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => onOpenDetail(r.id)}>Detail</button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};