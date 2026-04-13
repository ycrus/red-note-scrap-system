import { useState, useEffect, useCallback } from "react";
import { createEventSource } from "../../api";

const API = "http://localhost:5001";

const RISK_COLOR = (s) => s >= 80 ? "#ef4444" : s >= 60 ? "#f97316" : s >= 40 ? "#f59e0b" : s >= 20 ? "#22d3ee" : "#16a34a";
const RISK_LABEL = (s) => s >= 80 ? "CRITICAL" : s >= 60 ? "HIGH" : s >= 40 ? "MEDIUM" : s >= 20 ? "LOW" : "CLEAN";
const RISK_BG    = (s) => s >= 80 ? "#450a0a" : s >= 60 ? "#431407" : s >= 40 ? "#451a03" : s >= 20 ? "#083344" : "#052e16";

const EMOTION_ICON = { fear:"😰", anger:"😡", pride:"💪", disgust:"🤢", hope:"🌟", sadness:"😢" };
const ANGLE_ICON   = { victim:"🤕", aggressor:"⚔️", hero:"🦸", neutral:"⚖️", alarmist:"🚨", divisive:"⚡" };
const MANIP_ICON   = { appeal_to_fear:"😱", false_dichotomy:"🔀", scapegoating:"🐐", emotional_manipulation:"🎭", disinformation:"❌", propaganda:"📢", bandwagon:"🐑", none:"✅" };
const THEME_COLOR  = { war:"#ef4444", economy:"#f59e0b", health:"#22c55e", politics:"#7c3aed", culture:"#ec4899", religion:"#f97316", technology:"#0ea5e9", other:"#64748b" };

const RiskBadge = ({ score }) => (
  <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:10, background:RISK_BG(score), color:RISK_COLOR(score), letterSpacing:0.5, whiteSpace:"nowrap" }}>
    {RISK_LABEL(score)} {score}
  </span>
);

const BarChart = ({ data, colorFn }) => {
  if (!data?.length) return <div style={{ color:"#475569", fontSize:11 }}>No data yet</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {data.slice(0,8).map((d,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:120, fontSize:11, color:"#94a3b8", textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.label}</div>
          <div style={{ flex:1, height:16, background:"#1a1f2e", borderRadius:4, overflow:"hidden" }}>
            <div style={{ width:`${(d.count/max)*100}%`, height:"100%", background:colorFn?colorFn(d.label):"#7c3aed", borderRadius:4, minWidth:d.count>0?4:0, transition:"width .4s" }} />
          </div>
          <div style={{ width:28, fontSize:11, color:"#64748b", textAlign:"right" }}>{d.count}</div>
        </div>
      ))}
    </div>
  );
};

