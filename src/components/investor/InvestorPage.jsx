import { useState, useEffect } from 'react';
import { GRADE_COLORS, SESSION_COLORS } from '../../utils/constants.js';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090';

const pnlColor = (v) => Number(v) > 0 ? '#00e5a0' : Number(v) < 0 ? '#ff4d6d' : '#8a8fa8';

export default function InvestorPage({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!token) { setError('Invalid link'); setLoading(false); return; }
    fetch(`${PB_URL}/api/investor/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error||'Not found')))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(typeof e === 'string' ? e : 'Link not found or expired'); setLoading(false); });
  }, [token]);

  const dark = {
    bg:'#0c0e1a', bgCard:'#0e1120', border:'#1e2240', text:'#c8cde8',
    textMuted:'#8a8fa8', textStrong:'#e2e6ff', accent:'#00e5a0',
    red:'#ff4d6d', yellow:'#facc15', purple:'#818cf8',
  };
  const t = dark;

  if (loading) return (
    <div style={{ minHeight:'100vh', background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'JetBrains Mono',monospace" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, color:t.accent, marginBottom:12 }}>◈</div>
        <div style={{ color:t.textMuted, fontSize:12, letterSpacing:2 }}>LOADING...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:'100vh', background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'JetBrains Mono',monospace" }}>
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:16, padding:32, maxWidth:380, textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>◈</div>
        <div style={{ color:t.red, fontWeight:700, fontSize:16, marginBottom:8 }}>Link Unavailable</div>
        <div style={{ color:t.textMuted, fontSize:13 }}>{error}</div>
      </div>
    </div>
  );

  if (!data) return null;

  const trades = data.trades || [];
  const wins   = trades.filter(tr => Number(tr.pnl||0) > 0).length;
  const losses = trades.filter(tr => Number(tr.pnl||0) < 0).length;
  const totalPnl = trades.reduce((a,b) => a + Number(b.pnl||0), 0);
  const avgRR    = trades.length ? (trades.reduce((a,b) => a + Number(b.rr||0),0) / trades.length).toFixed(2) : '0.00';
  const winRate  = trades.length ? (wins / trades.length * 100).toFixed(1) : '0.0';

  return (
    <div style={{ minHeight:'100vh', background:t.bg, fontFamily:"'JetBrains Mono',monospace", color:t.text }}>
      {/* Header */}
      <div style={{ background:t.bgCard, borderBottom:`1px solid ${t.border}`, padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:22, color:t.accent }}>◈</span>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:900, color:t.accent, letterSpacing:4 }}>EDGE</div>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:5 }}>INVESTOR VIEW</div>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ color:t.textStrong, fontWeight:700, fontSize:14 }}>{data.display_name}</div>
          {data.label && <div style={{ color:t.textMuted, fontSize:11, marginTop:2 }}>{data.label}</div>}
          <div style={{ display:'inline-flex', gap:6, alignItems:'center', marginTop:4, background:'#ff4d6d15', border:'1px solid #ff4d6d40', borderRadius:20, padding:'3px 10px' }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:'#ff4d6d', display:'inline-block' }}/>
            <span style={{ fontSize:9, color:'#ff4d6d' }}>READ ONLY</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'20px 20px' }}>
        {/* KPI Row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Trades',    value:trades.length,   color:t.text },
            { label:'Win Rate',  value:`${winRate}%`,   color:t.accent },
            { label:'Wins/Loss', value:`${wins}W · ${losses}L`, color:t.text },
            { label:'Avg R:R',   value:`${avgRR}R`,     color:t.yellow },
            data.show_pnl
              ? { label:'Total P&L', value:`$${totalPnl.toFixed(2)}`, color:pnlColor(totalPnl) }
              : { label:'Total P&L', value:'Private',   color:t.textMuted },
          ].map(k => (
            <div key={k.label} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px', textAlign:'center' }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:k.color }}>{k.value}</div>
              <div style={{ fontSize:9, color:t.textMuted, letterSpacing:1, textTransform:'uppercase', marginTop:3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Trade table */}
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16, overflowX:'auto' }}>
          <div style={{ fontSize:10, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 }}>
            Trade History — {trades.length} trades
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>{['Date','Pair','Dir','Session','Setup','R:R','Pips', data.show_pnl&&'P&L', data.show_lots&&'Lots','Grade','Plan'].filter(Boolean).map(h =>
                <th key={h} style={{ color:t.textMuted, textAlign:'left', padding:'6px 10px', borderBottom:`1px solid ${t.border}`, fontSize:10, letterSpacing:1, textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
              )}</tr>
            </thead>
            <tbody>
              {trades.sort((a,b)=>new Date(b.trade_date)-new Date(a.trade_date)).map(tr => (
                <tr key={tr.id} style={{ borderBottom:`1px solid ${t.border}` }}>
                  <td style={{ padding:'8px 10px', color:t.textMuted }}>{tr.trade_date}</td>
                  <td style={{ padding:'8px 10px', color:t.textStrong, fontWeight:700 }}>{tr.pair}</td>
                  <td style={{ padding:'8px 10px', color:tr.direction==='LONG'?t.accent:t.red, fontWeight:700 }}>{tr.direction}</td>
                  <td style={{ padding:'8px 10px', color:SESSION_COLORS[tr.session]||t.textMuted }}>{tr.session}</td>
                  <td style={{ padding:'8px 10px', color:t.purple }}>{tr.setup}</td>
                  <td style={{ padding:'8px 10px', color:t.yellow }}>{tr.rr}R</td>
                  <td style={{ padding:'8px 10px', color:pnlColor(tr.pips) }}>{Number(tr.pips||0)>0?'+':''}{tr.pips}</td>
                  {data.show_pnl  && <td style={{ padding:'8px 10px', color:pnlColor(tr.pnl), fontWeight:700 }}>{Number(tr.pnl||0)>0?'+':''}${tr.pnl}</td>}
                  {data.show_lots && <td style={{ padding:'8px 10px', color:t.text }}>{tr.lot_size}</td>}
                  <td style={{ padding:'8px 10px', color:GRADE_COLORS[tr.grade]||t.textMuted, fontWeight:700 }}>{tr.grade}</td>
                  <td style={{ padding:'8px 10px', color:tr.followed_plan?t.accent:t.red }}>{tr.followed_plan?'✓':'✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign:'center', marginTop:20, color:t.textMuted, fontSize:10 }}>
          Powered by EDGE Journal · Read-only investor view · Data accuracy not guaranteed
        </div>
      </div>
    </div>
  );
}
