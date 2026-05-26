import { useState, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { PAIRS, SESSIONS, GRADES, GRADE_COLORS, SESSION_COLORS } from '../../utils/constants.js';

const pnlColor = (v, t) => Number(v) > 0 ? t.accent : Number(v) < 0 ? t.red : t.textMuted;

export default function TradeLog({ trades, onEdit, onDelete, getImageUrl }) {
  const { theme: t } = useTheme();
  const [filterPair, setFilterPair]       = useState('ALL');
  const [filterSession, setFilterSession] = useState('ALL');
  const [filterGrade, setFilterGrade]     = useState('ALL');
  const [filterDir, setFilterDir]         = useState('ALL');
  const [filterSource, setFilterSource]   = useState('ALL');
  const [search, setSearch]               = useState('');
  const [sortBy, setSortBy]               = useState('date');
  const [selected, setSelected]           = useState(null);
  const [lightboxImg, setLightboxImg]     = useState(null);

  const filtered = useMemo(() => {
    let list = [...trades];
    if (filterPair !== 'ALL')    list = list.filter(tr => tr.pair === filterPair);
    if (filterSession !== 'ALL') list = list.filter(tr => tr.session === filterSession);
    if (filterGrade !== 'ALL')   list = list.filter(tr => tr.grade === filterGrade);
    if (filterDir !== 'ALL')     list = list.filter(tr => tr.direction === filterDir);
    if (filterSource !== 'ALL')  list = list.filter(tr => tr.source === filterSource);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(tr =>
        tr.pair?.toLowerCase().includes(q) ||
        tr.setup?.toLowerCase().includes(q) ||
        tr.notes?.toLowerCase().includes(q) ||
        tr.mistakes?.toLowerCase().includes(q) ||
        (Array.isArray(tr.tags) && tr.tags.some(tag => tag.toLowerCase().includes(q)))
      );
    }
    if (sortBy === 'date') list.sort((a,b) => new Date(b.trade_date+'T'+(b.trade_time||'00:00')) - new Date(a.trade_date+'T'+(a.trade_time||'00:00')));
    if (sortBy === 'pnl')  list.sort((a,b) => Number(b.pnl||0) - Number(a.pnl||0));
    if (sortBy === 'rr')   list.sort((a,b) => Number(b.rr||0) - Number(a.rr||0));
    if (sortBy === 'grade') list.sort((a,b) => (GRADES.indexOf(a.grade)) - GRADES.indexOf(b.grade));
    return list;
  }, [trades, filterPair, filterSession, filterGrade, filterDir, filterSource, search, sortBy]);

  const filteredPnl = filtered.reduce((a,b) => a + Number(b.pnl||0), 0);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return;
    await onDelete(id);
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div style={{ display:'flex', gap:16, height:'calc(100vh - 130px)', overflow:'hidden' }}>

      {/* Left: List */}
      <div style={{ flex:'0 0 400px', display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
        {/* Search */}
        <input style={{ ...inp(t), padding:'10px 14px' }} placeholder="🔍  Search pair, setup, tags, notes..."
          value={search} onChange={e => setSearch(e.target.value)} />

        {/* Filters */}
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:10, display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <Sel value={filterPair}    onChange={setFilterPair}    options={['ALL',...PAIRS]}    label="Pair" t={t}/>
            <Sel value={filterSession} onChange={setFilterSession} options={['ALL',...SESSIONS]} label="Session" t={t}/>
            <Sel value={filterGrade}   onChange={setFilterGrade}   options={['ALL',...GRADES]}   label="Grade" t={t}/>
            <Sel value={filterDir}     onChange={setFilterDir}     options={['ALL','LONG','SHORT']} label="Dir" t={t}/>
            <Sel value={filterSource}  onChange={setFilterSource}  options={['ALL','manual','mt5_ea','mt5_import']} label="Source" t={t}/>
            <Sel value={sortBy}        onChange={setSortBy}        options={['date','pnl','rr','grade']} label="Sort" t={t}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:10, color:t.textMuted }}>{filtered.length} trade{filtered.length!==1?'s':''}</span>
            <span style={{ fontSize:10, fontWeight:700, color:pnlColor(filteredPnl,t) }}>${filteredPnl.toFixed(2)} P&L</span>
          </div>
        </div>

        {/* List */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 20px', color:t.textMuted }}>
              <div style={{ fontSize:32, marginBottom:10 }}>◈</div>
              <div>No trades match</div>
            </div>
          )}
          {filtered.map(tr => (
            <TradeCard key={tr.id} trade={tr} t={t} selected={selected?.id===tr.id}
              onSelect={() => setSelected(tr)} onEdit={() => onEdit(tr)} onDelete={() => handleDelete(tr.id)} />
          ))}
        </div>
      </div>

      {/* Right: Detail */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {selected ? (
          <TradeDetail trade={selected} t={t} getImageUrl={getImageUrl}
            onEdit={() => onEdit(selected)} onDelete={() => handleDelete(selected.id)}
            onLightbox={setLightboxImg} />
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8 }}>
            <div style={{ fontSize:48, color:t.border }}>◫</div>
            <div style={{ color:t.textMuted, fontSize:13 }}>Select a trade to view details</div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div style={{ position:'fixed', inset:0, background:'#000000e0', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="Chart" style={{ maxWidth:'90vw', maxHeight:'90vh', borderRadius:8, objectFit:'contain' }} />
        </div>
      )}
    </div>
  );
}

