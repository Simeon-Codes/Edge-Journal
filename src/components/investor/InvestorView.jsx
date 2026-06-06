import { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { InvestorLinks } from '../../services/pb.js';
import { useNotify } from '../../contexts/ToastContext.jsx';

export default function InvestorView() {
  const { theme: t } = useTheme();
  const notify = useNotify();
  const [links, setLinks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [copied, setCopied]     = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ label: '', showPnl: true, showLotSize: false });

  useEffect(() => {
    InvestorLinks.list()
      .then(d => { setLinks(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.label.trim()) return;
    setCreating(true);
    setError(null); // clear previous error on retry
    try {
      await InvestorLinks.create({
        label:       form.label.trim(),
        showPnl:     form.showPnl,
        showLotSize: form.showLotSize,
      });
      const d = await InvestorLinks.list();
      setLinks(d.items || []);
      setForm({ label: '', showPnl: true, showLotSize: false });
      notify.success('Investor link created');
    } catch (err) {
      const msg = err?.data?.message || err?.message || 'Failed to create link';
      setError(msg);
      notify.error(msg);
      console.error('[EDGE] InvestorLinks.create error:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = (id, isActive) => {
    InvestorLinks.toggle(id, isActive)
      .then(() => InvestorLinks.list().then(d => setLinks(d.items || [])))
      .catch(err => {
        const msg = err?.message || 'Failed to update link';
        notify.error(msg);
      });
  };

  // FIX: delete now also notifies on error, consistent with handleCreate
  const handleDelete = (id) => {
    InvestorLinks.delete(id)
      .then(() => setLinks(prev => prev.filter(l => l.id !== id)))
      .catch(err => {
        const msg = err?.message || 'Failed to delete link';
        notify.error(msg);
      });
  };

  const copy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const inp = {
    width: '100%', background: t.bgInput, border: `1px solid ${t.border}`,
    borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, color: t.textStrong, marginBottom: 6 }}>Investor View Links</div>
        <div style={{ color: t.textMuted, fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
          Generate read-only links to share your trading performance with investors, followers, or prop firm evaluators. They can see your stats without accessing your account.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: t.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5 }}>Link Label</div>
            <input
              style={inp}
              placeholder="e.g. Q2 2025 Performance — Prop Firm"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Toggle label="Show P&L values" checked={form.showPnl}     onChange={v => setForm(f => ({ ...f, showPnl: v }))}     t={t} />
            <Toggle label="Show Lot Sizes"  checked={form.showLotSize} onChange={v => setForm(f => ({ ...f, showLotSize: v }))} t={t} />
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ff4d6d', marginBottom: 12 }}>
            ⚠ {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || !form.label.trim()}
          style={{
            padding: '11px 20px',
            background: creating || !form.label.trim() ? t.textMuted : `linear-gradient(135deg,${t.accent},#00b87d)`,
            border: 'none', borderRadius: 8, color: '#0c0e1a',
            fontFamily: 'inherit', fontWeight: 800, fontSize: 13,
            cursor: creating || !form.label.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {creating ? 'Generating...' : 'Generate Investor Link'}
        </button>
      </div>

      {/* Links list */}
      {!loading && links.length === 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
          No investor links yet. Create one above.
        </div>
      )}

      {links.map(link => (
        <div key={link.id} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ color: t.textStrong, fontWeight: 700, fontSize: 14 }}>{link.label || 'Unnamed Link'}</div>
              {/* FIX: show_lot_size now displayed — matches Settings investor tab */}
              <div style={{ color: t.textMuted, fontSize: 11, marginTop: 3 }}>
                {link.views || 0} views · {link.show_pnl ? 'P&L visible' : 'P&L hidden'} · {link.show_lot_size ? 'Lots visible' : 'Lots hidden'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                fontSize: 10, padding: '3px 9px', borderRadius: 10,
                background: link.is_active ? t.accentDim : t.redDim,
                color: link.is_active ? t.accent : t.red,
                border: `1px solid ${link.is_active ? t.accentBorder : t.red + '40'}`,
              }}>
                {link.is_active ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={() => handleToggle(link.id, !link.is_active)}
                style={{ fontSize: 11, padding: '4px 10px', background: t.bgHover, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {link.is_active ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => handleDelete(link.id)}
                style={{ fontSize: 11, padding: '4px 10px', background: t.redDim, border: `1px solid ${t.red}30`, borderRadius: 6, color: t.red, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Delete
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 11, color: t.textMuted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {link.token ? InvestorLinks.getShareUrl(link.token) : '— token missing —'}
            </div>
            <button
              onClick={() => link.token && copy(InvestorLinks.getShareUrl(link.token), link.id)}
              disabled={!link.token}
              style={{
                padding: '9px 16px',
                background: copied === link.id ? t.accentDim : `linear-gradient(135deg,${t.accent},#00b87d)`,
                border: 'none', borderRadius: 8,
                color: copied === link.id ? t.accent : '#0c0e1a',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 12,
                cursor: link.token ? 'pointer' : 'not-allowed', flexShrink: 0,
              }}
            >
              {copied === link.id ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>

          {/* FIX: last_viewed display added — matches Settings investor tab */}
          {link.last_viewed && (
            <div style={{ fontSize: 10, color: t.textDim, marginTop: 6 }}>
              Last viewed: {new Date(link.last_viewed).toLocaleString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Toggle — accepts disabled prop (harmonized with Settings version)
const Toggle = ({ label, checked, onChange, t, disabled }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? t.accent : t.border,
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
    <span style={{ fontSize: 12, color: t.text }}>{label}</span>
  </div>
);
