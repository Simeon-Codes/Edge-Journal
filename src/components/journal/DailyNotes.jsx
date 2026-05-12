// DailyNotes.jsx
import { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { JournalEntries } from '../../services/pb.js';

export function DailyNotes() {
  const { theme: t } = useTheme();
  const [entries, setEntries] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0,10), title:'', content:'', market_bias:'', mood:7, tags:[] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    JournalEntries.list().then(d => setEntries(d.items||[])).catch(()=>{});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await JournalEntries.upsert({ ...form, id: editing?.id });
      if (editing) setEntries(prev => prev.map(e => e.id === saved.id ? saved : e));
      else setEntries(prev => [saved, ...prev]);
      setEditing(null);
      setForm({ entry_date: new Date().toISOString().slice(0,10), title:'', content:'', market_bias:'', mood:7, tags:[] });
    } catch {}
    setSaving(false);
  };

  const inp = { width:'100%', background:t.bgInput, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 12px', color:t.text, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ display:'flex', gap:16, maxWidth:900 }}>
      <div style={{ flex:1 }}>
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:10, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:14, fontWeight:700 }}>{editing ? 'Edit Entry' : 'New Daily Entry'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div><div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>Date</div><input style={inp} type="date" value={form.entry_date} onChange={e=>setForm(f=>({...f,entry_date:e.target.value}))}/></div>
            <div><div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>Market Bias</div>
              <select style={inp} value={form.market_bias} onChange={e=>setForm(f=>({...f,market_bias:e.target.value}))}>
                <option value="">— Select —</option>
                {['bullish','bearish','neutral','ranging'].map(b=><option key={b} value={b}>{b.charAt(0).toUpperCase()+b.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:10 }}><div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>Title</div><input style={inp} placeholder="e.g. London Kill Zone — Bearish Bias" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
          <div style={{ marginBottom:10 }}><div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>Notes</div><textarea style={{...inp,minHeight:120,resize:'vertical',lineHeight:1.7}} placeholder="Market observations, pre-market analysis, lessons learned..." value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))}/></div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>Mood ({form.mood}/10)</div>
            <input type="range" min={1} max={10} value={form.mood} onChange={e=>setForm(f=>({...f,mood:Number(e.target.value)}))} style={{ width:'100%', accentColor:t.accent }}/>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save} disabled={saving} style={{ flex:1, padding:'11px', background:`linear-gradient(135deg,${t.accent},#00b87d)`, border:'none', borderRadius:8, color:'#0c0e1a', fontFamily:'inherit', fontWeight:800, fontSize:13, cursor:'pointer' }}>{saving?'Saving...':'Save Entry'}</button>
            {editing && <button onClick={()=>{setEditing(null);setForm({entry_date:new Date().toISOString().slice(0,10),title:'',content:'',market_bias:'',mood:7,tags:[]});}} style={{ padding:'11px 16px', background:'transparent', border:`1px solid ${t.border}`, borderRadius:8, color:t.textMuted, fontFamily:'inherit', cursor:'pointer' }}>Cancel</button>}
          </div>
        </div>
      </div>
      <div style={{ flex:'0 0 280px', display:'flex', flexDirection:'column', gap:10, overflowY:'auto', maxHeight:'calc(100vh-130px)' }}>
        <div style={{ fontSize:10, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', fontWeight:700 }}>Past Entries</div>
        {entries.map(e=>(
          <div key={e.id} onClick={()=>{setEditing(e);setForm({entry_date:e.entry_date?.slice(0,10)||'',title:e.title||'',content:e.content||'',market_bias:e.market_bias||'',mood:e.mood||7,tags:e.tags||[]});}} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:12, cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:t.textStrong, fontSize:13, fontWeight:700 }}>{e.entry_date?.slice(0,10)}</span>
              {e.market_bias && <span style={{ fontSize:10, color:e.market_bias==='bullish'?t.accent:e.market_bias==='bearish'?t.red:t.yellow, background:t.bgHover, padding:'2px 7px', borderRadius:4 }}>{e.market_bias}</span>}
            </div>
            {e.title && <div style={{ color:t.text, fontSize:12, marginTop:4 }}>{e.title}</div>}
            {e.content && <div style={{ color:t.textMuted, fontSize:11, marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.content}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DailyNotes;
