// ── Playbook ──────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { ICT_PLAYBOOK } from '../../utils/constants.js';

export default function Playbook() {
  const { theme: t } = useTheme();
  const [active, setActive] = useState(0);
  const play = ICT_PLAYBOOK[active];

  return (
    <div style={{ display:'flex', gap:16, height:'calc(100vh - 130px)', overflow:'hidden' }}>
      {/* List */}
      <div style={{ flex:'0 0 210px', display:'flex', flexDirection:'column', gap:6, overflowY:'auto' }}>
        <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', fontWeight:700, marginBottom:6 }}>ICT Setups</div>
        {ICT_PLAYBOOK.map((p,i) => (
          <button key={p.id} onClick={() => setActive(i)} style={{ background:active===i?t.bgHover:t.bgCard, border:`1px solid ${active===i?p.color+'60':t.border}`, borderRadius:10, padding:'12px 14px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'all 0.15s' }}>
            <div style={{ fontWeight:700, fontSize:13, color:active===i?p.color:t.text }}>{p.name}</div>
            <div style={{ fontSize:10, color:active===i?p.color+'80':t.textMuted, marginTop:3 }}>{p.category}</div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ paddingBottom:14, borderBottom:`2px solid ${play.color}30` }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, color:play.color }}>{play.name}</span>
            <span style={{ fontSize:11, color:play.color, background:play.color+'15', padding:'4px 10px', borderRadius:6, border:`1px solid ${play.color}30` }}>{play.tag}</span>
          </div>
          <div style={{ color:t.textMuted, fontSize:11, marginTop:4 }}>{play.category}</div>
        </div>

        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderLeft:`3px solid ${play.color}`, borderRadius:'0 10px 10px 0', padding:14 }}>
          <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Concept</div>
          <div style={{ color:t.text, fontSize:14, lineHeight:1.8 }}>{play.concept}</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 }}>Entry Checklist</div>
            {play.entry.map((step,i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:`1px solid ${t.border}` }}>
                <span style={{ color:play.color, fontWeight:800, fontSize:12, minWidth:20 }}>{i+1}.</span>
                <span style={{ color:t.text, fontSize:13, lineHeight:1.6 }}>{step}</span>
              </div>
            ))}
          </div>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 }}>Key Confluences</div>
            {play.confluences.map((c,i) => (
              <div key={i} style={{ display:'flex', gap:8, padding:'6px 0', borderBottom:`1px solid ${t.border}` }}>
                <span style={{ color:play.color, fontSize:12, flexShrink:0 }}>◈</span>
                <span style={{ color:t.text, fontSize:13 }}>{c}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:t.redDim, border:`1px solid ${t.red}30`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:9, color:t.red, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontWeight:700 }}>Stop Loss</div>
            <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{play.sl}</div>
          </div>
          <div style={{ background:t.accentDim, border:`1px solid ${t.accentBorder}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:9, color:t.accent, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontWeight:700 }}>Take Profit</div>
            <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{play.tp}</div>
          </div>
        </div>

        <div style={{ background:t.purpleDim, border:`1px solid ${t.purple}30`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:9, color:t.purple, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontWeight:700 }}>💡 Pro Notes</div>
          <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{play.notes}</div>
        </div>
      </div>
    </div>
  );
}
