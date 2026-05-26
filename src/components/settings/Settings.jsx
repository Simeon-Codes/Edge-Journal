import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { InvestorLinks, MT5Accounts } from '../../services/pb.js';
import { TIER_LIMITS } from '../../hooks/useTrades.js';

// New competitive tier structure — synced with useTrades.js TIER_LIMITS
// 0=Trial(free,14d), 1=Starter(free forever,degraded), 2=Pro($19), 3=Advanced($39), 4=Elite($69)
const TIER_PRICES  = { 0:'Free (14 days)', 1:'Free forever', 2:'$19/mo', 3:'$39/mo', 4:'$69/mo' };
const TIER_NAMES   = { 0:'Trial', 1:'Starter', 2:'Pro', 3:'Advanced', 4:'Elite' };
const TIER_COLORS = { 0:'#8a8fa8', 1:'#00e5a0', 2:'#00e5a0', 3:'#facc15', 4:'#fb923c', 5:'#818cf8' };

export default function Settings() {
  const { user, profile, tier, updateProfile, subscriptionStatus } = useAuth();
  const { theme: t, setTheme, preference } = useTheme();
  const [tab, setTab] = useState('account');
  const [investorLinks, setInvestorLinks] = useState([]);
  const [mt5Accounts, setMt5Accounts]     = useState([]);
  const [newLink, setNewLink]   = useState({ label: '', showPnl: true, showLotSize: false });
  const [newMt5, setNewMt5]     = useState({ label: '', mt5Login: '', broker: '', server: '' });
  const [generatedKey, setGeneratedKey] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [copied, setCopied]     = useState('');

  useEffect(() => {
    if (tab === 'investor') loadInvestorLinks();
    if (tab === 'mt5')      loadMt5Accounts();
  }, [tab]);

  const loadInvestorLinks = async () => {
    try { const d = await InvestorLinks.list(); setInvestorLinks(d.items || []); } catch {}
  };
  const loadMt5Accounts = async () => {
    try { const d = await MT5Accounts.list(); setMt5Accounts(d.items || []); } catch {}
  };

  const createInvestorLink = async () => {
    setSaving(true);
    try {
      await InvestorLinks.create(newLink);
      await loadInvestorLinks();
      setNewLink({ label: '', showPnl: true, showLotSize: false });
      setMsg('Investor link created');
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  };

  const createMt5Account = async () => {
    setSaving(true);
    try {
      const { apiKey, record } = await MT5Accounts.create(newMt5);
      setGeneratedKey(apiKey);
      await loadMt5Accounts();
      setNewMt5({ label: '', mt5Login: '', broker: '', server: '' });
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const TABS = [
    { id: 'account',    label: '◉ Account'    },
    { id: 'investor',   label: '◎ Investor'   },
    { id: 'mt5',        label: '⟳ MT5 Sync'   },
    { id: 'billing',    label: '$ Billing'     },
    { id: 'display',    label: '◈ Display'     },
  ];

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${t.border}`, paddingBottom: 0 }}>
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: tab === tb.id ? `2px solid ${t.accent}` : '2px solid transparent', color: tab === tb.id ? t.accent : t.textMuted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: tab === tb.id ? 700 : 400, marginBottom: -1 }}>
            {tb.label}
          </button>
        ))}
      </div>

      {msg && <div style={{ background: t.accentDim, border: `1px solid ${t.accentBorder}`, color: t.accent, borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>{msg}</div>}

      {/* ── Account tab ─────────────────────────────────────────────────── */}
      {tab === 'account' && (
        <Card t={t}>
          <SectionTitle t={t}>Account Info</SectionTitle>
          <Row t={t} label="Email">{user?.email}</Row>
          <Row t={t} label="Display Name">{profile?.display_name}</Row>
          <Row t={t} label="Member Since">{user?.created?.slice(0,10)}</Row>
          <Row t={t} label="Account ID"><span style={{ fontSize: 10, color: t.textMuted }}>{user?.id}</span></Row>
          <SectionTitle t={t} style={{ marginTop: 20 }}>Subscription</SectionTitle>
          <Row t={t} label="Current Tier">
            <span style={{ color: TIER_COLORS[tier], fontWeight: 800 }}>Tier {tier} — {TIER_PRICES[tier]}</span>
          </Row>
          <Row t={t} label="Status">
            <span style={{ color: subscriptionStatus === 'active' ? t.accent : t.yellow, textTransform: 'capitalize' }}>{subscriptionStatus}</span>
          </Row>
          <Row t={t} label="Daily Limits">
            {TIER_LIMITS[tier]?.trades} trades · {TIER_LIMITS[tier]?.lots} lots
          </Row>
          <div style={{ marginTop: 12, padding: 12, background: t.redDim, border: `1px solid ${t.red}30`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>DANGER ZONE</div>
            <button style={{ padding: '8px 16px', background: 'none', border: `1px solid ${t.red}60`, borderRadius: 8, color: t.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Delete Account
            </button>
          </div>
        </Card>
      )}

      {/* ── Investor tab ────────────────────────────────────────────────── */}
      {tab === 'investor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card t={t}>
            <SectionTitle t={t}>Create Investor Link</SectionTitle>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14, lineHeight: 1.7 }}>
              Generate a read-only shareable link so investors or followers can view your trading performance without accessing your account.
            </div>
            <Field2 label="Link Label" t={t}>
              <input style={inp(t)} placeholder="e.g. My Trading Results Q1" value={newLink.label} onChange={e => setNewLink(v => ({ ...v, label: e.target.value }))} />
            </Field2>
            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
              <Toggle label="Show P&L" checked={newLink.showPnl} onChange={v => setNewLink(x => ({ ...x, showPnl: v }))} t={t} />
              <Toggle label="Show Lot Sizes" checked={newLink.showLotSize} onChange={v => setNewLink(x => ({ ...x, showLotSize: v }))} t={t} />
            </div>
            <button onClick={createInvestorLink} disabled={saving || !newLink.label} style={primaryBtn(t, saving || !newLink.label)}>
              {saving ? 'Creating...' : 'Generate Investor Link'}
            </button>
          </Card>

          {investorLinks.map(link => (
            <Card key={link.id} t={t}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: t.textStrong, fontWeight: 700 }}>{link.label || 'Unnamed Link'}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>{link.views} views · {link.show_pnl ? 'P&L visible' : 'P&L hidden'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <StatusBadge active={link.is_active} t={t} />
                  <button onClick={() => InvestorLinks.toggle(link.id, !link.is_active).then(loadInvestorLinks)} style={{ fontSize: 11, padding: '4px 10px', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {link.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: t.textMuted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {InvestorLinks.getShareUrl(link.token)}
                </div>
                <button onClick={() => copyToClipboard(InvestorLinks.getShareUrl(link.token), link.id)} style={{ ...primaryBtn(t), padding: '8px 14px', fontSize: 11 }}>
                  {copied === link.id ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── MT5 tab ─────────────────────────────────────────────────────── */}
      {tab === 'mt5' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card t={t}>
            <SectionTitle t={t}>Connect MT5 Account</SectionTitle>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14, lineHeight: 1.7 }}>
              Download the EDGE EA, install it in MT5, and enter the API key below. The EA will automatically sync all your trades.
            </div>
            <div style={{ background: t.purpleDim, border: `1px solid ${t.purple}30`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: t.purple, fontWeight: 700, marginBottom: 6 }}>MT5 EA Setup Steps</div>
              <ol style={{ fontSize: 11, color: t.text, lineHeight: 2, paddingLeft: 16 }}>
                <li>Download <strong>EDGE_Journal_EA.mq5</strong> from the files section</li>
                <li>Copy to: <code style={{ background: t.bg, padding: '1px 6px', borderRadius: 4 }}>MT5 Data Folder → MQL5 → Experts</code></li>
                <li>Compile in MetaEditor (press F7)</li>
                <li>In MT5: Tools → Options → Expert Advisors → Allow WebRequest for your server URL</li>
                <li>Attach EA to any chart, enter your API key below</li>
              </ol>
            </div>
            <Grid2 t={t}>
              <Field2 label="Account Label" t={t}><input style={inp(t)} placeholder="My ICT Account" value={newMt5.label} onChange={e => setNewMt5(v => ({ ...v, label: e.target.value }))} /></Field2>
              <Field2 label="MT5 Login Number" t={t}><input style={inp(t)} placeholder="12345678" value={newMt5.mt5Login} onChange={e => setNewMt5(v => ({ ...v, mt5Login: e.target.value }))} /></Field2>
              <Field2 label="Broker Name" t={t}><input style={inp(t)} placeholder="ICMarkets" value={newMt5.broker} onChange={e => setNewMt5(v => ({ ...v, broker: e.target.value }))} /></Field2>
              <Field2 label="MT5 Server" t={t}><input style={inp(t)} placeholder="ICMarketsSC-Demo" value={newMt5.server} onChange={e => setNewMt5(v => ({ ...v, server: e.target.value }))} /></Field2>
            </Grid2>
            <button onClick={createMt5Account} disabled={saving || !newMt5.label || !newMt5.mt5Login} style={primaryBtn(t, saving || !newMt5.label)}>
              {saving ? 'Generating...' : 'Generate API Key'}
            </button>
          </Card>

          {/* Show generated key once */}
          {generatedKey && (
            <Card t={t}>
              <div style={{ color: t.yellow, fontWeight: 700, marginBottom: 8 }}>⚠ Save this API key now — it will only be shown once!</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: t.bg, border: `1px solid ${t.yellow}40`, borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: t.textStrong, wordBreak: 'break-all' }}>
                  {generatedKey}
                </div>
                <button onClick={() => copyToClipboard(generatedKey, 'key')} style={{ ...primaryBtn(t), padding: '10px 14px' }}>
                  {copied === 'key' ? '✓' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>Paste this key in the EDGE EA settings in MT5.</div>
            </Card>
          )}

          {mt5Accounts.map(acc => (
            <Card key={acc.id} t={t}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: t.textStrong, fontWeight: 700 }}>{acc.account_label}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>Login: {acc.mt5_login} · {acc.broker}</div>
                  <div style={{ fontSize: 10, color: t.textDim }}>Last sync: {acc.last_sync ? new Date(acc.last_sync).toLocaleString() : 'Never'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <StatusBadge active={acc.is_active} t={t} />
                  <button onClick={() => MT5Accounts.delete(acc.id).then(loadMt5Accounts)} style={{ fontSize: 11, padding: '4px 10px', background: t.redDim, border: `1px solid ${t.red}30`, borderRadius: 6, color: t.red, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Remove
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Billing tab ─────────────────────────────────────────────────── */}
      {tab === 'billing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card t={t}>
            <SectionTitle t={t}>Subscription Tiers</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0,1,2,3,4].map(tierNum => {
                const active = tier === tierNum;
                const tierDescriptions = {
                  0: '10 trades/day · 5 lots/day · 14-day trial',
                  1: '3 trades/day · 0.5 lot/day · Ad-supported',
                  2: '20 trades/day · 20 lots/day · No ads',
                  3: '50 trades/day · 50 lots/day · No ads',
                  4: 'Unlimited trades · Unlimited lots · No ads',
                };
                return (
                  <div key={tierNum} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: active ? TIER_COLORS[tierNum] + '12' : t.bg, border: `1px solid ${active ? TIER_COLORS[tierNum] + '60' : t.border}`, borderRadius: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: TIER_COLORS[tierNum], fontWeight: 800, fontSize: 14 }}>{TIER_NAMES[tierNum]}</span>
                        {active && <span style={{ fontSize: 10, color: TIER_COLORS[tierNum], background: TIER_COLORS[tierNum] + '18', padding: '2px 8px', borderRadius: 10 }}>Current</span>}
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>
                        {tierDescriptions[tierNum]}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: TIER_COLORS[tierNum] }}>{TIER_PRICES[tierNum]}</div>
                      {tierNum >= 2 && !active && (
                        <button style={{ marginTop: 4, fontSize: 11, padding: '5px 12px', background: TIER_COLORS[tierNum] + '18', border: `1px solid ${TIER_COLORS[tierNum]}40`, borderRadius: 6, color: TIER_COLORS[tierNum], cursor: 'pointer', fontFamily: 'inherit' }}>
                          {tier < tierNum ? 'Upgrade' : 'Downgrade'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, padding: 12, background: t.purpleDim, border: `1px solid ${t.purple}30`, borderRadius: 8, fontSize: 11, color: t.textMuted }}>
              💳 Payments powered by Stripe. Coming soon — configure your Stripe keys in the PocketBase environment variables to enable billing.
            </div>
          </Card>
        </div>
      )}

      {/* ── Display tab ─────────────────────────────────────────────────── */}
      {tab === 'display' && (
        <Card t={t}>
          <SectionTitle t={t}>Appearance</SectionTitle>
          <Field2 label="Theme" t={t}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['dark','🌙 Dark'],['light','☀️ Light'],['system','💻 System']].map(([val, label]) => (
                <button key={val} onClick={() => setTheme(val)} style={{ flex: 1, padding: '10px', background: preference === val ? t.accentDim : t.bgInput, border: `1px solid ${preference === val ? t.accent : t.border}60`, borderRadius: 8, color: preference === val ? t.accent : t.textMuted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: preference === val ? 700 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          </Field2>
          <SectionTitle t={t} style={{ marginTop: 16 }}>Ads</SectionTitle>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>Ads are shown on the free Trial and Starter tiers. Upgrade to Pro or higher to remove ads permanently.</div>
          <Toggle label="Show Ads" checked={profile?.ads_enabled} onChange={v => updateProfile({ ads_enabled: v })} t={t} disabled={tier < 2} />
          {tier < 2 && <div style={{ fontSize: 10, color: t.textDim, marginTop: 6 }}>Upgrade to Pro ($19/mo) or higher to hide ads.</div>}
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const Card = ({ t, children }) => <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18 }}>{children}</div>;
const SectionTitle = ({ t, children, style }) => <div style={{ fontSize: 11, color: t.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 14, ...style }}>{children}</div>;
const Row = ({ t, label, children }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}`, fontSize: 13 }}><span style={{ color: t.textMuted }}>{label}</span><span style={{ color: t.text, fontWeight: 600 }}>{children}</span></div>;
const Field2 = ({ label, t, children }) => <div style={{ marginBottom: 14 }}><div style={{ fontSize: 10, color: t.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5, fontWeight: 600 }}>{label}</div>{children}</div>;
const Grid2 = ({ t, children }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
const StatusBadge = ({ active, t }) => <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: active ? t.accentDim : t.redDim, color: active ? t.accent : t.red, border: `1px solid ${active ? t.accentBorder : t.red + '40'}` }}>{active ? 'Active' : 'Inactive'}</span>;
const Toggle = ({ label, checked, onChange, t, disabled }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div onClick={() => !disabled && onChange(!checked)} style={{ width: 40, height: 22, borderRadius: 11, background: checked ? t.accent : t.border, cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
    <span style={{ fontSize: 13, color: t.text }}>{label}</span>
  </div>
);
const inp = (t) => ({ width: '100%', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' });
const primaryBtn = (t, disabled) => ({ padding: '11px 18px', background: disabled ? t.textMuted : `linear-gradient(135deg, ${t.accent}, #00b87d)`, border: 'none', borderRadius: 8, color: '#0c0e1a', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' });
