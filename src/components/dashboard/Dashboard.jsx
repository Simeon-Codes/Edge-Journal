import { useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { GRADE_COLORS, SESSION_COLORS } from '../../utils/constants.js';
import AdSlot from '../shared/AdSlot.jsx';

const pnlColor = (v, t) => Number(v) > 0 ? t.accent : Number(v) < 0 ? t.red : t.textMuted;

export default function Dashboard({ trades, stats, onEdit }) {
  const { theme: t } = useTheme();

  const equityData = useMemo(() => {
    let running = 0;
    return [...trades]
      .sort((a,b) => new Date(a.trade_date+'T'+(a.trade_time||'00:00')) - new Date(b.trade_date+'T'+(b.trade_time||'00:00')))
      .map((tr, i) => {
        running += Number(tr.pnl||0);
        return { name:`T${i+1}`, equity: parseFloat(running.toFixed(2)), pnl: Number(tr.pnl||0), date: tr.trade_date };
      });
  }, [trades]);

  const dayData = useMemo(() => {
    const days = {Mon:{pnl:0,count:0},Tue:{pnl:0,count:0},Wed:{pnl:0,count:0},Thu:{pnl:0,count:0},Fri:{pnl:0,count:0}};
    trades.forEach(tr => {
      const d = new Date(tr.trade_date).toLocaleDateString('en',{weekday:'short'});
      if (days[d]) { days[d].pnl += Number(tr.pnl||0); days[d].count++; }
    });
    return Object.entries(days).map(([day,v]) => ({ day, pnl: parseFloat(v.pnl.toFixed(2)), count: v.count }));
  }, [trades]);

  const setupData = useMemo(() => {
    const map = {};
    trades.forEach(tr => {
      if (!map[tr.setup]) map[tr.setup] = {pnl:0,count:0,wins:0};
      map[tr.setup].pnl += Number(tr.pnl||0);
      map[tr.setup].count++;
      if (Number(tr.pnl||0) > 0) map[tr.setup].wins++;
    });
    return Object.entries(map).sort((a,b)=>b[1].pnl-a[1].pnl).slice(0,7)
      .map(([setup,v]) => ({ setup, pnl: parseFloat(v.pnl.toFixed(2)), count: v.count, wr: Math.round(v.wins/v.count*100) }));
  }, [trades]);

  const sessionData = useMemo(() => {
    const map = {};
    trades.forEach(tr => {
      if (!map[tr.session]) map[tr.session] = {pnl:0,count:0,wins:0};
      map[tr.session].pnl += Number(tr.pnl||0);
      map[tr.session].count++;
      if (Number(tr.pnl||0) > 0) map[tr.session].wins++;
    });
    return Object.entries(map).sort((a,b)=>b[1].pnl-a[1].pnl);
  }, [trades]);

  const emotionData = useMemo(() => {
    const map = {};
    trades.forEach(tr => {
      if (!map[tr.emotions]) map[tr.emotions] = {pnl:0,count:0};
      map[tr.emotions].pnl += Number(tr.pnl||0);
      map[tr.emotions].count++;
    });
    return Object.entries(map).sort((a,b)=>b[1].pnl-a[1].pnl).slice(0,5);
  }, [trades]);

  const recent = useMemo(() => trades.slice(0,8), [trades]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
        <div style={{ color: t.textMuted }}>{payload[0]?.payload?.date || payload[0]?.payload?.name}</div>
        <div style={{ color: pnlColor(payload[0]?.value, t), fontWeight: 700 }}>${payload[0]?.value}</div>
      </div>
    );
  };

  if (!trades.length) return <EmptyState t={t} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* KPI Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12 }}>
        {[
          { label:'Total P&L',    value:`$${stats.totalPnl}`,     color: pnlColor(stats.totalPnl,t),  sub:`${stats.totalTrades} trades` },
          { label:'Win Rate',     value:`${stats.winRate}%`,       color: t.accent,  sub:`${stats.wins}W · ${stats.losses}L` },
          { label:'Avg R:R',      value:`${stats.avgRR}R`,         color: t.yellow,  sub:'Per trade' },
          { label:'Profit Factor',value: stats.profitFactor,       color: t.purple,  sub:'Gross P/L' },
          { label:'Plan Rate',    value:`${stats.planFollowRate}%`,color: t.orange,  sub:'Followed plan' },
          { label:'Best Trade',   value:`$${stats.bestTrade}`,     color: t.accent,  sub:'Single trade' },
        ].map(k => (
          <div key={k.label} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px', textAlign:'center' }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:t.text, letterSpacing:1, textTransform:'uppercase', marginTop:3 }}>{k.label}</div>
            <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Equity + Day bars */}
      <div style={{ display:'flex', gap:16 }}>
        <div style={{ flex:3, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
          <div style={sectionTitle(t)}>Equity Curve</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={equityData} margin={{top:5,right:5,left:0,bottom:0}}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.accent} stopOpacity={0.3}/>
                  <stop offset="100%" stopColor={t.accent} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" hide/>
              <YAxis hide/>
              <Tooltip content={<CustomTooltip/>}/>
              <Area type="monotone" dataKey="equity" stroke={t.accent} strokeWidth={2} fill="url(#eqGrad)" dot={false} activeDot={{r:4,fill:t.accent}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex:2, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
          <div style={sectionTitle(t)}>Best Days</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dayData} margin={{top:5,right:5,left:0,bottom:0}}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:t.textMuted}} axisLine={false} tickLine={false}/>
              <YAxis hide/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="pnl" radius={[4,4,0,0]} isAnimationActive={false}
                shape={(props) => {
                  const {x,y,width,height,value} = props;
                  return <rect x={x} y={y} width={width} height={Math.abs(height||0)} fill={value>=0?t.accent:t.red} fillOpacity={0.8} rx={3}/>;
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Setups + Session + Emotion */}
      <div style={{ display:'flex', gap:16 }}>
        <div style={{ flex:2, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
          <div style={sectionTitle(t)}>Setup Performance</div>
          {setupData.map(d => {
            const max = Math.max(...setupData.map(x=>Math.abs(x.pnl)),1);
            return (
              <div key={d.setup} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ color:t.text, fontSize:11, width:130, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.setup}</span>
                <div style={{ flex:1, height:6, background:t.bgHover, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.abs(d.pnl)/max*100}%`, background:d.pnl>=0?t.accent:t.red, borderRadius:3, transition:'width 0.4s' }}/>
                </div>
                <span style={{ color:pnlColor(d.pnl,t), fontSize:11, fontWeight:700, width:55, textAlign:'right' }}>${d.pnl.toFixed(0)}</span>
                <span style={{ color:t.textMuted, fontSize:10, width:50, textAlign:'right' }}>{d.count}x {d.wr}%</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
            <div style={sectionTitle(t)}>Sessions</div>
            {sessionData.map(([session,d]) => (
              <div key={session} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:SESSION_COLORS[session]||t.textMuted, flexShrink:0, display:'inline-block' }}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:t.text, fontSize:11 }}>{session}</span>
                    <span style={{ color:pnlColor(d.pnl,t), fontSize:11, fontWeight:700 }}>${d.pnl.toFixed(0)}</span>
                  </div>
                  <div style={{ color:t.textMuted, fontSize:10 }}>{d.count} trades · {Math.round(d.wins/d.count*100)}% WR</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
            <div style={sectionTitle(t)}>Emotions vs P&L</div>
            {emotionData.map(([emo,d]) => (
              <div key={emo} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:10, color:t.textMuted, width:85, flexShrink:0 }}>{emo}</span>
                <div style={{ flex:1, height:6, background:t.bgHover, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(100,Math.abs(d.pnl)/3+20)}%`, background:d.pnl>=0?t.accent:t.red, borderRadius:3 }}/>
                </div>
                <span style={{ color:pnlColor(d.pnl,t), fontSize:11, fontWeight:700, width:50, textAlign:'right' }}>${d.pnl.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent trades table */}
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
        <div style={sectionTitle(t)}>Recent Trades</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>{['Date','Pair','Dir','Session','Setup','R:R','Pips','P&L','Grade','Plan'].map(h=>
                <th key={h} style={{ color:t.textMuted, textAlign:'left', padding:'6px 10px', borderBottom:`1px solid ${t.border}`, fontSize:10, letterSpacing:1, textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
              )}</tr>
            </thead>
            <tbody>
              {recent.map(tr => (
                <tr key={tr.id} onClick={()=>onEdit(tr)} style={{ cursor:'pointer', borderBottom:`1px solid ${t.border}` }}>
                  <td style={{ padding:'9px 10px', color:t.textMuted, fontSize:12 }}>{tr.trade_date}</td>
                  <td style={{ padding:'9px 10px', color:t.textStrong, fontWeight:700, fontSize:12 }}>{tr.pair}</td>
                  <td style={{ padding:'9px 10px', color:tr.direction==='LONG'?t.accent:t.red, fontWeight:700, fontSize:12 }}>{tr.direction}</td>
                  <td style={{ padding:'9px 10px', color:SESSION_COLORS[tr.session]||t.textMuted, fontSize:12 }}>{tr.session}</td>
                  <td style={{ padding:'9px 10px', color:t.purple, fontSize:12 }}>{tr.setup}</td>
                  <td style={{ padding:'9px 10px', color:t.yellow, fontSize:12 }}>{tr.rr}R</td>
                  <td style={{ padding:'9px 10px', color:pnlColor(tr.pips,t), fontSize:12 }}>{Number(tr.pips||0)>0?'+':''}{tr.pips}</td>
                  <td style={{ padding:'9px 10px', color:pnlColor(tr.pnl,t), fontWeight:700, fontSize:12 }}>{Number(tr.pnl||0)>0?'+':''}${tr.pnl}</td>
                  <td style={{ padding:'9px 10px', color:GRADE_COLORS[tr.grade]||t.textMuted, fontWeight:700, fontSize:12 }}>{tr.grade}</td>
                  <td style={{ padding:'9px 10px', color:tr.followed_plan?t.accent:t.red, fontSize:14 }}>{tr.followed_plan?'✓':'✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const sectionTitle = (t) => ({ fontSize:10, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 });
const EmptyState = ({t}) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:12 }}>
    <div style={{ fontSize:56, color:t.border }}>◈</div>
    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, color:t.textDim, fontWeight:800 }}>No trades yet</div>
    <div style={{ color:t.textMuted, fontSize:13, textAlign:'center', maxWidth:320, lineHeight:1.7 }}>Click "Log Trade" to record your first trade and start building your edge data.</div>
  </div>
);
