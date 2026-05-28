// Analytics.jsx
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { GRADE_COLORS } from '../../utils/constants.js';
import AICoach from './AICoach.jsx';

const pnlColor = (v, t) => Number(v) > 0 ? t.accent : Number(v) < 0 ? t.red : t.textMuted;
const st = (t) => ({ fontSize:10, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:14, fontWeight:700 });

export function Analytics({ trades, stats }) {
  const { theme: t } = useTheme();
  const [tab, setTab] = useState('charts');

  const monthlyData = useMemo(() => {
    const map = {};
    trades.forEach(tr => {
      const key = (tr.trade_date||'').slice(0,7);
      if (!key) return;
      if (!map[key]) map[key] = { month:key, pnl:0, count:0, wins:0 };
      map[key].pnl += Number(tr.pnl||0);
      map[key].count++;
      if (Number(tr.pnl||0) > 0) map[key].wins++;
    });
    return Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)).map(d=>({...d,pnl:parseFloat(d.pnl.toFixed(2))}));
  }, [trades]);

  const pairData = useMemo(() => {
    const map = {};
    trades.forEach(tr => {
      if (!map[tr.pair]) map[tr.pair] = { pnl:0, count:0, wins:0 };
      map[tr.pair].pnl += Number(tr.pnl||0);
      map[tr.pair].count++;
      if (Number(tr.pnl||0) > 0) map[tr.pair].wins++;
    });
    return Object.entries(map).sort((a,b)=>b[1].pnl-a[1].pnl).map(([pair,v])=>({ pair, pnl:parseFloat(v.pnl.toFixed(2)), count:v.count, wr:Math.round(v.wins/v.count*100) }));
  }, [trades]);

  const gradeData = useMemo(() =>
    Object.entries(GRADE_COLORS).map(([grade,color]) => ({
      grade, color,
      count: trades.filter(tr=>tr.grade===grade).length,
      pnl:   trades.filter(tr=>tr.grade===grade).reduce((a,b)=>a+Number(b.pnl||0),0),
    })).filter(d=>d.count>0),
  [trades]);

  const planData = useMemo(() => {
    const f = trades.filter(tr=>tr.followed_plan);
    const d = trades.filter(tr=>!tr.followed_plan);
    return [
      { name:'Followed', value:f.length, pnl:f.reduce((a,b)=>a+Number(b.pnl||0),0), color:t.accent },
      { name:'Deviated', value:d.length, pnl:d.reduce((a,b)=>a+Number(b.pnl||0),0), color:t.red },
    ];
  }, [trades, t]);

  // Tooltip for recharts
  const TT = ({ active, payload }) => {
    if (!active||!payload?.length) return null;
    return (
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 12px', fontSize:11 }}>
        <div style={{ color:pnlColor(payload[0]?.value,t), fontWeight:700 }}>${payload[0]?.value}</div>
      </div>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── Tab bar — always visible regardless of trade count ── */}
      <div style={{ display:'flex', gap:6, borderBottom:`1px solid ${t.border}`, paddingBottom:12 }}>
        {[['charts','📊 Analytics'],['ai-coach','🧠 AI Coach']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding:'7px 16px', fontSize:12, fontFamily:'inherit', cursor:'pointer',
            borderRadius:8, fontWeight: tab===id ? 700 : 400,
            background: tab===id ? t.accentDim : 'transparent',
            border: `1px solid ${tab===id ? t.accentBorder : 'transparent'}`,
            color: tab===id ? t.accent : t.textMuted,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── AI Coach tab ── */}
      {tab === 'ai-coach' && <AICoach trades={trades} />}

      {/* ── Charts tab ── */}
      {tab === 'charts' && (
        !trades.length
          ? <div style={{ color:t.textMuted, textAlign:'center', padding:60 }}>Log trades to see analytics</div>
          : <>
              {/* Summary stats strip */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12 }}>
                {[
                  ['Profit Factor', stats.profitFactor, t.accent],
                  ['Gross Profit',  `$${stats.grossProfit}`, t.accent],
                  ['Gross Loss',    `$${stats.grossLoss}`, t.red],
                  ['Avg Win',       `$${trades.filter(tr=>tr.pnl>0).length ? (Number(stats.grossProfit)/trades.filter(tr=>tr.pnl>0).length).toFixed(2) : '0'}`, t.accent],
                  ['Avg Loss',      `$${trades.filter(tr=>tr.pnl<0).length ? (Number(stats.grossLoss)/trades.filter(tr=>tr.pnl<0).length).toFixed(2) : '0'}`, t.red],
                  ['Expectancy',    `$${(Number(stats.totalPnl)/(stats.totalTrades||1)).toFixed(2)}`, pnlColor(stats.totalPnl,t)],
                ].map(([label,value,color]) => (
                  <div key={label} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px', textAlign:'center' }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color }}>{value}</div>
                    <div style={{ fontSize:9, color:t.textMuted, letterSpacing:1, textTransform:'uppercase', marginTop:3 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:16 }}>
                {/* Monthly P&L */}
                <div style={{ flex:3, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
                  <div style={st(t)}>Monthly P&L</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlyData} margin={{top:5,right:5,left:0,bottom:5}}>
                      <XAxis dataKey="month" tick={{fontSize:10,fill:t.textMuted}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:t.textMuted}} axisLine={false} tickLine={false} width={55} tickFormatter={v=>`$${v}`}/>
                      <Tooltip content={<TT/>}/>
                      <Bar dataKey="pnl" radius={[4,4,0,0]} isAnimationActive={false}
                        shape={(props)=>{const{x,y,width,height,value}=props;return<rect x={x} y={y} width={width} height={Math.abs(height||0)} fill={value>=0?t.accent:t.red} fillOpacity={0.8} rx={3}/>;}}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Plan adherence */}
                <div style={{ flex:1, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
                  <div style={st(t)}>Plan Adherence</div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                    <PieChart width={130} height={130}>
                      <Pie data={planData} cx={60} cy={60} innerRadius={38} outerRadius={55} dataKey="value" strokeWidth={0}>
                        {planData.map((e,i)=><Cell key={i} fill={e.color} fillOpacity={0.85}/>)}
                      </Pie>
                      <Tooltip contentStyle={{background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:8,fontSize:11}}/>
                    </PieChart>
                    {planData.map(d=>(
                      <div key={d.name} style={{ display:'flex', justifyContent:'space-between', width:'100%', alignItems:'center' }}>
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:d.color, display:'inline-block' }}/>
                          <span style={{ fontSize:11, color:t.text }}>{d.name}</span>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ color:d.color, fontWeight:700, fontSize:12 }}>${d.pnl.toFixed(2)}</div>
                          <div style={{ color:t.textMuted, fontSize:10 }}>{d.value} trades</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:16 }}>
                {/* Pair performance */}
                <div style={{ flex:2, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
                  <div style={st(t)}>Performance by Pair</div>
                  {pairData.map(d => {
                    const max = Math.max(...pairData.map(x=>Math.abs(x.pnl)),1);
                    return (
                      <div key={d.pair} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                        <span style={{ color:t.text, fontSize:12, width:65, flexShrink:0 }}>{d.pair}</span>
                        <div style={{ flex:1, height:8, background:t.bgHover, borderRadius:4, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${Math.abs(d.pnl)/max*100}%`, background:d.pnl>=0?t.accent:t.red, borderRadius:4 }}/>
                        </div>
                        <span style={{ color:pnlColor(d.pnl,t), fontWeight:700, fontSize:12, width:65, textAlign:'right' }}>${d.pnl.toFixed(0)}</span>
                        <span style={{ color:t.textMuted, fontSize:10, width:55, textAlign:'right' }}>{d.count}x {d.wr}%WR</span>
                      </div>
                    );
                  })}
                </div>
                {/* Grade distribution */}
                <div style={{ flex:1, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
                  <div style={st(t)}>Trade Quality Grades</div>
                  {gradeData.map(d=>(
                    <div key={d.grade} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <span style={{ color:d.color, fontWeight:800, fontSize:15, width:24 }}>{d.grade}</span>
                      <div style={{ flex:1, height:10, background:t.bgHover, borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${d.count/trades.length*100}%`, background:d.color, borderRadius:4, opacity:0.85 }}/>
                      </div>
                      <span style={{ color:t.textMuted, fontSize:11, width:40, textAlign:'right' }}>{d.count}</span>
                      <span style={{ color:pnlColor(d.pnl,t), fontSize:11, width:55, textAlign:'right', fontWeight:700 }}>${d.pnl.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
      )}
    </div>
  );
}

export default Analytics;
