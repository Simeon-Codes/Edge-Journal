import { useState, useEffect, useCallback, useRef } from 'react';
import { Trades, computeStats } from '../services/pb.js';
import { useAuth } from '../contexts/AuthContext.jsx';

// ── Tier definitions — competitive market pricing ─────────────────────────────
// Tiers 0-4. Legacy tier 5 (old $500/mo) maps to tier 4 (Elite) going forward.
// Backend (pb_hooks/hooks.js) LIMITS object must stay in sync with this.
export const TIER_LIMITS = {
  0: { trades: 10,   lots: 5,    label: 'Trial (14 days)', price: 'Free',   badge: 'TRIAL'    },
  1: { trades: 3,    lots: 0.5,  label: 'Starter',         price: 'Free',   badge: 'FREE'     },
  2: { trades: 20,   lots: 20,   label: 'Pro',             price: '$19/mo', badge: 'PRO'      },
  3: { trades: 50,   lots: 50,   label: 'Advanced',        price: '$39/mo', badge: 'ADVANCED' },
  4: { trades: 9999, lots: 9999, label: 'Elite',           price: '$69/mo', badge: 'ELITE'    },
};

export const useTrades = () => {
  const { user, tier } = useAuth();
  const [trades, setTrades]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage]       = useState(1);
  const unsubRef              = useRef(null);

  const load = useCallback(async (pageNum = 1, append = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await Trades.list({ page: pageNum, perPage: 200, sort: '-trade_date' });
      const items = data.items || [];
      setTrades(prev => append ? [...prev, ...items] : items);
      setHasMore(data.totalPages > pageNum);
      setPage(pageNum);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load(1);
    if (user) {
      unsubRef.current = Trades.subscribe(user.id, (event) => {
        if (event.action === 'create') setTrades(prev => [event.record, ...prev]);
        else if (event.action === 'update') setTrades(prev => prev.map(t => t.id === event.record.id ? event.record : t));
        else if (event.action === 'delete') setTrades(prev => prev.filter(t => t.id !== event.record.id));
      });
    }
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [user, load]);

  const checkTierLimit = useCallback((lotSize = 0) => {
    const limits = TIER_LIMITS[tier] || TIER_LIMITS[0];
    const today  = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter(t => t.source === 'manual' && (t.trade_date||'').slice(0,10) === today);
    const todayLots   = todayTrades.reduce((a, b) => a + Number(b.lot_size || 0), 0);
    return {
      allowed:    todayTrades.length < limits.trades && (todayLots + Number(lotSize)) <= limits.lots,
      overTrades: todayTrades.length >= limits.trades,
      overLots:   todayLots + Number(lotSize) > limits.lots,
      current:    { trades: todayTrades.length, lots: todayLots },
      limits,
      tier,
    };
  }, [trades, tier]);

  const addTrade = useCallback(async (data) => {
    const check = checkTierLimit(data.lot_size);
    if (!check.allowed) {
      const reason = check.overTrades
        ? `Daily trade limit reached (${check.limits.trades}/day on ${check.limits.label})`
        : `Daily lot limit reached (${check.limits.lots} lots/day on ${check.limits.label})`;
      throw new Error(`${reason}. Please upgrade your plan.`);
    }
    const trade = await Trades.create({ ...data, source: 'manual' });
    setTrades(prev => [trade, ...prev]);
    return trade;
  }, [checkTierLimit]);

  const editTrade = useCallback(async (id, updates) => {
    const updated = await Trades.update(id, updates);
    setTrades(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
    return updated;
  }, []);

  const removeTrade = useCallback(async (id) => {
    await Trades.delete(id);
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  const uploadImages = useCallback(async (tradeId, files) => {
    const updated = await Trades.uploadImages(tradeId, files);
    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, ...updated } : t));
    return updated;
  }, []);

  return {
    trades, loading, error, hasMore,
    loadMore: () => { if (hasMore && !loading) load(page + 1, true); },
    addTrade, editTrade, removeTrade, uploadImages,
    reload: () => load(1),
    stats: computeStats(trades),
    checkTierLimit,
    tierLimits: TIER_LIMITS[tier] || TIER_LIMITS[0],
    getImageUrl: Trades.getImageUrl,
  };
};
