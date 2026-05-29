import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import { useTheme } from './contexts/ThemeContext.jsx';
import { useNotify } from './contexts/ToastContext.jsx';
import { useTrades } from './hooks/useTrades.js';
import AuthScreen from './components/auth/AuthScreen.jsx';
import Sidebar from './components/shared/Sidebar.jsx';
import AdSlot from './components/shared/AdSlot.jsx';
import TradeForm from './components/journal/TradeForm.jsx';

const Dashboard    = lazy(() => import('./components/dashboard/Dashboard.jsx'));
const TradeLog     = lazy(() => import('./components/journal/TradeLog.jsx'));
const Analytics    = lazy(() => import('./components/analytics/Analytics.jsx'));
const Playbook     = lazy(() => import('./components/playbook/Playbook.jsx'));
const Settings     = lazy(() => import('./components/settings/Settings.jsx'));
const DailyNotes   = lazy(() => import('./components/journal/DailyNotes.jsx'));
const MT5View      = lazy(() => import('./components/mt5/MT5View.jsx'));
const InvestorView = lazy(() => import('./components/investor/InvestorView.jsx'));

const VIEW_TITLES = {
  dashboard:'Dashboard', journal:'Trade Log', analytics:'Analytics',
  playbook:'ICT Playbook', daily:'Daily Journal', mt5:'MT5 Sync',
  investor:'Investor View', settings:'Settings',
};

export default function App() {
  const { user, loading, profileLoading } = useAuth();
  const { theme: t }         = useTheme();
  const notify               = useNotify();
  const { trades, stats, addTrade, editTrade, removeTrade, uploadImages, getImageUrl } = useTrades();

  const [view, setView]               = useState('dashboard');
  const [collapsed, setCollapsed]     = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // PWA install prompt
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  // Service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // "new-trade" shortcut from sidebar
  useEffect(() => {
    if (view === 'new-trade') { setEditingTrade(null); setShowForm(true); setView('journal'); }
  }, [view]);

  // Handle PWA shortcut ?action=new-trade
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new-trade') { setShowForm(true); window.history.replaceState({}, '', '/'); }
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') { setInstallPrompt(null); setShowInstallBanner(false); }
  };

  const openEdit = (trade) => { setEditingTrade(trade); setShowForm(true); };

  const handleSaveTrade = async (data) => {
    try {
      if (editingTrade) {
        await editTrade(editingTrade.id, data);
        notify.success('Trade updated successfully');
      } else {
        const saved = await addTrade(data);
        notify.success('Trade logged successfully');
        return saved;
      }
    } catch (e) {
      notify.error(e.message);
      throw e; // re-throw so TradeForm keeps modal open
    }
  };

  const handleDelete = async (id) => {
    try {
      await removeTrade(id);
      notify.success('Trade deleted');
    } catch (e) {
      notify.error('Failed to delete trade');
    }
  };

  if (loading || profileLoading) return <Splash t={t} />;
  if (!user)   return <AuthScreen />;

  return (
    <div style={{ display:'flex', height:'100vh', background:t.bg, fontFamily:"'JetBrains Mono',monospace", color:t.text, overflow:'hidden' }}>

      <Sidebar view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} stats={stats} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Top bar */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', borderBottom:`1px solid ${t.border}`, flexShrink:0, background:t.bgCard, gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            {collapsed && (
              <button onClick={() => setCollapsed(false)} style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:6, color:t.textMuted, cursor:'pointer', padding:'5px 8px', fontSize:14, flexShrink:0 }}>☰</button>
            )}
            <div style={{ minWidth:0 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:t.textStrong, letterSpacing:0.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {VIEW_TITLES[view] || 'EDGE Journal'}
              </div>
              <div style={{ fontSize:9, color:t.textMuted, letterSpacing:2, textTransform:'uppercase' }}>ICT Smart Money</div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
            {showInstallBanner && (
              <button onClick={handleInstall} style={{ padding:'6px 12px', background:t.purpleDim, border:`1px solid ${t.purple}40`, borderRadius:7, color:t.purple, fontFamily:'inherit', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                ⬇ Install
              </button>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:t.accent, background:t.accentDim, border:`1px solid ${t.accentBorder}`, borderRadius:20, padding:'4px 10px' }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:t.accent, display:'inline-block', boxShadow:`0 0 5px ${t.accent}` }}/>
              Live
            </div>
            <button onClick={() => { setEditingTrade(null); setShowForm(true); }}
              style={{ padding:'8px 14px', background:`linear-gradient(135deg,${t.accent},#00b87d)`, border:'none', borderRadius:8, color:'#0c0e1a', fontFamily:'inherit', fontWeight:800, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
              + Log Trade
            </button>
          </div>
        </div>

        {/* Ad slot — leaderboard (free tier only) */}
        <AdSlot slot="leaderboard" />

        {/* View area */}
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <Suspense fallback={<Loading t={t} />}>
            {view === 'dashboard'  && <Dashboard  trades={trades} stats={stats} onEdit={openEdit} />}
            {view === 'journal'    && <TradeLog   trades={trades} onEdit={openEdit} onDelete={handleDelete} getImageUrl={getImageUrl} />}
            {view === 'analytics'  && <Analytics  trades={trades} stats={stats} />}
            {view === 'playbook'   && <Playbook />}
            {view === 'daily'      && <DailyNotes />}
            {view === 'mt5'        && <MT5View />}
            {view === 'investor'   && <InvestorView />}
            {view === 'settings'   && <Settings />}
          </Suspense>
        </div>
      </div>

      {showForm && (
        <TradeForm
          trade={editingTrade}
          onSave={handleSaveTrade}
          onClose={() => { setShowForm(false); setEditingTrade(null); }}
          uploadImages={uploadImages}
          getImageUrl={getImageUrl}
        />
      )}
    </div>
  );
}

const Splash = ({ t }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:t?.bg||'#0c0e1a', flexDirection:'column', gap:14, fontFamily:"'JetBrains Mono',monospace" }}>
    <div style={{ fontSize:48, color:'#00e5a0', filter:'drop-shadow(0 0 20px #00e5a060)' }}>◈</div>
    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:900, color:'#e2e6ff', letterSpacing:6 }}>EDGE</div>
    <div style={{ color:'#8a8fa8', fontSize:10, letterSpacing:3 }}>LOADING...</div>
  </div>
);

const Loading = ({ t }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:t.textMuted, fontSize:12 }}>
    Loading...
  </div>
);
