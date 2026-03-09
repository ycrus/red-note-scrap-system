import { useState } from "react";
import { saveCookies as apiSaveCookies } from "../../api";

export const CookiePanel = ({ cookieStatus, cookieKeys, onCookiesSaved }) => {
  const [cookieRaw, setCookieRaw] = useState("");
  const [showPanel, setShowPanel] = useState(false);

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

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>🍪 Cookies</div>
        <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setShowPanel(p => !p)}>
          {showPanel ? "Close" : cookieStatus === "ok" ? "Update" : "Set Cookies"}
        </button>
      </div>

      {showPanel && (
        <div style={{ animation: "slideDown .2s ease" }}>
          <textarea value={cookieRaw} onChange={e => setCookieRaw(e.target.value)}
            placeholder="a1=xxx; web_session=yyy; webId=zzz; ..."
            style={{ width: "100%", height: 80, padding: "8px 10px", resize: "vertical", fontSize: 11, marginBottom: 8 }} />
          <button className="btn btn-green" style={{ width: "100%" }} onClick={handleSave}>✓ Save Cookies</button>
        </div>
      )}

      {!showPanel && cookieStatus === "ok" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {cookieKeys.map(k => (
            <span key={k} style={{ background: "#1e2330", border: "1px solid #2d3748", borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#e2e8f0" }}>{k}</span>
          ))}
        </div>
      )}

      {!showPanel && cookieStatus !== "ok" && (
        <div style={{ fontSize: 11, color: "#e2e8f0" }}>
          No cookies loaded. Click <strong style={{ color: "#ff2442" }}>Set Cookies</strong>.
        </div>
      )}
    </div>
  );
};