import { useState, useEffect } from "react";
import { t } from "../../i18n";
import { SentimentBadge } from "./SentimentBadge";

const BOT_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#6366f1", clean: "#16a34a" };

export const PostDetailModal = ({ post, loading, onClose, onFetchDetail, lang = "en" }) => {
  const [commentPage, setCommentPage] = useState(0);
  const [b64Images, setB64Images]     = useState([]);

  useEffect(() => {
    if (!post?.id) return;
    setB64Images([]);
    fetch(`http://localhost:5001/api/images/${post.id}`)
      .then(r => r.json())
      .then(d => { if (d.images?.length > 0) setB64Images(d.images); })
      .catch(() => {});
  }, [post?.id]);
  const COMMENTS_PER_PAGE = 10;

  if (!post && !loading) return null;

  const comments = post?.comments || [];
  const totalPages = Math.ceil(comments.length / COMMENTS_PER_PAGE);
  const visibleComments = comments.slice(commentPage * COMMENTS_PER_PAGE, (commentPage + 1) * COMMENTS_PER_PAGE);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "88vh", overflowY: "auto", padding: 28 }}
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>{t("loadingDetail", lang)}</div>
          </div>
        ) : post && (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 8 }}>{post.title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "#94a3b8" }}>
                  <span>👤 {post.author}</span>
                  <span>❤️ {post.likes}</span>
                  <span>💬 {comments.length > 0 ? `${comments.length} comments` : (post.comments_count || "—")}</span>
                  <span>📅 {post.date}</span>
                  {post.bot_label && (
                    <span style={{ color: BOT_COLORS[post.bot_label] || "#94a3b8", fontWeight: 700 }}>
                      🤖 {post.bot_label.toUpperCase()} {post.bot_score != null ? `(${post.bot_score})` : ""}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }} onClick={onClose}>{t("close", lang)}</button>
            </div>

            {/* Sentiment */}
            {post.sentiment && (
              <div style={{ marginBottom: 16 }}>
                <SentimentBadge sentiment={post.sentiment} score={post.sentiment_score} />
              </div>
            )}

            {/* Images */}
            {/* ── VIDEO PLAYER ── */}
            {post.video_url && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  🎬 Video
                </div>
                <video
                  controls
                  style={{ width: "100%", borderRadius: 8, maxHeight: 400, background: "#000" }}
                  src={`http://localhost:5001/api/video/proxy?url=${encodeURIComponent(post.video_url)}`}
                  preload="metadata"
                >
                  Your browser does not support video playback.
                </video>
              </div>
            )}

            {(b64Images.length > 0 || post.images?.length > 0) && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  {t("images", lang)} ({b64Images.length > 0 ? b64Images.length : post.images.length})
                  {b64Images.length > 0 && <span style={{ fontSize: 9, color: "#16a34a", marginLeft: 8 }}>cached</span>}
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {b64Images.length > 0
                    ? b64Images.map((img, i) => (
                        <img key={i} src={img.base64} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #2d3748" }} />
                      ))
                    : post.images.map((src, i) => (
                        <img key={i} src={src} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #2d3748" }} />
                      ))
                  }
                </div>
              </div>
            )}

            {/* Content */}
            {post.content ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Content</div>
                <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.7, background: "#0f1117", padding: 14, borderRadius: 8, border: "1px solid #2d3748", whiteSpace: "pre-wrap" }}>
                  {post.content}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 20, padding: 16, background: "#0f1117", borderRadius: 8, border: "1px solid #2d3748", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#334155" }}>
                  {post.detail_scraped ? t("noContent", lang) : t("noDetailYet", lang)}
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
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("tags", lang)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {post.tags.map((tag, i) => (
                    <span key={i} style={{ background: "#0f1117", border: "1px solid #2d3748", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#ff2442" }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── COMMENTS ────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                  💬 {t("comments", lang)}
                  <span style={{ marginLeft: 8, background: "#1e2330", border: "1px solid #2d3748", borderRadius: 10, padding: "1px 8px", fontSize: 10, color: "#475569", fontWeight: 400 }}>
                    {comments.length}
                  </span>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }}
                      disabled={commentPage === 0} onClick={() => setCommentPage(p => p - 1)}>‹</button>
                    <span style={{ fontSize: 10, color: "#475569" }}>{commentPage + 1}/{totalPages}</span>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }}
                      disabled={commentPage >= totalPages - 1} onClick={() => setCommentPage(p => p + 1)}>›</button>
                  </div>
                )}
              </div>

              {comments.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center", color: "#334155", fontSize: 12 }}>
                  {post.detail_scraped
                    ? "No comments found for this post."
                    : t("noDetailYet", lang)}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visibleComments.map((c, i) => (
                    <div key={i} style={{
                      background: c.is_reply ? "transparent" : "#0f1117",
                      borderRadius: 10,
                      padding: c.is_reply ? "8px 10px 8px 20px" : "10px 14px",
                      border: c.is_reply ? "none" : "1px solid #1e2330",
                      marginLeft: c.is_reply ? 32 : 0,
                      borderLeft: c.is_reply ? "2px solid #2d3748" : "none",
                    }}>
                      {/* Reply indicator */}
                      {c.is_reply && c.parent_username && (
                        <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>
                          ↳ replying to <span style={{ color: "#7c3aed" }}>@{c.parent_username}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: c.is_reply ? 18 : 24,
                            height: c.is_reply ? 18 : 24,
                            borderRadius: "50%",
                            background: c.is_reply ? "#1a1f2e" : "#1e2330",
                            border: "1px solid #2d3748",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: c.is_reply ? 9 : 11,
                            color: c.is_reply ? "#7c3aed" : "#ff2442",
                            fontWeight: 700, flexShrink: 0
                          }}>
                            {c.username ? c.username[0].toUpperCase() : "?"}
                          </div>
                          <span style={{ fontSize: c.is_reply ? 10 : 11, fontWeight: 600, color: c.is_reply ? "#94a3b8" : "#e2e8f0" }}>
                            {c.username || "—"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {c.likes && <span style={{ fontSize: 10, color: "#475569" }}>❤️ {c.likes}</span>}
                          {c.posted_at && <span style={{ fontSize: 10, color: "#334155" }}>{c.posted_at}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: c.is_reply ? 11 : 12, color: c.is_reply ? "#94a3b8" : "#cbd5e1", lineHeight: 1.6, paddingLeft: c.is_reply ? 24 : 30 }}>
                        {c.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #1e2330", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <a href={post.link} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0ea5e9" }}>
                {t("openPost", lang)}
              </a>
              <span style={{ fontSize: 10, color: "#334155" }}>
                {post.scraped_at ? `Scraped: ${new Date(post.scraped_at).toLocaleString()}` : ""}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};