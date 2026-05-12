import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // In production you'd send to Sentry/LogRocket here
    console.error('[EDGE Journal Error]', error, info);
  }

  render() {
    if (this.state.error) {
      const t = {
        bg: '#0c0e1a', bgCard: '#0e1120', border: '#1e2240',
        accent: '#00e5a0', red: '#ff4d6d', textMuted: '#8a8fa8', text: '#c8cde8',
      };
      return (
        <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", padding: 24 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: 32, maxWidth: 480, width: '100%' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: t.red, marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
              EDGE Journal encountered an unexpected error. Your trade data is safe — this is a display issue only.
            </div>
            {this.state.error?.message && (
              <div style={{ background: '#0c0e1a', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 11, color: t.textMuted, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { this.setState({ error: null, info: null }); }}
                style={{ flex: 1, padding: '11px', background: `linear-gradient(135deg, ${t.accent}, #00b87d)`, border: 'none', borderRadius: 8, color: '#0c0e1a', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '11px 18px', background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
