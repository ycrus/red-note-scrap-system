const API = "http://localhost:5001";

// ── COOKIES ──────────────────────────────────────────
export const getCookies = () =>
  fetch(`${API}/api/cookies`).then(r => r.json());

export const saveCookies = (raw) =>
  fetch(`${API}/api/cookies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw })
  }).then(r => r.json());


// ── STATUS ───────────────────────────────────────────
export const getStatus = () =>
  fetch(`${API}/api/status`).then(r => r.json());


// ── SCRAPE ───────────────────────────────────────────
export const startScrape = (keywords, maxPosts, autoSentiment, minLikes, scrapeDetail) =>
  fetch(`${API}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, max_posts: maxPosts, auto_sentiment: autoSentiment, min_likes: minLikes, scrape_detail: scrapeDetail })
  }).then(r => r.json());

export const createEventSource = () =>
  new EventSource(`${API}/api/stream`);


// ── DETAIL SCRAPE ────────────────────────────────────
export const startDetailScrape = (limit, sessionId = null) =>
  fetch(`${API}/api/scrape/detail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit, ...(sessionId && { session_id: sessionId }) })
  }).then(r => r.json());

export const getDetailStatus = () =>
  fetch(`${API}/api/scrape/detail/status`).then(r => r.json());

export const getResultDetail = (id) =>
  fetch(`${API}/api/results/${id}/detail`).then(r => r.json());


// ── SENTIMENT ────────────────────────────────────────
export const analyzeSentiment = (limit) =>
  fetch(`${API}/api/sentiment/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit })
  }).then(r => r.json());

export const getSentimentStatus = () =>
  fetch(`${API}/api/sentiment/status`).then(r => r.json());


// ── HISTORY ──────────────────────────────────────────
export const getHistory = () =>
  fetch(`${API}/api/history`).then(r => r.json());

export const getSessionResults = (sessionId) =>
  fetch(`${API}/api/history/${sessionId}`).then(r => r.json());


// ── ANALYTICS ────────────────────────────────────────
export const getAnalyticsKeywords = () =>
  fetch(`${API}/api/analytics/keywords`).then(r => r.json());

export const getAnalyticsSentiment = () =>
  fetch(`${API}/api/analytics/sentiment`).then(r => r.json());

export const getAnalyticsTimeline = () =>
  fetch(`${API}/api/analytics/timeline`).then(r => r.json());

export const getAnalyticsTopAuthors = () =>
  fetch(`${API}/api/analytics/top-authors`).then(r => r.json());

export const downloadCsv = () =>
  window.open(`${API}/api/download/csv`, "_blank");