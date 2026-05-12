import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { PAIRS, SESSIONS, SETUPS, EMOTIONS, GRADES, TAGS } from '../../utils/constants.js';

export default function TradeForm({ trade, onSave, onClose, uploadImages, getImageUrl }) {
  const { theme: t } = useTheme();
  const [form, setForm] = useState(trade ? mapTradeToForm(trade) : defaultForm());
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [imgFiles, setImgFiles] = useState([]);
  const [imgPreviews, setImgPreviews] = useState([]);
  const fileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTag = (tag) => set('tags', form.tags.includes(tag) ? form.tags.filter(x => x !== tag) : [...form.tags, tag]);

  // Auto-calc RR
  useEffect(() => {
    const entry = parseFloat(form.entry_price), sl = parseFloat(form.sl), tp = parseFloat(form.tp);
    if (entry && sl && tp && Math.abs(entry - sl) > 0) {
      set('rr', (Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(2));
    }
  }, [form.entry_price, form.sl, form.tp]);

  // Auto-calc pips
  useEffect(() => {
    const entry = parseFloat(form.entry_price), exit = parseFloat(form.exit_price);
    if (entry && exit) {
      const isYen = form.pair.includes('JPY'), isGold = form.pair.includes('XAU'), isSilver = form.pair.includes('XAG');
      const mult  = isYen ? 100 : isGold ? 10 : isSilver ? 100 : 10000;
      const raw   = (exit - entry) * (form.direction === 'LONG' ? 1 : -1) * mult;
      set('pips', raw.toFixed(1));
    }
  }, [form.entry_price, form.exit_price, form.direction, form.pair]);

  const handleFiles = (files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 2);
    setImgFiles(valid);
    setImgPreviews(valid.map(f => URL.createObjectURL(f)));
  };

  const validate = () => {
    const e = {};
    if (!form.trade_date)   e.trade_date   = 'Required';
    if (!form.pair)         e.pair         = 'Required';
    if (!form.entry_price)  e.entry_price  = 'Required';
    if (!form.lot_size)     e.lot_size     = 'Required';
    if (form.pnl === '' && form.exit_price) {
      // auto-calc pnl is OK to be empty on open trades
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const saved = await onSave(formToTrade(form));
      if (imgFiles.length && saved?.id) {
        await uploadImages(saved.id, imgFiles);
      }
      onClose();
    } catch (e) {
      setErrors({ _: e.message });
    } finally {
      setSaving(false);
    }
  };

  const existingImages = trade?.chart_images || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000c0', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: t.shadow }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 800, color: t.textStrong }}>{trade ? 'Edit Trade' : 'Log New Trade'}</div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>ICT Smart Money · All fields encrypted at rest</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {errors._ && <Alert msg={errors._} theme={t} />}

          <Grid2>
            <Field label="Date" error={errors.trade_date} t={t}><input style={inp(t, errors.trade_date)} type="date" value={form.trade_date} onChange={e => set('trade_date', e.target.value)} /></Field>
            <Field label="Time" t={t}><input style={inp(t)} type="time" value={form.trade_time} onChange={e => set('trade_time', e.target.value)} /></Field>
          </Grid2>

          <Grid2>
            <Field label="Pair" error={errors.pair} t={t}>
              <select style={inp(t, errors.pair)} value={form.pair} onChange={e => set('pair', e.target.value)}>
                {PAIRS.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Session" t={t}>
              <select style={inp(t)} value={form.session} onChange={e => set('session', e.target.value)}>
                {SESSIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </Grid2>

          <Field label="Direction" t={t}>
            <div style={{ display: 'flex', gap: 10 }}>
              {['LONG','SHORT'].map(d => (
                <button key={d} onClick={() => set('direction', d)} style={{ flex: 1, padding: '10px', background: form.direction === d ? (d === 'LONG' ? t.accentDim : t.redDim) : t.bgInput, border: `1px solid ${form.direction === d ? (d === 'LONG' ? t.accent : t.red) : t.border}60`, borderRadius: 8, color: form.direction === d ? (d === 'LONG' ? t.accent : t.red) : t.textMuted, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {d === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="ICT Setup" t={t}>
            <select style={inp(t)} value={form.setup} onChange={e => set('setup', e.target.value)}>
              {SETUPS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>

          <Divider label="Price Levels" t={t} />

          <Grid2>
            <Field label="Entry Price" error={errors.entry_price} t={t}><input style={inp(t, errors.entry_price)} type="number" step="0.00001" placeholder="0.00000" value={form.entry_price} onChange={e => set('entry_price', e.target.value)} /></Field>
            <Field label="Exit Price" t={t}><input style={inp(t)} type="number" step="0.00001" placeholder="0.00000" value={form.exit_price} onChange={e => set('exit_price', e.target.value)} /></Field>
          </Grid2>
          <Grid2>
            <Field label="Stop Loss" t={t}><input style={{ ...inp(t), borderColor: t.red + '40' }} type="number" step="0.00001" value={form.sl} onChange={e => set('sl', e.target.value)} /></Field>
            <Field label="Take Profit" t={t}><input style={{ ...inp(t), borderColor: t.accent + '40' }} type="number" step="0.00001" value={form.tp} onChange={e => set('tp', e.target.value)} /></Field>
          </Grid2>

          <Divider label="Trade Metrics" t={t} />

          <Grid2>
            <Field label="Lot Size" error={errors.lot_size} t={t}><input style={inp(t, errors.lot_size)} type="number" step="0.01" min="0.01" value={form.lot_size} onChange={e => set('lot_size', e.target.value)} /></Field>
            <Field label="R:R Ratio (auto)" t={t}><input style={{ ...inp(t), color: t.yellow }} type="number" step="0.01" placeholder="Auto" value={form.rr} onChange={e => set('rr', e.target.value)} /></Field>
          </Grid2>
          <Grid2>
            <Field label="P&L ($)" t={t}><input style={{ ...inp(t), color: parseFloat(form.pnl) >= 0 ? t.accent : t.red }} type="number" step="0.01" placeholder="0.00" value={form.pnl} onChange={e => set('pnl', e.target.value)} /></Field>
            <Field label="Pips (auto)" t={t}><input style={{ ...inp(t), color: parseFloat(form.pips) >= 0 ? t.accent : t.red }} type="number" step="0.1" placeholder="Auto" value={form.pips} onChange={e => set('pips', e.target.value)} /></Field>
          </Grid2>

          <Divider label="Psychology" t={t} />

          <Grid2>
            <Field label="Emotion" t={t}>
              <select style={inp(t)} value={form.emotions} onChange={e => set('emotions', e.target.value)}>
                {EMOTIONS.map(e => <option key={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Grade" t={t}>
              <select style={inp(t)} value={form.grade} onChange={e => set('grade', e.target.value)}>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </Field>
          </Grid2>

          <Field label="Followed Trading Plan" t={t}>
            <div style={{ display: 'flex', gap: 10 }}>
              {[true, false].map(v => (
                <button key={String(v)} onClick={() => set('followed_plan', v)} style={{ flex: 1, padding: '9px', background: form.followed_plan === v ? (v ? t.accentDim : t.redDim) : t.bgInput, border: `1px solid ${form.followed_plan === v ? (v ? t.accent : t.red) : t.border}60`, borderRadius: 8, color: form.followed_plan === v ? (v ? t.accent : t.red) : t.textMuted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {v ? '✓ Yes — plan followed' : '✗ No — deviated'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="ICT Tags" t={t}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} style={{ fontSize: 11, padding: '4px 10px', background: form.tags.includes(tag) ? t.purpleDim : t.bgInput, border: `1px solid ${form.tags.includes(tag) ? t.purple : t.border}`, borderRadius: 6, color: form.tags.includes(tag) ? t.purple : t.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {tag}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Mistakes / Deviations" t={t}>
            <textarea style={{ ...inp(t), minHeight: 70, resize: 'vertical', lineHeight: 1.6 }} placeholder="What went wrong? Be brutally honest." value={form.mistakes} onChange={e => set('mistakes', e.target.value)} />
          </Field>

          <Field label="Trade Notes & Analysis" t={t}>
            <textarea style={{ ...inp(t), minHeight: 90, resize: 'vertical', lineHeight: 1.6 }} placeholder="ICT concepts, confluences, reasoning, what you'd do differently..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>

          <Divider label="Chart Screenshots" t={t} />

          {/* Existing images */}
          {existingImages.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {existingImages.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: 120, height: 80, borderRadius: 8, overflow: 'hidden', border: `1px solid ${t.border}` }}>
                  <img src={getImageUrl(trade.id, img)} alt={`Chart ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#00000080', color: '#fff', fontSize: 9, padding: '2px 6px', textAlign: 'center' }}>
                    {i === 0 ? 'Before' : 'After'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload area */}
          <div
            style={{ border: `2px dashed ${t.border}`, borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', background: t.bgInput, transition: 'border-color 0.15s' }}
            onClick={() => fileRef.current.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
            {imgPreviews.length > 0 ? (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {imgPreviews.map((src, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={src} alt={`Preview ${i}`} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${t.border}` }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#00000080', color: '#fff', fontSize: 9, padding: '2px 0', textAlign: 'center', borderRadius: '0 0 8px 8px' }}>
                      {i === 0 ? 'Before' : 'After'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📸</div>
                <div style={{ color: t.textMuted, fontSize: 12 }}>Drop before/after chart screenshots here</div>
                <div style={{ color: t.textDim, fontSize: 10, marginTop: 4 }}>Max 2 images · JPG, PNG, WebP · 5MB each</div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '12px', background: saving ? t.textMuted : `linear-gradient(135deg, ${t.accent}, #00b87d)`, border: 'none', borderRadius: 10, color: '#0c0e1a', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : trade ? '✓ Update Trade' : '+ Save Trade'}
          </button>
          <button onClick={onClose} style={{ padding: '12px 20px', background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMuted, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const Grid2 = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
const Field = ({ label, error, t, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 10, color: error ? t.red : t.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5, fontWeight: 600 }}>{label}{error ? ` — ${error}` : ''}</div>
    {children}
  </div>
);
const Divider = ({ label, t }) => (
  <div style={{ position: 'relative', margin: '6px 0 16px', borderTop: `1px solid ${t.border}` }}>
    <span style={{ position: 'absolute', top: -9, left: 0, background: t.bgCard, paddingRight: 10, fontSize: 10, color: t.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</span>
  </div>
);
const Alert = ({ msg, t }) => (
  <div style={{ background: t.redDim, border: `1px solid ${t.red}40`, color: t.red, borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>⚠ {msg}</div>
);

// ── Helpers ────────────────────────────────────────────────────────────────────
const inp = (t, err) => ({
  width: '100%', background: t.bgInput, border: `1px solid ${err ? t.red : t.border}`,
  borderRadius: 8, padding: '10px 12px', color: t.text,
  fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
});

const defaultForm = () => ({
  trade_date: new Date().toISOString().slice(0, 10),
  trade_time: new Date().toTimeString().slice(0, 5),
  pair: 'EURUSD', direction: 'LONG', session: 'London', setup: 'OTE',
  entry_price: '', exit_price: '', sl: '', tp: '',
  lot_size: '0.01', rr: '', pnl: '', pips: '',
  emotions: 'Calm', followed_plan: true, mistakes: '', notes: '',
  tags: [], grade: 'A', is_open: false,
});

const mapTradeToForm = (t) => ({
  trade_date:   t.trade_date?.slice(0, 10) || '',
  trade_time:   t.trade_time || '',
  pair:         t.pair || 'EURUSD',
  direction:    t.direction || 'LONG',
  session:      t.session || 'London',
  setup:        t.setup || 'OTE',
  entry_price:  t.entry_price || '',
  exit_price:   t.exit_price || '',
  sl:           t.sl || '',
  tp:           t.tp || '',
  lot_size:     t.lot_size || '0.01',
  rr:           t.rr || '',
  pnl:          t.pnl || '',
  pips:         t.pips || '',
  emotions:     t.emotions || 'Calm',
  followed_plan: t.followed_plan !== undefined ? t.followed_plan : true,
  mistakes:     t.mistakes || '',
  notes:        t.notes || '',
  tags:         Array.isArray(t.tags) ? t.tags : [],
  grade:        t.grade || 'A',
  is_open:      t.is_open || false,
});

const formToTrade = (f) => ({
  trade_date:   f.trade_date,
  trade_time:   f.trade_time,
  pair:         f.pair,
  direction:    f.direction,
  session:      f.session,
  setup:        f.setup,
  entry_price:  parseFloat(f.entry_price) || 0,
  exit_price:   parseFloat(f.exit_price) || 0,
  sl:           parseFloat(f.sl) || 0,
  tp:           parseFloat(f.tp) || 0,
  lot_size:     parseFloat(f.lot_size) || 0.01,
  rr:           parseFloat(f.rr) || 0,
  pnl:          parseFloat(f.pnl) || 0,
  pips:         parseFloat(f.pips) || 0,
  emotions:     f.emotions,
  followed_plan: f.followed_plan,
  mistakes:     f.mistakes,
  notes:        f.notes,
  tags:         f.tags,
  grade:        f.grade,
  is_open:      f.is_open,
});