const PostList = ({ posts }) => {
  if (!posts?.length) return (
    <div style={{ textAlign:"center", padding:"40px 0", color:"#334155", fontSize:12 }}>
      No results — run framing analysis first.
    </div>
  );
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {posts.map((p,i) => (
        <div key={i} className="card" style={{ padding:14, borderLeft:`3px solid ${RISK_COLOR(p.risk_score)}`, borderRadius:"0 8px 8px 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", flex:1, marginRight:12, lineHeight:1.4 }}>{p.title}</div>
            <RiskBadge score={p.risk_score} />
          </div>
          <div style={{ display:"flex", gap:10, fontSize:10, color:"#475569", marginBottom:8 }}>
            <span>👤 {p.author}</span>
            <span>🔑 {p.keyword}</span>
            {p.narrative_theme && <span style={{ color:THEME_COLOR[p.narrative_theme]||"#64748b" }}>📂 {p.narrative_theme}</span>}
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:p.explanation?8:0 }}>
            {p.emotion_trigger && (
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#451a03", color:"#f59e0b" }}>
                {EMOTION_ICON[p.emotion_trigger]} {p.emotion_trigger}
              </span>
            )}
            {p.framing_angle && (
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#1e1a2e", color:"#a78bfa" }}>
                {ANGLE_ICON[p.framing_angle]} {p.framing_angle}
              </span>
            )}
            {p.blame_target && (
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#450a0a", color:"#fca5a5" }}>
                🎯 {p.blame_target}
              </span>
            )}
            {p.manipulation_technique && p.manipulation_technique !== "none" && (
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:"#1a0a3e", color:"#c4b5fd" }}>
                {MANIP_ICON[p.manipulation_technique]} {p.manipulation_technique.replace(/_/g," ")}
              </span>
            )}
          </div>
          {p.explanation && (
            <div style={{ fontSize:11, color:"#64748b", fontStyle:"italic", lineHeight:1.5, borderTop:"1px solid #1e2330", paddingTop:8 }}>
              {p.explanation}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const FramingTab = ({ lang = "en" }) => {
  const [status, setStatus]           = useState({ total:0, analyzed:0, pending:0, high_risk:0, configured:false });
  const [summary, setSummary]         = useState({ emotions:[], themes:[], blame:[], techniques:[] });
  const [results, setResults]         = useState([]);
  const [sessions, setSessions]       = useState([]);
  const [sessionId, setSessionId]     = useState("");
  const [minRisk, setMinRisk]         = useState(0);
  const [limit, setLimit]             = useState(50);
  const [running, setRunning]         = useState(false);
  const [logs, setLogs]               = useState([]);
  const [section, setSection]         = useState("overview");

  useEffect(() => { loadAll(); }, []);

  const loadAll = (sid) => {
    const s = sid !== undefined ? sid : sessionId;
    const q = s ? `/${s}` : "";
    fetch(`${API}/api/framing/status`).then(r=>r.json()).then(setStatus).catch(()=>{});
    fetch(`${API}/api/framing/summary${q}`).then(r=>r.json()).then(setSummary).catch(()=>{});
    fetch(`${API}/api/framing/results${q}?min_risk=${minRisk}&limit=${limit}`).then(r=>r.json()).then(setResults).catch(()=>{});
    fetch(`${API}/api/history`).then(r=>r.json()).then(setSessions).catch(()=>{});
  };

  const handleSession = (val) => { setSessionId(val); loadAll(val || undefined); };

  const handleRun = async () => {
    setRunning(true); setLogs([]);
    try {
      await fetch(`${API}/api/framing/analyze`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ limit, session_id: sessionId ? parseInt(sessionId) : null })
      });
      const es = createEventSource();
      es.onmessage = (e) => {
        const item = JSON.parse(e.data);
        if (item.type === "log")   setLogs(prev => [...prev.slice(-20), item.message]);
        if (item.type === "done") { es.close(); setRunning(false); loadAll(); }
        if (item.type === "error"){ es.close(); setRunning(false); }
      };
      es.onerror = () => { es.close(); setRunning(false); };
    } catch { setRunning(false); }
  };

  const highRisk = results.filter(r => r.risk_score >= 60);

  return (
    <div style={{ flex:1, overflowY:"auto", maxHeight:"calc(100vh - 100px)", padding:24 }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, fontFamily:"Syne, sans-serif" }}>Narrative Framing Classifier</div>
          <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>Cognitive warfare signals · blame / emotion / manipulation · powered by Claude AI</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {!status.configured && (
            <div style={{ fontSize:10, color:"#ef4444", padding:"4px 10px", borderRadius:8, border:"1px solid #7f1d1d", background:"#450a0a" }}>
              ⚠️ GROQ_API_KEY missing
            </div>
          )}
          <button className="btn btn-ghost" onClick={()=>loadAll()} style={{ fontSize:11 }}>↻ Refresh</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        {[
          { label:"Total posts",  value:status.total,     color:"#e2e8f0" },
          { label:"Analyzed",     value:status.analyzed,  color:"#7c3aed" },
          { label:"Pending",      value:status.pending,   color:"#f59e0b" },
          { label:"High risk",    value:status.high_risk, color:"#ef4444" },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding:12, textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:"Syne, sans-serif" }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="card" style={{ padding:14, marginBottom:20 }}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <select value={sessionId} onChange={e=>handleSession(e.target.value)}
            style={{ flex:2, minWidth:180, padding:"8px 10px", fontSize:12 }}>
            <option value="">All sessions</option>
            {sessions.map(s=>(
              <option key={s.id} value={s.id}>Session #{s.id} — {s.keywords?.join(", ")} ({s.total_results})</option>
            ))}
          </select>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:11, color:"#64748b" }}>Limit</span>
            <input type="number" value={limit} onChange={e=>setLimit(Math.max(1,parseInt(e.target.value)||50))}
              style={{ width:60, padding:"7px 10px", fontSize:12 }} />
          </div>
          <button className="btn" onClick={handleRun} disabled={running}
            style={{ background: status.configured ? "#7c3aed" : "#374151", color:"#fff", fontSize:12, padding:"8px 20px", minWidth:140 }}>
            {running ? "⏳ Analyzing..." : "🧠 Run Framing Analysis"}
          </button>
        </div>
        {logs.length > 0 && (
          <div style={{ marginTop:10, background:"#0f1117", borderRadius:8, padding:10, maxHeight:100, overflowY:"auto" }}>
            {logs.map((l,i)=><div key={i} style={{ fontSize:10, color:"#64748b", fontFamily:"monospace" }}>{l}</div>)}
          </div>
        )}
      </div>

      {/* Section tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {["overview","posts","high-risk"].map(s=>(
          <button key={s} className={`tab ${section===s?"active":""}`} onClick={()=>setSection(s)}
            style={{ fontSize:11, padding:"5px 14px" }}>
            {s==="overview"?"📊 Overview":s==="posts"?`📋 All Posts (${results.length})`:`🚨 High Risk (${highRisk.length})`}
          </button>
        ))}
      </div>

      {/* Overview charts */}
      {section === "overview" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", marginBottom:12 }}>😱 Emotion triggers</div>
            <BarChart data={summary.emotions.map(e=>({ ...e, label:`${EMOTION_ICON[e.label]||""} ${e.label}` }))}
              colorFn={()=>"#f59e0b"} />
          </div>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", marginBottom:12 }}>🗂 Narrative themes</div>
            <BarChart data={summary.themes} colorFn={l=>THEME_COLOR[l]||"#64748b"} />
          </div>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", marginBottom:12 }}>🎯 Blame targets</div>
            <BarChart data={summary.blame} colorFn={()=>"#ef4444"} />
          </div>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", marginBottom:12 }}>📢 Manipulation techniques</div>
            <BarChart data={summary.techniques.map(e=>({ ...e, label:`${MANIP_ICON[e.label]||""} ${e.label.replace(/_/g," ")}` }))}
              colorFn={()=>"#7c3aed"} />
          </div>
        </div>
      )}

      {/* All posts */}
      {section === "posts" && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <span style={{ fontSize:11, color:"#64748b" }}>Min risk</span>
            <input type="range" min={0} max={80} step={20} value={minRisk}
              onChange={e=>{ setMinRisk(Number(e.target.value)); loadAll(); }}
              style={{ width:120 }} />
            <span style={{ fontSize:11, color:"#e2e8f0", minWidth:24 }}>{minRisk}</span>
          </div>
          <PostList posts={results} />
        </div>
      )}

      {/* High risk */}
      {section === "high-risk" && (
        highRisk.length === 0
          ? <div style={{ textAlign:"center", padding:"40px 0", color:"#334155" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🛡</div>
              <div style={{ fontSize:12 }}>No high-risk posts found yet.</div>
            </div>
          : <PostList posts={highRisk} />
      )}
    </div>
  );
};