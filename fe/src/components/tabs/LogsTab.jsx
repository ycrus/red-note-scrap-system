import { useRef, useEffect } from "react";

const logColor = (type) =>
  type === "error" ? "#ef4444" : type === "done" ? "#16a34a" : "#94a3b8";

export const LogsTab = ({ logs }) => {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  return (
    <div ref={logRef} style={{ flex: 1, padding: 20, overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
      {logs.length === 0 ? (
        <div style={{ textAlign: "center", color: "#2d3748", paddingTop: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 13 }}>Logs will appear here once scraping starts</div>
        </div>
      ) : logs.map(log => (
        <div key={log.id} style={{ display: "flex", gap: 12, fontSize: 12, animation: "fadeIn .15s ease", padding: "4px 0", borderBottom: "1px solid #1a1f2e" }}>
          <span style={{ color: "#2d3748", minWidth: 56, flexShrink: 0 }}>{log.time}</span>
          <span style={{ color: logColor(log.type) }}>{log.message}</span>
        </div>
      ))}
    </div>
  );
};