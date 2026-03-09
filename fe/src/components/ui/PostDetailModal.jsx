import { SentimentBadge } from "./SentimentBadge";

export const PostDetailModal = ({ post, loading, onClose, onFetchDetail }) => {
  if (!post && !loading) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "85vh", overflowY: "auto", padding: 28 }}
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>Loading post detail...</div>
          </div>
        ) : post && (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 8 }}>{post.title}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#e2e8f0" }}>
                  <span>👤 {post.author}</span>
                  <span>❤️ {post.likes}</span>
                  {post.comments_count && <span>💬 {post.comments_count}</span>}
                  <span>📅 {post.date}</span>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }} onClick={onClose}>✕</button>
            </div>

            {/* Sentiment */}
            {post.sentiment && (
              <div style={{ marginBottom: 16 }}>
                <SentimentBadge sentiment={post.sentiment} score={post.sentiment_score} />
              </div>
            )}

            {/* Images */}
            {post.images?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Images ({post.images.length})
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {post.images.map((src, i) => (
                    <img key={i} src={src} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #2d3748" }} />
                  ))}
                </div>
              </div>
            )}

            {/* Content */}
            {post.content ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Content</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.7, background: "#0f1117", padding: 14, borderRadius: 8, border: "1px solid #2d3748", whiteSpace: "pre-wrap" }}>
                  {post.content}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 20, padding: 16, background: "#0f1117", borderRadius: 8, border: "1px solid #2d3748", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#334155" }}>
                  {post.detail_scraped ? "No content found for this post" : "Detail not scraped yet — click Fetch Details in sidebar"}
                </div>
                {!post.detail_scraped && onFetchDetail && (
                  <button className="btn" onClick={() => { onClose(); onFetchDetail(); }}
                    style={{ marginTop: 10, background: "#0ea5e9", color: "#fff", padding: "6px 16px", fontSize: 11 }}>
                    🔍 Fetch Now
                  </button>
                )}
              </div>
            )}

            {/* Tags */}
            {post.tags?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {post.tags.map((tag, i) => (
                    <span key={i} style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#ff2442" }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <a href={post.link} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0ea5e9", marginTop: 4 }}>
              Open original post ↗
            </a>
          </>
        )}
      </div>
    </div>
  );
};