export const Badge = ({ ok, label }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: ok ? "#f0fdf4" : "#fff1f0",
    color: ok ? "#16a34a" : "#e53e3e",
    border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`
  }}>
    <span style={{
      width: 6, height: 6, borderRadius: "50%",
      background: ok ? "#16a34a" : "#e53e3e",
      animation: ok ? "none" : "pulse 1s infinite"
    }} />
    {label}
  </span>
);