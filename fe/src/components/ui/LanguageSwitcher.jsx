import { LANGUAGES } from "../../i18n";

export const LanguageSwitcher = ({ lang, onChangeLang }) => (
  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
    {LANGUAGES.map(({ code, label, flag }) => (
      <button
        key={code}
        onClick={() => onChangeLang(code)}
        style={{
          cursor: "pointer",
          border: lang === code ? "1px solid #ff2442" : "1px solid #2d3748",
          borderRadius: 6,
          background: lang === code ? "#2d1a1f" : "#1e2330",
          color: lang === code ? "#ff2442" : "#64748b",
          padding: "3px 8px",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "inherit",
          transition: "all .15s",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>{flag}</span>
        <span>{label}</span>
      </button>
    ))}
  </div>
);