function TradeCard({ trade: tr, t, selected, onSelect, onEdit, onDelete }) {
  return (
    <div style={{ border:`1px solid ${selected?t.accent+'40':t.border}`, borderRadius:10, padding:13, cursor:'pointer', transition:'border-color 0.15s', background: selected ? t.accentDim : t.bgCard }}
      onClick={onSelect}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ display:'flex', gap:7, alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:5, background:tr.direction==='LONG'?t.accentDim:t.redDim, color:tr.direction==='LONG'?t.accent:t.red, border:`1px solid ${tr.direction==='LONG'?t.accent:t.red}40` }}>
            {tr.direction==='LONG'?'▲':'▼'} {tr.direction}
          </span>
          <span style={{ color:t.textStrong, fontWeight:800, fontSize:14 }}>{tr.pair}</span>
          {tr.source !== 'manual' && <span style={{ fontSize:9, color:t.purple, background:t.purpleDim, padding:'1px 5px', borderRadius:3 }}>MT5</span>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ color:GRADE_COLORS[tr.grade]||t.textMuted, fontWeight:800, fontSize:13 }}>{tr.grade}</span>
          <span style={{ color:pnlColor(tr.pnl,t), fontWeight:800, fontSize:14 }}>{Number(tr.pnl||0)>0?'+':''}${tr.pnl}</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:12, marginTop:5, flexWrap:'wrap' }}>
        <span style={{ color:t.purple, fontSize:11 }}>{tr.setup}</span>
        <span style={{ color:t.textMuted, fontSize:11 }}>{tr.trade_date}</span>
        <span style={{ color:SESSION_COLORS[tr.session]||t.textMuted, fontSize:11 }}>{tr.session}</span>
        <span style={{ color:t.yellow, fontSize:11 }}>{tr.rr}R</span>
        <span style={{ color:tr.followed_plan?t.accent+'80':t.red+'80', fontSize:11 }}>{tr.followed_plan?'✓ Plan':'✗ Dev'}</span>
      </div>
      {Array.isArray(tr.tags) && tr.tags.length > 0 && (
        <div style={{ display:'flex', gap:4, marginTop:6, flexWrap:'wrap' }}>
          {tr.tags.slice(0,5).map(tag => <span key={tag} style={{ fontSize:9, background:t.bgHover, color:t.purple, padding:'1px 6px', borderRadius:3, border:`1px solid ${t.purple}20` }}>{tag}</span>)}
        </div>
      )}
      {tr.mistakes && <div style={{ fontSize:10, color:t.yellow+'80', marginTop:5, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>⚠ {tr.mistakes}</div>}
      <div style={{ display:'flex', gap:5, marginTop:8, justifyContent:'flex-end' }}>
        <button style={actionBtn(t)} onClick={e=>{e.stopPropagation();onEdit();}}>✎ Edit</button>
        <button style={{...actionBtn(t),color:t.red+'80',borderColor:t.red+'20'}} onClick={e=>{e.stopPropagation();onDelete();}}>✕</button>
      </div>
    </div>
  );
}

