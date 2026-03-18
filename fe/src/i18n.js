// ── i18n — RedNote Scraper ────────────────────────────
// Supported: en | jp | id

export const LANGUAGES = [
  { code: "en", label: "EN", flag: "🇺🇸", name: "English" },
  { code: "jp", label: "JP", flag: "🇯🇵", name: "日本語" },
  { code: "id", label: "ID", flag: "🇮🇩", name: "Indonesia" },
];

const translations = {

  // ── General ──────────────────────────────────────────
  refresh:          { en: "↻ Refresh",       jp: "↻ 更新",         id: "↻ Refresh" },
  loading:          { en: "Loading...",       jp: "読み込み中...",    id: "Memuat..." },
  noData:           { en: "No data yet",      jp: "データなし",      id: "Belum ada data" },
  close:            { en: "✕ Close",          jp: "✕ 閉じる",       id: "✕ Tutup" },
  save:             { en: "Save",             jp: "保存",            id: "Simpan" },
  cancel:           { en: "Cancel",           jp: "キャンセル",      id: "Batal" },
  all:              { en: "All",              jp: "全て",            id: "Semua" },
  search:           { en: "Search...",        jp: "検索...",         id: "Cari..." },
  total:            { en: "Total",            jp: "合計",            id: "Total" },
  status:           { en: "Status",           jp: "ステータス",      id: "Status" },
  idle:             { en: "Idle",             jp: "待機中",          id: "Idle" },
  pending:          { en: "Pending",          jp: "未処理",          id: "Pending" },
  done:             { en: "Done",             jp: "完了",            id: "Selesai" },
  error:            { en: "Error",            jp: "エラー",          id: "Error" },

  // ── Tabs ─────────────────────────────────────────────
  tabLogs:          { en: "📋 Logs",          jp: "📋 ログ",         id: "📋 Log" },
  tabResults:       { en: "📊 Results",       jp: "📊 結果",         id: "📊 Hasil" },
  tabHistory:       { en: "🕘 History",       jp: "🕘 履歴",         id: "🕘 Riwayat" },
  tabDashboard:     { en: "📈 Dashboard",     jp: "📈 ダッシュボード", id: "📈 Dashboard" },
  tabTrending:      { en: "🔥 Trending",      jp: "🔥 トレンド",     id: "🔥 Trending" },

  // ── Sidebar / Scrape ─────────────────────────────────
  cookies:          { en: "🍪 Cookies",       jp: "🍪 Cookie",      id: "🍪 Cookies" },
  setCookies:       { en: "Set Cookies",      jp: "Cookie設定",     id: "Set Cookies" },
  updateCookies:    { en: "Update",           jp: "更新",            id: "Update" },
  saveCookies:      { en: "✓ Save Cookies",   jp: "✓ 保存",         id: "✓ Simpan Cookie" },
  noCookies:        { en: "No Cookies",       jp: "Cookie未設定",   id: "No Cookies" },
  cookiePlaceholder:{ en: "a1=xxx; web_session=yyy; webId=zzz; ...", jp: "a1=xxx; web_session=yyy; webId=zzz; ...", id: "a1=xxx; web_session=yyy; webId=zzz; ..." },
  cookieMissing:    { en: "No cookies loaded. Click Set Cookies.", jp: "Cookie未設定。設定してください。", id: "Cookie belum ada. Klik Set Cookies." },

  keywords:         { en: "Keywords",         jp: "キーワード",      id: "Keyword" },
  keywordsHint:     { en: "One keyword per line", jp: "1行1キーワード", id: "Satu keyword per baris" },
  maxPosts:         { en: "Max Posts",         jp: "最大投稿数",      id: "Max Post" },
  autoSentiment:    { en: "Auto Sentiment",    jp: "自動感情分析",    id: "Auto Sentiment" },
  startScrape:      { en: "▶ Start Scraping",  jp: "▶ スクレイプ開始", id: "▶ Mulai Scraping" },
  scraping:         { en: "Scraping...",       jp: "処理中...",      id: "Scraping..." },

  alertNoCookies:   { en: "Please set cookies first!", jp: "先にCookieを設定してください！", id: "Harap set cookies terlebih dahulu!" },
  alertNoKeyword:   { en: "Please enter at least one keyword.", jp: "キーワードを入力してください。", id: "Masukkan minimal satu keyword." },

  // ── Results Table ────────────────────────────────────
  colKeyword:       { en: "Keyword",          jp: "キーワード",      id: "Keyword" },
  colTitle:         { en: "Title",            jp: "タイトル",        id: "Judul" },
  colAuthor:        { en: "Author",           jp: "作者",            id: "Author" },
  colLikes:         { en: "Likes",            jp: "いいね",          id: "Likes" },
  colDate:          { en: "Date",             jp: "日付",            id: "Tanggal" },
  colSentiment:     { en: "Sentiment",        jp: "感情",            id: "Sentimen" },
  colBot:           { en: "Bot",              jp: "Bot",             id: "Bot" },
  colLink:          { en: "Link",             jp: "リンク",          id: "Link" },
  noResults:        { en: "No results yet.",  jp: "結果なし。",       id: "Belum ada hasil." },
  noResultsFilter:  { en: "No results match filter.", jp: "該当なし。", id: "Tidak ada hasil yang cocok." },

  // ── Detail / Modal ───────────────────────────────────
  postDetail:       { en: "Post Detail",      jp: "投稿詳細",        id: "Detail Post" },
  loadingDetail:    { en: "Loading post detail...", jp: "読み込み中...", id: "Memuat detail..." },
  noContent:        { en: "No content found for this post", jp: "コンテンツなし", id: "Konten tidak ditemukan" },
  noDetailYet:      { en: "Detail not scraped yet — click Fetch Details in sidebar", jp: "詳細未取得 — サイドバーでFetch Details", id: "Detail belum di-scrape — klik Fetch Details di sidebar" },
  images:           { en: "Images",           jp: "画像",            id: "Gambar" },
  tags:             { en: "Tags",             jp: "タグ",            id: "Tag" },
  comments:         { en: "Comments",         jp: "コメント",        id: "Komentar" },
  openPost:         { en: "Open Post ↗",      jp: "投稿を開く ↗",    id: "Buka Post ↗" },

  // ── Sentiment Panel ──────────────────────────────────
  sentimentAnalysis:{ en: "Sentiment Analysis", jp: "感情分析",      id: "Analisis Sentimen" },
  analyzed:         { en: "Analyzed",         jp: "分析済み",        id: "Dianalisis" },
  analyzing:        { en: "Analyzing...",     jp: "分析中...",       id: "Menganalisis..." },
  runSentiment:     { en: "▶ Run Analysis",   jp: "▶ 分析実行",     id: "▶ Jalankan Analisis" },
  hfConnected:      { en: "HF Connected",     jp: "HF接続済み",     id: "HF Terhubung" },
  noHfKey:          { en: "No HF Key",        jp: "HF Key未設定",   id: "No HF Key" },
  positive:         { en: "Positive",         jp: "ポジティブ",      id: "Positif" },
  negative:         { en: "Negative",         jp: "ネガティブ",      id: "Negatif" },
  neutral:          { en: "Neutral",          jp: "ニュートラル",    id: "Netral" },

  // ── Bot Panel ────────────────────────────────────────
  botDetection:     { en: "🤖 Bot Detection", jp: "🤖 Bot検出",     id: "🤖 Deteksi Bot" },
  detectBots:       { en: "Detect Bots",      jp: "Bot検出",        id: "Deteksi Bot" },
  detecting:        { en: "Detecting...",     jp: "検出中...",      id: "Mendeteksi..." },
  checked:          { en: "Checked",          jp: "確認済み",        id: "Dicek" },
  botHigh:          { en: "BOT",              jp: "BOT",            id: "BOT" },
  botMedium:        { en: "SUSPICIOUS",       jp: "疑わしい",        id: "SUSPICIOUS" },
  botLow:           { en: "LOW RISK",         jp: "低リスク",        id: "LOW RISK" },
  botClean:         { en: "CLEAN",            jp: "クリーン",        id: "CLEAN" },

  
  // ── Detail Scrape Panel (extra) ──────────────────────
  scrapePostDetail: { en: "🔍 Scrape Post Detail", jp: "🔍 投稿詳細取得",  id: "🔍 Scrape Detail Post" },
  limit:            { en: "Limit:",                jp: "上限:",            id: "Limit:" },
  posts:            { en: "posts",                 jp: "件",               id: "post" },
  fetchDetails:     { en: "🔍 Fetch Details",      jp: "🔍 詳細取得",      id: "🔍 Fetch Details" },
  running:          { en: "⏳ Running...",          jp: "⏳ 処理中...",     id: "⏳ Berjalan..." },
  fetchDetailHint:  { en: "Fetches full content, images & tags per post", jp: "投稿の本文・画像・タグを取得", id: "Ambil konten, gambar & tag per post" },
  maxPosts:         { en: "MAX POSTS",              jp: "最大投稿数",       id: "MAX POST" },
  autoSentimentHint:{ en: "Analyze while scraping (slower)", jp: "スクレイプ中に分析（低速）", id: "Analisis saat scraping (lebih lambat)" },

  // ── Detail Scrape Panel ──────────────────────────────
  fetchDetails:     { en: "Fetch Details",    jp: "詳細取得",        id: "Fetch Details" },
  fetching:         { en: "Fetching...",      jp: "取得中...",       id: "Mengambil..." },
  scraped:          { en: "Scraped",          jp: "取得済み",        id: "Di-scrape" },

  // ── Dashboard ────────────────────────────────────────
  dashboard:        { en: "Analytics Dashboard", jp: "分析ダッシュボード", id: "Dashboard Analitik" },
  totalPosts:       { en: "Total Posts",      jp: "総投稿数",        id: "Total Post" },
  keywordsTracked:  { en: "Keywords Tracked", jp: "追跡キーワード",  id: "Keyword Dilacak" },
  postsPerKeyword:  { en: "📊 Posts per Keyword", jp: "📊 キーワード別投稿", id: "📊 Post per Keyword" },
  sentimentDist:    { en: "🎭 Sentiment Distribution", jp: "🎭 感情分布", id: "🎭 Distribusi Sentimen" },
  scrapingTimeline: { en: "📅 Scraping Timeline", jp: "📅 スクレイプ履歴", id: "📅 Timeline Scraping" },
  topAuthors:       { en: "👤 Top Authors",   jp: "👤 人気著者",     id: "👤 Top Author" },

  // ── History ──────────────────────────────────────────
  history:          { en: "Scraping History", jp: "スクレイプ履歴",  id: "Riwayat Scraping" },
  session:          { en: "Session",          jp: "セッション",      id: "Sesi" },
  results:          { en: "Results",          jp: "結果",            id: "Hasil" },

  // ── Trending ─────────────────────────────────────────
  trendingTitle:    { en: "🔥 Trending Topics", jp: "🔥 トレンド",   id: "🔥 Trending Topics" },
  lastScrape:       { en: "Last live scrape:", jp: "最終取得:",       id: "Scrape terakhir:" },
  scrapeLiveTrends: { en: "🔍 Scrape Live Trends", jp: "🔍 リアルタイム取得", id: "🔍 Scrape Live Trends" },
  topHashtags:      { en: "# Hashtags",       jp: "# ハッシュタグ",  id: "# Hashtag" },
  topTopics:        { en: "💬 Topics",         jp: "💬 トピック",     id: "💬 Topik" },
  chart:            { en: "📊 Chart",          jp: "📊 グラフ",       id: "📊 Chart" },
  live:             { en: "🌐 Live",           jp: "🌐 ライブ",       id: "🌐 Live" },
  hashtagRanking:   { en: "Top Hashtags — Ranking", jp: "ハッシュタグランキング", id: "Top Hashtag — Ranking" },
  hashtagCloud:     { en: "Hashtag Cloud",     jp: "ハッシュタグ雲",  id: "Hashtag Cloud" },
  hotTopics:        { en: "💬 Hot Topics",     jp: "💬 人気トピック", id: "💬 Hot Topics" },
  topicCloud:       { en: "Topic Cloud",       jp: "トピック雲",      id: "Topic Cloud" },
  top15Chart:       { en: "Top 15 Hashtags — Bar Chart", jp: "上位15ハッシュタグ", id: "Top 15 Hashtag — Bar Chart" },
  liveFromExplore:  { en: "Live Trending from RedNote Explore", jp: "RedNote Exploreのトレンド", id: "Live Trending dari RedNote Explore" },
  samplePosts:      { en: "Sample Posts per Hashtag", jp: "ハッシュタグ別投稿例", id: "Sample Post per Hashtag" },
  noHashtags:       { en: "No hashtags found. Scrape some keywords first.", jp: "ハッシュタグなし。キーワードをスクレイプしてください。", id: "Belum ada hashtag. Scrape keyword dulu." },
  noTopics:         { en: "No topic data. Scrape some keywords first.", jp: "トピックなし。キーワードをスクレイプしてください。", id: "Belum ada topik. Scrape keyword dulu." },
  noLiveData:       { en: "No live data yet. Click Scrape Live Trends (requires valid cookies).", jp: "ライブデータなし。Cookie設定後に取得してください。", id: "Belum ada data live. Klik Scrape Live Trends (butuh cookies valid)." },
  scrapeTip:        { en: "💡 Scrape some keywords first to analyze local hashtags & topics. Or click Scrape Live Trends for real-time data (requires valid cookies).", jp: "💡 まずキーワードをスクレイプしてローカル分析を行うか、Scrape Live Trendsでリアルタイムデータを取得してください（Cookie必要）。", id: "💡 Scrape beberapa keyword dulu agar hashtag & topik bisa dianalisis. Atau klik Scrape Live Trends untuk data real-time (butuh cookies valid)." },

  // ── Browser Login ─────────────────────────────────────
  loginViaBrowser:  { en: "🌐 Login via Browser", jp: "🌐 ブラウザでログイン", id: "🌐 Login via Browser" },
  loginWaiting:     { en: "Waiting for login...", jp: "ログイン待機中...",     id: "Menunggu login..." },
  loginSuccess:     { en: "✅ Login successful!", jp: "✅ ログイン成功！",      id: "✅ Login berhasil!" },
  loginTimeout:     { en: "Login timeout",        jp: "タイムアウト",          id: "Login timeout" },
  reloadCookies:    { en: "↺ Reload Saved",       jp: "↺ 保存済み読込",        id: "↺ Muat Tersimpan" },
  cookiesExpired:   { en: "Cookies may be expired", jp: "Cookieが期限切れかも", id: "Cookies mungkin kadaluwarsa" },

  };

// ── Hook / helper ─────────────────────────────────────
const STORAGE_KEY = "rednote_lang";

export function getLang() {
  try { return localStorage.getItem(STORAGE_KEY) || "en"; } catch { return "en"; }
}

export function setLang(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

export function t(key, lang) {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry["en"] || key;
}

export default translations;