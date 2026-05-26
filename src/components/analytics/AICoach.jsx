// ── AI Performance Coach ─────────────────────────────────────────────────────
// Sends aggregated trade stats to the PocketBase /api/ai-coach endpoint,
// which calls the Anthropic Claude API server-side and returns a structured
// performance evaluation. Gated behind Tier 2 (Pro) and above.
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';

const PB_URL = import.meta.env.VITE_PB_URL;

// ── Helper: format a stat value for display ───────────────────────────────────
function StatPill({ label, value, color, t }) {
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: 10, padding: '10px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: t.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || t.accent }}>
        {value}
      </div>
    </div>
  );
}

// ── Helper: render the AI markdown-like response with basic formatting ────────
function CoachResponse({ text, t }) {
  // Split on double-newline for paragraphs, single-newline for line breaks
  const sections = text.split(/\n\n+/);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sections.map((section, i) => {
        // Section headers start with ## or **Title:**
        if (section.startsWith('##') || section.startsWith('**') && section.includes(':**')) {
          const clean = section.replace(/^#+\s*/, '').replace(/\*\*/g, '');
          const [title, ...rest] = clean.split('\n');
          return (
            <div key={i}>
              <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                {title.replace(/:$/, '')}
              </div>
              {rest.length > 0 && (
                <div style={{ color: t.text, fontSize: 14, lineHeight: 1.8 }}>
                  {rest.join('\n')}
                </div>
              )}
            </div>
          );
        }
        // Bullet lines starting with - or •
        const lines = section.split('\n');
        const isBulletBlock = lines.every(l => l.trim().startsWith('-') || l.trim().startsWith('•') || l.trim() === '');
        if (isBulletBlock) {
          return (
            <ul key={i} style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lines.filter(l => l.trim()).map((line, j) => (
                <li key={j} style={{ color: t.text, fontSize: 13, lineHeight: 1.7 }}>
                  {line.replace(/^[-•]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                </li>
              ))}
            </ul>
          );
        }
        // Default: paragraph
        return (
          <p key={i} style={{ margin: 0, color: t.text, fontSize: 14, lineHeight: 1.8 }}>
            {section.replace(/\*\*(.*?)\*\*/g, '$1')}
          </p>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AICoach({ trades }) {
  const { theme: t } = useTheme();
  const { tier, token } = useAuth();
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [dateRange, setDateRange] = useState('30'); // days

  // Gate behind Pro tier and above
  const isUnlocked = tier >= 2;

  // ── Build aggregated stats from raw trades array ───────────────────────────
  const buildStats = (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));

    const filtered = trades.filter(tr => {
      const d = new Date(tr.trade_date || tr.created);
      return d >= cutoff;
    });

    if (filtered.length === 0) return null;

    const closed   = filtered.filter(tr => !tr.is_open);
    const wins     = closed.filter(tr => Number(tr.pnl || 0) > 0);
    const losses   = closed.filter(tr => Number(tr.pnl || 0) < 0);
    const totalPnl = closed.reduce((s, tr) => s + Number(tr.pnl || 0), 0);
    const winRate  = closed.length > 0 ? (wins.length / closed.length * 100).toFixed(1) : 0;

    // Average RR on winning trades
    const avgRR = wins.length > 0
      ? (wins.reduce((s, tr) => s + Number(tr.rr || 0), 0) / wins.length).toFixed(2)
      : 0;

    // Profit factor: gross profit / gross loss
    const grossProfit = wins.reduce((s, tr) => s + Number(tr.pnl || 0), 0);
    const grossLoss   = Math.abs(losses.reduce((s, tr) => s + Number(tr.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0';

    // Session breakdown
    const sessionMap = {};
    filtered.forEach(tr => {
      const s = tr.session || 'Unknown';
      if (!sessionMap[s]) sessionMap[s] = { trades: 0, pnl: 0, wins: 0 };
      sessionMap[s].trades++;
      sessionMap[s].pnl += Number(tr.pnl || 0);
      if (Number(tr.pnl || 0) > 0) sessionMap[s].wins++;
    });

    // Setup breakdown — top 5
    const setupMap = {};
    filtered.forEach(tr => {
      const s = tr.setup || 'Unknown';
      if (!setupMap[s]) setupMap[s] = { trades: 0, pnl: 0, wins: 0 };
      setupMap[s].trades++;
      setupMap[s].pnl += Number(tr.pnl || 0);
      if (Number(tr.pnl || 0) > 0) setupMap[s].wins++;
    });
    const topSetups = Object.entries(setupMap)
      .sort((a, b) => b[1].trades - a[1].trades)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data, winRate: data.trades > 0 ? (data.wins/data.trades*100).toFixed(0)+'%' : '0%' }));

    // Emotion breakdown
    const emotionMap = {};
    filtered.forEach(tr => {
      const e = tr.emotion || 'Unknown';
      if (!emotionMap[e]) emotionMap[e] = { trades: 0, pnl: 0 };
      emotionMap[e].trades++;
      emotionMap[e].pnl += Number(tr.pnl || 0);
    });

    // Plan adherence rate
    const withPlan = filtered.filter(tr => tr.followed_plan !== undefined && tr.followed_plan !== null);
    const adherenceRate = withPlan.length > 0
      ? (withPlan.filter(tr => tr.followed_plan).length / withPlan.length * 100).toFixed(0)
      : null;

    // Grade distribution
    const gradeMap = {};
    filtered.forEach(tr => { if (tr.grade) { gradeMap[tr.grade] = (gradeMap[tr.grade] || 0) + 1; } });

    // Common mistakes
    const mistakeList = filtered
      .filter(tr => tr.mistakes)
      .map(tr => tr.mistakes)
      .join(', ');

    return {
      period_days: Number(days),
      total_trades: filtered.length,
      closed_trades: closed.length,
      win_rate: winRate + '%',
      total_pnl: totalPnl.toFixed(2),
      average_rr: avgRR,
      profit_factor: profitFactor,
      gross_profit: grossProfit.toFixed(2),
      gross_loss: grossLoss.toFixed(2),
      plan_adherence: adherenceRate ? adherenceRate + '%' : 'Not tracked',
      session_performance: sessionMap,
      top_setups: topSetups,
      emotion_pnl: emotionMap,
      grade_distribution: gradeMap,
      common_mistakes: mistakeList || 'None logged',
    };
  };

  // ── Call the PocketBase AI coach endpoint ─────────────────────────────────
  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const stats = buildStats(dateRange);
    if (!stats || stats.total_trades < 3) {
      setError(`Not enough trades in the last ${dateRange} days to generate a meaningful analysis. Log at least 3 closed trades in this period.`);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${PB_URL}/api/ai-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? token : '',
        },
        body: JSON.stringify({ stats }),
      });

      if (res.status === 403) {
        setError('AI Coach is available on Pro ($19/mo) and above. Upgrade in Settings → Billing.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Request failed (${res.status})`);
        return;
      }

      const data = await res.json();
      setResult({ evaluation: data.evaluation, stats, generatedAt: new Date().toLocaleString() });
    } catch (e) {
      setError('Network error — check that your PocketBase backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // ── Locked state for free users ───────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>🔒</div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: t.textStrong }}>
          AI Performance Coach
        </div>
        <div style={{ color: t.textMuted, fontSize: 14, maxWidth: 400, lineHeight: 1.7 }}>
          Your AI trading analyst — analyzes your win rate, session performance, emotional patterns, and setup rankings, then delivers a personalized improvement report.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: t.accentDim, border: `1px solid ${t.accentBorder}`, borderRadius: 20, padding: '8px 18px' }}>
          <span style={{ color: t.accent, fontSize: 13, fontWeight: 700 }}>Available on Pro ($19/mo) and above</span>
        </div>
      </div>
    );
  }

  const previewStats = buildStats(dateRange);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: t.textStrong }}>
            AI Performance Coach
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            Powered by Claude (Anthropic) · Analysis runs server-side
          </div>
        </div>

        {/* Date range selector + run button */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: t.textMuted }}>Analyse last</div>
          {['7','30','90'].map(d => (
            <button
              key={d}
              onClick={() => setDateRange(d)}
              style={{
                padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                borderRadius: 8, fontWeight: dateRange === d ? 700 : 400,
                background: dateRange === d ? t.accentDim : t.bgCard,
                border: `1px solid ${dateRange === d ? t.accentBorder : t.border}`,
                color: dateRange === d ? t.accent : t.textMuted,
              }}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={runAnalysis}
            disabled={loading}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', borderRadius: 10, border: 'none',
              background: loading ? t.textMuted : `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
              color: '#fff', opacity: loading ? 0.6 : 1, transition: 'all 0.15s',
            }}
          >
            {loading ? 'Analysing...' : '✦ Run Analysis'}
          </button>
        </div>
      </div>

      {/* ── Quick stats preview (always visible) ── */}
      {previewStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          <StatPill label="Trades" value={previewStats.total_trades} t={t} />
          <StatPill label="Win Rate" value={previewStats.win_rate} color={parseFloat(previewStats.win_rate) >= 50 ? t.accent : t.red} t={t} />
          <StatPill label="Total P&L" value={`$${Number(previewStats.total_pnl) >= 0 ? '+' : ''}${previewStats.total_pnl}`} color={Number(previewStats.total_pnl) >= 0 ? t.accent : t.red} t={t} />
          <StatPill label="Profit Factor" value={previewStats.profit_factor} color={Number(previewStats.profit_factor) >= 1 ? t.accent : t.red} t={t} />
          <StatPill label="Avg RR" value={previewStats.average_rr + 'R'} t={t} />
          <StatPill label="Plan Adherence" value={previewStats.plan_adherence} color={t.yellow} t={t} />
        </div>
      )}

      {/* ── Error state ── */}
      {error && (
        <div style={{ background: t.redDim, border: `1px solid ${t.red}40`, borderRadius: 10, padding: '14px 16px', color: t.red, fontSize: 13, lineHeight: 1.6 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🧠</div>
          <div style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.8 }}>
            Analysing {previewStats?.total_trades} trades from the last {dateRange} days...<br />
            Evaluating win rate trends, session patterns, emotional state, and setup rankings.
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && !loading && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Result header */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.accentDim }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 18 }}>🧠</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.accent }}>
                Performance Analysis — Last {result.stats.period_days} days
              </span>
            </div>
            <div style={{ fontSize: 10, color: t.textMuted }}>Generated {result.generatedAt}</div>
          </div>

          {/* The evaluation text from Claude */}
          <div style={{ padding: 18 }}>
            <CoachResponse text={result.evaluation} t={t} />
          </div>

          {/* Action footer */}
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${t.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setResult(null)}
              style={{ padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8, background: t.bg, border: `1px solid ${t.border}`, color: t.textMuted }}
            >
              Clear
            </button>
            <button
              onClick={runAnalysis}
              style={{ padding: '7px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8, background: t.accentDim, border: `1px solid ${t.accentBorder}`, color: t.accent, fontWeight: 700 }}
            >
              Re-run Analysis
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!result && !loading && !error && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🧠</div>
          <div style={{ color: t.textStrong, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            Ready to analyse your trading
          </div>
          <div style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.8, maxWidth: 480, margin: '0 auto' }}>
            Select a date range and click <strong style={{ color: t.accent }}>Run Analysis</strong>. Your AI coach will evaluate your win rate trends, identify your best and worst sessions, assess emotional patterns, rank your setups by performance, and give you specific, actionable improvement recommendations.
          </div>
          <div style={{ marginTop: 14, fontSize: 10, color: t.textDim }}>
            Each analysis costs ~$0.003 and runs server-side via your ANTHROPIC_API_KEY in Railway.
          </div>
        </div>
      )}

    </div>
  );
}
