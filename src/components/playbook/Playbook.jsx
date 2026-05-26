// ── Playbook ──────────────────────────────────────────────────────────────────
// Multi-strategy playbook with category filter.
// Imports from constants.js which now holds all strategies across 7 methodologies.
import { useState, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { ICT_PLAYBOOK, PLAYBOOK_CATEGORIES } from '../../utils/constants.js';

export default function Playbook() {
  const { theme: t } = useTheme();
  const [activeId, setActiveId]       = useState(ICT_PLAYBOOK[0].id);
  const [category, setCategory]       = useState('All');

  // Filter the strategy list by selected category
  const filtered = useMemo(() =>
    category === 'All'
      ? ICT_PLAYBOOK
      : ICT_PLAYBOOK.filter(p => p.category === category),
    [category]
  );

  // When category changes, reset selection to first item in filtered list
  const play = ICT_PLAYBOOK.find(p => p.id === activeId)
    || filtered[0]
    || ICT_PLAYBOOK[0];

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    const firstInCat = cat === 'All' ? ICT_PLAYBOOK[0] : ICT_PLAYBOOK.find(p => p.category === cat);
    if (firstInCat) setActiveId(firstInCat.id);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, height:'calc(100vh - 130px)', overflow:'hidden' }}>

      {/* ── Category filter bar ── */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
        {PLAYBOOK_CATEGORIES.map(cat => {
          const active = category === cat;
          return (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              style={{
                padding:'5px 12px', fontSize:11, fontFamily:'inherit', cursor:'pointer',
                borderRadius:20, fontWeight: active ? 700 : 400, transition:'all 0.15s',
                background: active ? t.accent + '18' : t.bgCard,
                border: `1px solid ${active ? t.accent + '60' : t.border}`,
                color: active ? t.accent : t.textMuted,
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* ── Main split: list + detail ── */}
      <div style={{ display:'flex', gap:16, flex:1, overflow:'hidden', minHeight:0 }}>

        {/* Strategy list */}
        <div style={{ flex:'0 0 210px', display:'flex', flexDirection:'column', gap:6, overflowY:'auto' }}>
          <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', fontWeight:700, marginBottom:6 }}>
            {category === 'All' ? 'All Strategies' : category} · {filtered.length}
          </div>
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              style={{
                background: activeId===p.id ? t.bgHover : t.bgCard,
                border: `1px solid ${activeId===p.id ? p.color+'60' : t.border}`,
                borderRadius:10, padding:'12px 14px', cursor:'pointer',
                fontFamily:'inherit', textAlign:'left', transition:'all 0.15s', flexShrink:0,
              }}
            >
              <div style={{ fontWeight:700, fontSize:13, color: activeId===p.id ? p.color : t.text }}>
                {p.name}
              </div>
              <div style={{ fontSize:10, color: activeId===p.id ? p.color+'80' : t.textMuted, marginTop:3 }}>
                {p.category}
              </div>
            </button>
          ))}
        </div>

        {/* Strategy detail */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Header */}
          <div style={{ paddingBottom:14, borderBottom:`2px solid ${play.color}30` }}>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:900, color:play.color }}>
                {play.name}
              </span>
              <span style={{ fontSize:11, color:play.color, background:play.color+'15', padding:'4px 10px', borderRadius:6, border:`1px solid ${play.color}30` }}>
                {play.tag}
              </span>
            </div>
            <div style={{ color:t.textMuted, fontSize:11, marginTop:4 }}>{play.category}</div>
          </div>

          {/* Concept */}
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderLeft:`3px solid ${play.color}`, borderRadius:'0 10px 10px 0', padding:14 }}>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Concept</div>
            <div style={{ color:t.text, fontSize:14, lineHeight:1.8 }}>{play.concept}</div>
          </div>

          {/* Entry checklist + Confluences */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 }}>
                Entry Checklist
              </div>
              {play.entry.map((step,i) => (
                <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:`1px solid ${t.border}` }}>
                  <span style={{ color:play.color, fontWeight:800, fontSize:12, minWidth:20 }}>{i+1}.</span>
                  <span style={{ color:t.text, fontSize:13, lineHeight:1.6 }}>{step}</span>
                </div>
              ))}
            </div>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 }}>
                Key Confluences
              </div>
              {play.confluences.map((c,i) => (
                <div key={i} style={{ display:'flex', gap:8, padding:'6px 0', borderBottom:`1px solid ${t.border}` }}>
                  <span style={{ color:play.color, fontSize:12, flexShrink:0 }}>◈</span>
                  <span style={{ color:t.text, fontSize:13 }}>{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SL / TP */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ background:t.redDim, border:`1px solid ${t.red}30`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:9, color:t.red, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontWeight:700 }}>
                Stop Loss
              </div>
              <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{play.sl}</div>
            </div>
            <div style={{ background:t.accentDim, border:`1px solid ${t.accentBorder}`, borderRadius:10, padding:14 }}>
              <div style={{ fontSize:9, color:t.accent, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontWeight:700 }}>
                Take Profit
              </div>
              <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{play.tp}</div>
            </div>
          </div>

          {/* Pro notes */}
          <div style={{ background:t.purpleDim, border:`1px solid ${t.purple}30`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:9, color:t.purple, letterSpacing:2, textTransform:'uppercase', marginBottom:8, fontWeight:700 }}>
              💡 Pro Notes
            </div>
            <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{play.notes}</div>
          </div>

        </div>
      </div>
    </div>
  );
}
