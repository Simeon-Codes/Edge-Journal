// MT5View.jsx
import { useTheme } from '../../contexts/ThemeContext.jsx';

export default function MT5View() {
  const { theme: t } = useTheme();
  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:t.textStrong, marginBottom:6 }}>MT5 Terminal Sync</div>
        <div style={{ color:t.textMuted, fontSize:13, lineHeight:1.7, marginBottom:16 }}>
          Connect your MetaTrader 5 terminal using the EDGE Journal Expert Advisor. Once installed, all trades are automatically imported and synced in real time.
        </div>
        <div style={{ background:t.purpleDim, border:`1px solid ${t.purple}30`, borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:11, color:t.purple, fontWeight:700, marginBottom:8 }}>📋 Setup Instructions</div>
          <ol style={{ fontSize:12, color:t.text, lineHeight:2.2, paddingLeft:20 }}>
            <li>Go to <strong>Settings → MT5 Sync</strong> and create a new MT5 account to generate your API key</li>
            <li>Download the <strong>EDGE_Journal_EA.mq5</strong> file from the download link below</li>
            <li>In MT5: open <strong>File → Open Data Folder → MQL5 → Experts</strong></li>
            <li>Copy the EA file into that folder and compile it in MetaEditor (F7)</li>
            <li>In MT5: <strong>Tools → Options → Expert Advisors</strong> → enable WebRequest and add your server URL</li>
            <li>Attach the EA to any chart, enter your <strong>Server URL</strong> and <strong>API Key</strong></li>
            <li>Click <strong>Allow Algo Trading</strong> in the MT5 toolbar</li>
            <li>On first attach, confirm the historical trade import when prompted</li>
          </ol>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <a href="/EDGE_Journal_EA.mq5" download style={{ flex:1, padding:'11px', background:`linear-gradient(135deg,${t.accent},#00b87d)`, border:'none', borderRadius:8, color:'#0c0e1a', fontFamily:'inherit', fontWeight:800, fontSize:13, cursor:'pointer', textDecoration:'none', textAlign:'center', display:'block' }}>
            ⬇ Download EDGE_Journal_EA.mq5
          </a>
          <button onClick={()=>window.open('https://www.metatrader5.com/en/terminal','_blank')} style={{ padding:'11px 16px', background:'transparent', border:`1px solid ${t.border}`, borderRadius:8, color:t.textMuted, fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>
            Get MT5
          </button>
        </div>
      </div>
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:12, padding:16 }}>
        <div style={{ fontSize:10, color:t.textMuted, letterSpacing:2, textTransform:'uppercase', marginBottom:12, fontWeight:700 }}>MetaApi Integration (Coming Soon)</div>
        <div style={{ color:t.textMuted, fontSize:12, lineHeight:1.7 }}>
          For brokers that restrict EA WebRequest, we'll support MetaApi as an alternative bridge. This allows cloud-based MT5 connection without installing an EA. Available in a future update.
        </div>
      </div>
    </div>
  );
}
