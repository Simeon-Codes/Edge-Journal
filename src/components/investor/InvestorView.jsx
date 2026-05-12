import { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { InvestorLinks } from '../../services/pb.js';

export default function InvestorView() {
  const { theme: t } = useTheme();
  const [links, setLinks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm]     = useState({ label:'', showPnl:true, showLotSize:false });

  useEffect(() => {
    InvestorLinks.list().then(d => { setLinks(d.items||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.label) return;
    setCreating(true);
    try {
      await InvestorLinks.create(form);
      const d = await InvestorLinks.list();
      setLinks(d.items||[]);
      setForm({ label:'', showPnl:true, showLotSize:false });
    } catch {}
    setCreating(false);
  };

  const copy = (text, id) => {
    navigator.clipboard.writeText(text).then(()=>{ setCopied(id); setTimeout(()=>setCopied(''),2000); });
  };

  const inp = { width:'100%', background:t.bgInput, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 12px', color:t.text, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:18, marginBottom:16 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800, color:t.textStrong, marginBottom:6 }}>Investor View Links</div>
        <div style={{ color:t.textMuted, fontSize:12, lineHeight:1.7, marginBottom:16 }}>
          Generate read-only links to share your trading performance with investors, followers, or prop firm evaluators. They can see your stats without accessing your account.
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>Link Label</div>
            <input style={inp} placeholder="e.g. Q2 2025 Performance — Prop Firm" value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))}/>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            <Toggle label="Show P&L values" checked={form.showPnl} onChange={v=>setForm(f=>({...f,showPnl:v}))} t={t}/>
            <Toggle label="Show Lot Sizes" checked={form.showLotSize} onChange={v=>setForm(f=>({...f,showLotSize:v}))} t={t}/>
          </div>
        </div>

        <button onClick={handleCreate} disabled={creating||!form.label} style={{ padding:'11px 20px', background:creating||!form.label?t.textMuted:`linear-gradient(135deg,${t.accent},#00b87d)`, border:'none', borderRadius:8, color:'#0c0e1a', fontFamily:'inherit', fontWeight:800, fontSize:13, cursor:creating||!form.label?'not-allowed':'pointer' }}>
          {creating ? 'Generating...' : 'Generate Investor Link'}
        </button>
      </div>

      {/* Links list */}
      {!loading && links.length === 0 && (
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:20, textAlign:'center', color:t.textMuted, fontSize:13 }}>
          No investor links yet. Create one above.
        </div>
      )}

      {links.map(link => (
        <div key={link.id} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16, marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
            <div>
              <div style={{ color:t.textStrong, fontWeight:700, fontSize:14 }}>{link.label||'Unnamed Link'}</div>
              <div style={{ color:t.textMuted, fontSize:11, marginTop:3 }}>
                {link.views||0} views · {link.show_pnl?'P&L visible':'P&L hidden'} · {link.show_lot_size?'Lots visible':'Lots hidden'}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ fontSize:10, padding:'3px 9px', borderRadius:10, background:link.is_active?t.accentDim:t.redDim, color:link.is_active?t.accent:t.red, border:`1px solid ${link.is_active?t.accentBorder:t.red+'40'}` }}>
                {link.is_active?'Active':'Inactive'}
              </span>
              <button onClick={()=>InvestorLinks.toggle(link.id,!link.is_active).then(()=>InvestorLinks.list().then(d=>setLinks(d.items||[])))} style={{ fontSize:11, padding:'4px 10px', background:t.bgHover, border:`1px solid ${t.border}`, borderRadius:6, color:t.textMuted, cursor:'pointer', fontFamily:'inherit' }}>
                {link.is_active?'Disable':'Enable'}
              </button>
              <button onClick={()=>InvestorLinks.delete(link.id).then(()=>setLinks(prev=>prev.filter(l=>l.id!==link.id)))} style={{ fontSize:11, padding:'4px 10px', background:t.redDim, border:`1px solid ${t.red}30`, borderRadius:6, color:t.red, cursor:'pointer', fontFamily:'inherit' }}>
                Delete
              </button>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ flex:1, background:t.bg, border:`1px solid ${t.border}`, borderRadius:8, padding:'9px 12px', fontSize:11, color:t.textMuted, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {InvestorLinks.getShareUrl(link.token)}
            </div>
            <button onClick={()=>copy(InvestorLinks.getShareUrl(link.token),link.id)} style={{ padding:'9px 16px', background:copied===link.id?t.accentDim:`linear-gradient(135deg,${t.accent},#00b87d)`, border:'none', borderRadius:8, color:copied===link.id?t.accent:'#0c0e1a', fontFamily:'inherit', fontWeight:800, fontSize:12, cursor:'pointer', flexShrink:0 }}>
              {copied===link.id?'✓ Copied':'Copy Link'}
            </button>
          </div>
          {link.last_viewed && <div style={{ fontSize:10, color:t.textDim, marginTop:6 }}>Last viewed: {new Date(link.last_viewed).toLocaleString()}</div>}
        </div>
      ))}
    </div>
  );
}

const Toggle = ({ label, checked, onChange, t }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
    <div onClick={()=>onChange(!checked)} style={{ width:38, height:20, borderRadius:10, background:checked?t.accent:t.border, cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
      <div style={{ position:'absolute', top:2, left:checked?20:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }}/>
    </div>
    <span style={{ fontSize:12, color:t.text }}>{label}</span>
  </div>
);
