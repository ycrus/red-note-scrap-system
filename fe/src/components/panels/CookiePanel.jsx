import { useState, useEffect } from "react";
import { t } from "../../i18n";
import { saveCookies as apiSaveCookies, createEventSource } from "../../api";

const API = "http://localhost:5001";

export const CookiePanel = ({ cookieStatus, cookieKeys, onCookiesSaved, lang = "en" }) => {
  const [cookieRaw, setCookieRaw]     = useState("");
  const [showPanel, setShowPanel]     = useState(false);
  const [loginState, setLoginState]   = useState("idle"); // idle | waiting | success | error
  const [loginMsg, setLoginMsg]       = useState("");


  const handleSave = async () => {
    if (!cookieRaw.trim()) return;
    try {
      const data = await apiSaveCookies(cookieRaw.trim());
      if (data.status === "ok") {
        onCookiesSaved(data.keys);
        setShowPanel(false);
        setCookieRaw("");
      }
    } catch {}
  };

  const handleBrowserLogin = async () => {
    setLoginState("waiting");
    setLoginMsg(t("loginWaiting", lang));
    try {
      const res = await fetch(`${API}/api/cookies/login`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setLoginState("error");
        setLoginMsg(data.error);
        return;
      }
      // Subscribe to SSE stream to get result
      const es = createEventSource();
      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "done") {
          es.close();
          if (item.total > 0) {
            setLoginState("success");
            setLoginMsg(t("loginSuccess", lang));
            // Wait briefly then reload cookies — backend needs a moment to commit
            setTimeout(() => {
              fetch(`${API}/api/cookies`)
                .then(r => r.json())
                .then(d => {
                  if (d.count > 0) {
                    onCookiesSaved(d.keys);
                  } else {
                    // Fallback: force reload from DB
                    fetch(`${API}/api/cookies/reload`, { method: "POST" })
                      .then(r => r.json())
                      .then(d2 => { if (d2.count > 0) onCookiesSaved(d2.keys); });
                  }
                });
            }, 1000);
          } else {
            setLoginState("error");
            setLoginMsg(t("loginTimeout", lang));
          }
          setTimeout(() => { setLoginState("idle"); setLoginMsg(""); }, 5000);
        }
        if (item.type === "error") {
          es.close();
          setLoginState("error");
          setLoginMsg(item.message);
          setTimeout(() => { setLoginState("idle"); setLoginMsg(""); }, 4000);
        }
      };
      es.onerror = () => { es.close(); setLoginState("idle"); };
    } catch (e) {
      setLoginState("error");
      setLoginMsg(e.message);
    }
  };

  const handleReload = async () => {
    try {
      const res = await fetch(`${API}/api/cookies/reload`, { method: "POST" });
      const data = await res.json();
      if (data.status === "ok") onCookiesSaved(data.keys);
    } catch {}
  };

  const statusColor = cookieStatus === "ok" ? "#16a34a" : "#ef4444";
  const statusDot   = cookieStatus === "ok" ? "🟢" : "🔴";

  return (
    <div className="card" style={{ padding: 14 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>
          {statusDot} {t("cookies", lang)}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} onClick={handleReload}
            title={t("reloadCookies", lang)}>
            ↺
          </button>
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => setShowPanel(p => !p)}>
            {showPanel ? "✕" : cookieStatus === "ok" ? t("updateCookies", lang) : t("setCookies", lang)}
          </button>
        </div>
      </div>

      {/* Login via browser button */}
      <button
        className="btn"
        onClick={handleBrowserLogin}
        disabled={loginState === "waiting"}
        style={{
          width: "100%",
          marginBottom: 8,
          background: loginState === "success" ? "#16a34a"
                    : loginState === "error"   ? "#7f1d1d"
                    : loginState === "waiting" ? "#1e2330"
                    : "#1a1f2e",
          border: `1px solid ${loginState === "success" ? "#16a34a"
                              : loginState === "error"   ? "#ef4444"
                              : loginState === "waiting" ? "#3b82f6"
                              : "#2d3748"}`,
          color: loginState === "waiting" ? "#3b82f6" : "#e2e8f0",
          padding: "7px 12px",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 8,
          cursor: loginState === "waiting" ? "not-allowed" : "pointer",
          transition: "all .2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {loginState === "waiting" && (
          <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>⏳</span>
        )}
        {loginState === "success" && "✅"}
        {loginState === "error"   && "❌"}
        {loginState === "idle"    && "🌐"}
        {loginMsg || t("loginViaBrowser", lang)}
      </button>

      {/* Manual cookie textarea */}
      {showPanel && (
        <div style={{ animation: "slideDown .2s ease" }}>
          <textarea value={cookieRaw} onChange={e => setCookieRaw(e.target.value)}
            placeholder="a1=xxx; web_session=yyy; webId=zzz; ..."
            style={{ width: "100%", height: 70, padding: "8px 10px", resize: "vertical", fontSize: 10, marginBottom: 8 }} />
          <button className="btn btn-green" style={{ width: "100%" }} onClick={handleSave}>
            {t("saveCookies", lang)}
          </button>
        </div>
      )}

      {/* Cookie keys display */}
      {!showPanel && cookieStatus === "ok" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {cookieKeys.map(k => (
            <span key={k} style={{ background: "#1e2330", border: "1px solid #2d3748", borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#94a3b8" }}>{k}</span>
          ))}
        </div>
      )}

      {/* No cookies warning */}
      {!showPanel && cookieStatus !== "ok" && (
        <div style={{ fontSize: 10, color: "#64748b" }}>
          {t("cookieMissing", lang)}
        </div>
      )}
    </div>
  );
};