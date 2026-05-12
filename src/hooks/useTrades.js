import { useState, useEffect, useCallback, useRef } from 'react';
import { Trades, computeStats } from '../services/pb.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export const TIER_LIMITS = {
  0: { trades: 3,    lots: 0.5,  label: 'Free Trial',      price: 'Free' },
  1: { trades: 5,    lots: 1,    label: 'Tier 1',          price: '$50/mo' },
  2: { trades: 10,   lots: 5,    label: 'Tier 2',          price: '$100/mo' },
  3: { trades: 15,   lots: 10,   label: 'Tier 3',          price: '$200/mo' },
  4: { trades: 20,   lots: 20,   label: 'Tier 4',          price: '$300/mo' },
  5: { trades: 9999, lots: 9999, label: 'Tier 5 — Pro',    price: '$500/mo' },
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