function TradeDetail({ trade: tr, t, getImageUrl, onEdit, onDelete, onLightbox }) {
  return (
    <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:20 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
        <div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:900, color:t.textStrong }}>{tr.pair}</span>
            <span style={{ fontSize:13, fontWeight:800, padding:'3px 10px', borderRadius:6, background:tr.direction==='LONG'?t.accentDim:t.redDim, color:tr.direction==='LONG'?t.accent:t.red, border:`1px solid ${tr.direction==='LONG'?t.accent:t.red}40` }}>{tr.direction}</span>
            <span style={{ color:GRADE_COLORS[tr.grade]||t.textMuted, fontWeight:800, fontSize:20 }}>{tr.grade}</span>
            {tr.source !== 'manual' && <span style={{ fontSize:10, color:t.purple, background:t.purpleDim, padding:'3px 8px', borderRadius:4 }}>MT5 Auto</span>}
          </div>
          <div style={{ color:t.textMuted, fontSize:12, marginTop:4 }}>{tr.trade_date} · {tr.trade_time} · {tr.session}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:900, color:pnlColor(tr.pnl,t) }}>{Number(tr.pnl||0)>0?'+':''}${tr.pnl}</div>
          <div style={{ color:pnlColor(tr.pips,t), fontSize:13 }}>{Number(tr.pips||0)>0?'+':''}{tr.pips} pips</div>
        </div>
      </div>

      {/* Price grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
        {[['Entry',tr.entry_price,t.text],['Exit',tr.exit_price,t.text],['Lot Size',tr.lot_size,t.text],
          ['Stop Loss',tr.sl,t.red],['Take Profit',tr.tp,t.accent],['R:R',`${tr.rr||0}R`,t.yellow]].map(([label,val,color])=>(
          <div key={label} style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>{label}</div>
            <div style={{ color, fontWeight:700, fontSize:15 }}>{val||'—'}</div>
          </div>
        ))}
      </div>

      {/* Meta row */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        {[['Setup',tr.setup,t.purple],['Emotion',tr.emotions,t.text],['Plan',tr.followed_plan?'✓ Followed':'✗ Deviated',tr.followed_plan?t.accent:t.red]].map(([label,val,color])=>(
          <div key={label} style={{ flex:1, minWidth:100, background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>{label}</div>
            <div style={{ color, fontWeight:600, fontSize:13 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tags */}
      {Array.isArray(tr.tags) && tr.tags.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Tags</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {tr.tags.map(tag => <span key={tag} style={{ fontSize:11, background:t.purpleDim, color:t.purple, padding:'3px 10px', borderRadius:5, border:`1px solid ${t.purple}20` }}>{tag}</span>)}
          </div>
        </div>
      )}

      {/* Chart images */}
      {Array.isArray(tr.chart_images) && tr.chart_images.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Chart Screenshots</div>
          <div style={{ display:'flex', gap:10 }}>
            {tr.chart_images.map((img,i) => (
              <div key={i} onClick={() => onLightbox(getImageUrl(tr.id,img))} style={{ position:'relative', cursor:'pointer', borderRadius:8, overflow:'hidden', border:`1px solid ${t.border}` }}>
                <img src={getImageUrl(tr.id,img)} alt={`Chart ${i+1}`} style={{ width:160, height:100, objectFit:'cover', display:'block' }}/>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'#00000080', color:'#fff', fontSize:9, padding:'3px 0', textAlign:'center' }}>
                  {i===0?'Before Entry':'After Exit'} · Click to enlarge
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mistakes */}
      {tr.mistakes && (
        <div style={{ background:t.yellowDim, border:`1px solid ${t.yellow}30`, borderRadius:8, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:9, color:t.yellow, letterSpacing:2, textTransform:'uppercase', marginBottom:5, fontWeight:700 }}>⚠ Mistakes / Deviations</div>
          <div style={{ color:t.text, fontSize:13, lineHeight:1.7 }}>{tr.mistakes}</div>
        </div>
      )}

      {/* Notes */}
      <div style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:12, marginBottom:16 }}>
        <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>📝 Notes & Analysis</div>
        <div style={{ color:t.text, fontSize:13, lineHeight:1.8, whiteSpace:'pre-wrap' }}>{tr.notes||'No notes added.'}</div>
      </div>

      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onEdit} style={{ flex:1, padding:'11px', background:`linear-gradient(135deg,${t.accent},#00b87d)`, border:'none', borderRadius:8, color:'#0c0e1a', fontFamily:'inherit', fontWeight:800, cursor:'pointer', fontSize:13 }}>✎ Edit Trade</button>
        <button onClick={onDelete} style={{ padding:'11px 18px', background:t.redDim, border:`1px solid ${t.red}30`, borderRadius:8, color:t.red, fontFamily:'inherit', cursor:'pointer', fontSize:13 }}>✕ Delete</button>
      </div>
    </div>
  );
}

const Sel = ({ value, onChange, options, label, t }) => (
  <select value={value} onChange={e=>onChange(e.target.value)} title={label} style={{ background:t.bgInput, border:`1px solid ${t.border}`, borderRadius:6, color:t.text, padding:'6px 8px', fontSize:11, fontFamily:'inherit', cursor:'pointer', flex:1, minWidth:55 }}>
    {options.map(o => <option key={o} value={o}>{o==='ALL'?`All ${label}s`:o}</option>)}
  </select>
);

const inp = (t) => ({ width:'100%', background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' });
const actionBtn = (t) => ({ background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted, padding:'4px 9px', borderRadius:5, cursor:'pointer', fontSize:11, fontFamily:'inherit' });
