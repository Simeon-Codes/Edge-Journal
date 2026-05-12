import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { TIER_LIMITS } from '../../hooks/useTrades.js';

const NAV_ITEMS = [
  { id: 'dashboard',  icon: '⬡', label: 'Dashboard'  },
  { id: 'journal',    icon: '◫', label: 'Trade Log'   },
  { id: 'analytics',  icon: '◈', label: 'Analytics'   },
  { id: 'playbook',   icon: '◪', label: 'Playbook'    },
  { id: 'daily',      icon: '✦', label: 'Daily Notes' },
  { id: 'mt5',        icon: '⟳', label: 'MT5 Sync'    },
  { id: 'investor',   icon: '◉', label: 'Investor View'},
  { id: 'settings',   icon: '⚙', label: 'Settings'    },
];

const TIER_COLORS = { 0:'#8a8fa8', 1:'#00e5a0', 2:'#00e5a0', 3:'#facc15', 4:'#fb923c', 5:'#818cf8' };
const TIER_LABELS = { 0:'Trial', 1:'T1', 2:'T2', 3:'T3', 4:'T4', 5:'T5' };

export default function Sidebar({ view, setView, collapsed, setCollapsed, stats }) {
  const { user, profile, logout, tier } = useAuth();
  const { theme: t, setTheme, preference } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const isMobile = window.innerWidth < 768;

  // Auto-collapse on mobile
  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  const W = collapsed ? 64 : 220;

  return (
    <>
      {/* Mobile backdrop */}
      {!collapsed && isMobile && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000070', zIndex: 40 }}
          onClick={() => setCollapsed(true)} />
      )}

      <aside style={{
        width: W, minWidth: W, background: t.sidebar,
        borderRight: `1px solid ${t.border}`,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden', flexShrink: 0, zIndex: 50,
        position: isMobile ? 'fixed' : 'relative',
        height: isMobile ? '100vh' : 'auto',
        left: isMobile && collapsed ? -W : 0,
      }}>
        {/* Logo + collapse toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', padding: collapsed ? '18px 0' : '18px 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 20, color: t.accent, filter: `drop-shadow(0 0 8px ${t.accent}60)` }}>◈</span>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 900, color: t.accent, letterSpacing: 4, lineHeight: 1 }}>EDGE</div>
                <div style={{ fontSize: 7, color: t.textMuted, letterSpacing: 5 }}>JOURNAL</div>
              </div>
            </div>
          )}
          {collapsed && <span style={{ fontSize: 20, color: t.accent }}>◈</span>}
          <button onClick={() => setCollapsed(v => !v)} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, color: t.textMuted, cursor: 'pointer', padding: '4px 6px', fontSize: 12, flexShrink: 0, display: collapsed ? 'none' : 'block' }}>
            ◂
          </button>
        </div>

        {/* Collapse toggle when collapsed */}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '8px 0', fontSize: 16, textAlign: 'center' }}>
            ▸
          </button>
        )}

        {/* User badge */}
        {!collapsed && (
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${t.accent}, #00b87d)`, color: '#0c0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
              {(profile?.display_name || user?.email || 'T')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <div style={{ color: t.textStrong, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.display_name || 'Trader'}</div>
              <div style={{ fontSize: 10, color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, color: TIER_COLORS[tier], background: TIER_COLORS[tier] + '18', border: `1px solid ${TIER_COLORS[tier]}40`, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
              {TIER_LABELS[tier]}
            </span>
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, padding: collapsed ? '8px 0' : '10px 8px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => { setView(item.id); if (isMobile) setCollapsed(true); }}
                title={collapsed ? item.label : ''}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10, padding: collapsed ? '12px 0' : '10px 12px',
                  background: active ? t.accentDim : 'transparent',
                  border: 'none',
                  borderLeft: active && !collapsed ? `2px solid ${t.accent}` : '2px solid transparent',
                  borderRadius: collapsed ? 0 : 8,
                  color: active ? t.accent : t.textMuted,
                  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  marginBottom: 2, textAlign: 'left', transition: 'all 0.12s',
                }}>
                <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Quick stats (expanded only) */}
        {!collapsed && stats && (
          <div style={{ margin: '0 8px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px', flexShrink: 0 }}>
            {[
              { label: 'P&L', value: `$${stats.totalPnl}`, color: Number(stats.totalPnl) >= 0 ? t.accent : t.red },
              { label: 'Win %', value: `${stats.winRate}%`, color: t.accent },
              { label: 'R:R', value: `${stats.avgRR}R`, color: t.yellow },
              { label: 'Trades', value: stats.totalTrades, color: t.text },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 10, color: t.textMuted }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom actions */}
        <div style={{ padding: collapsed ? '8px 0' : '8px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Theme toggle */}
          {!collapsed ? (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowThemePicker(v => !v)} style={{ width: '100%', padding: '8px 12px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {preference === 'dark' ? '🌙' : preference === 'light' ? '☀️' : '💻'} {preference === 'dark' ? 'Dark' : preference === 'light' ? 'Light' : 'System'}
              </button>
              {showThemePicker && (
                <div style={{ position: 'absolute', bottom: '110%', left: 0, right: 0, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden', zIndex: 100 }}>
                  {[['dark','🌙 Dark'],['light','☀️ Light'],['system','💻 System']].map(([val, label]) => (
                    <button key={val} onClick={() => { setTheme(val); setShowThemePicker(false); }}
                      style={{ width: '100%', padding: '9px 12px', background: preference === val ? t.accentDim : 'transparent', border: 'none', color: preference === val ? t.accent : t.text, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setTheme(preference === 'dark' ? 'light' : 'dark')} title="Toggle theme"
              style={{ padding: '8px 0', background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16, textAlign: 'center' }}>
              {preference === 'dark' ? '☀️' : '🌙'}
            </button>
          )}

          {/* Log trade button */}
          {!collapsed ? (
            <button onClick={() => setView('new-trade')} style={{ padding: '10px', background: `linear-gradient(135deg, ${t.accent}, #00b87d)`, border: 'none', borderRadius: 8, color: '#0c0e1a', fontFamily: 'inherit', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
              + Log Trade
            </button>
          ) : (
            <button onClick={() => setView('new-trade')} title="Log Trade" style={{ padding: '10px 0', background: t.accentDim, border: `1px solid ${t.accentBorder}`, borderRadius: 8, color: t.accent, cursor: 'pointer', fontSize: 16, textAlign: 'center' }}>
              +
            </button>
          )}

          {/* Sign out */}
          <button onClick={logout} title="Sign out"
            style={{ padding: collapsed ? '8px 0' : '8px 12px', background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer', textAlign: 'center' }}>
            {collapsed ? '↩' : '← Sign Out'}
          </button>
        </div>
      </aside>

      {/* Mobile toggle button */}
      {isMobile && collapsed && (
        <button onClick={() => setCollapsed(false)} style={{ position: 'fixed', top: 16, left: 16, zIndex: 60, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, padding: '8px 10px', cursor: 'pointer', fontSize: 16, boxShadow: t.shadow }}>
          ☰
        </button>
      )}
    </>
  );
}
