import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { Auth } from '../../services/pb.js';
import { useTheme } from '../../contexts/ThemeContext.jsx';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const { theme } = useTheme();
  const [mode, setMode]     = useState('login');
  const [form, setForm]     = useState({ email: '', password: '', passwordConfirm: '', displayName: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError('');
    if (!form.email || !form.password) { setError('Email and password are required'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
      } else {
        await register({
          email: form.email, password: form.password,
          passwordConfirm: form.passwordConfirm,
          displayName: form.displayName,
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const t = theme;

  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'JetBrains Mono', monospace", position: 'relative', overflow: 'hidden' }}>
      {/* Grid bg */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${t.border}18 1px, transparent 1px), linear-gradient(90deg, ${t.border}18 1px, transparent 1px)`, backgroundSize: '40px 40px', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: '36px 32px', boxShadow: t.shadow }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 42, color: t.accent, filter: `drop-shadow(0 0 20px ${t.accent}60)`, lineHeight: 1, marginBottom: 10 }}>◈</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 900, color: t.accent, letterSpacing: 8, lineHeight: 1 }}>EDGE</div>
          <div style={{ fontSize: 9, color: t.textMuted, letterSpacing: 6, marginTop: 4 }}>TRADING JOURNAL</div>
          <div style={{ marginTop: 10, display: 'inline-flex', gap: 8, alignItems: 'center', background: t.accentDim, border: `1px solid ${t.accentBorder}`, borderRadius: 20, padding: '4px 12px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: t.accent }}>Cloud · Secure · Real-time Sync</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: t.bg, borderRadius: 10, padding: 4, marginBottom: 22, border: `1px solid ${t.border}` }}>
          {['login', 'register'].map(m => (
            <button key={m} style={{ flex: 1, padding: '9px', background: mode === m ? t.accentDim : 'transparent', border: mode === m ? `1px solid ${t.accentBorder}` : '1px solid transparent', borderRadius: 8, color: mode === m ? t.accent : t.textMuted, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.15s' }}
              onClick={() => { setMode(m); setError(''); }}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <AuthField label="Display Name" theme={t}>
              <input style={inputStyle(t)} placeholder="Your trading name" autoComplete="name"
                value={form.displayName} onChange={e => set('displayName', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </AuthField>
          )}

          <AuthField label="Email Address" theme={t}>
            <input style={inputStyle(t)} type="email" placeholder="trader@example.com" autoComplete="email"
              value={form.email} onChange={e => set('email', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </AuthField>

          <AuthField label="Password" theme={t}>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle(t), paddingRight: 44 }} type={showPass ? 'text' : 'password'}
                placeholder={mode === 'register' ? 'Min 8 characters' : 'Enter password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password} onChange={e => set('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              <button onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 14 }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </AuthField>

          {mode === 'register' && (
            <AuthField label="Confirm Password" theme={t}>
              <input style={inputStyle(t)} type="password" placeholder="Repeat password" autoComplete="new-password"
                value={form.passwordConfirm} onChange={e => set('passwordConfirm', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </AuthField>
          )}

          {error && (
            <div style={{ background: t.redDim, border: `1px solid ${t.red}40`, color: t.red, borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
              ⚠ {error}
            </div>
          )}

          <button style={{ padding: '13px', background: loading ? t.textMuted : `linear-gradient(135deg, ${t.accent}, #00b87d)`, border: 'none', borderRadius: 10, color: '#0c0e1a', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: 0.5, marginTop: 4 }}
            onClick={handleSubmit} disabled={loading}>
            {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          {mode === 'login' && (
            <button style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginTop: -6 }}
              onClick={async () => { try { await Auth.requestPasswordReset(form.email); setError('Reset link sent — check your email'); } catch(e) { setError(e.message); } }}>
              Forgot password?
            </button>
          )}
        </div>

        {/* Trust signals */}
        <div style={{ marginTop: 20, padding: '12px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['🔒 End-to-end secure', '☁ Cloud sync', '📱 All devices', '14-day free trial'].map(item => (
              <span key={item} style={{ fontSize: 10, color: t.textMuted }}>{item}</span>
            ))}
          </div>
        </div>

        {/* Tier pricing teaser */}
        {mode === 'register' && (
          <div style={{ marginTop: 14, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[['T1','$50'], ['T2','$100'], ['T3','$200'], ['T4','$300'], ['T5','$500']].map(([t2, p]) => (
              <span key={t2} style={{ fontSize: 9, color: t.textDim, background: t.bgHover, border: `1px solid ${t.border}`, padding: '2px 8px', borderRadius: 4 }}>{t2} {p}/mo</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const AuthField = ({ label, theme: t, children }) => (
  <div>
    <div style={{ fontSize: 10, color: t.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5, fontWeight: 600 }}>{label}</div>
    {children}
  </div>
);

const inputStyle = (t) => ({
  width: '100%', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 10,
  padding: '11px 14px', color: t.text, fontSize: 13, fontFamily: 'inherit',
  outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
});
