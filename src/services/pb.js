// services/pb.js — PocketBase client with security hardening

const PB_URL = import.meta.env.VITE_PB_URL;

// ── Token storage (memory-first, sessionStorage fallback) ─────────────────────
let _token = null;
let _refreshTimer = null;

const TokenStore = {
  get: () => _token || sessionStorage.getItem('pb_token'),
  set: (t) => { _token = t; sessionStorage.setItem('pb_token', t); },
  clear: () => { _token = null; sessionStorage.removeItem('pb_token'); sessionStorage.removeItem('pb_model'); },
  getModel: () => { try { return JSON.parse(sessionStorage.getItem('pb_model') || 'null'); } catch { return null; } },
  setModel: (m) => sessionStorage.setItem('pb_model', JSON.stringify(m)),
};

// ── Rate limit tracker (client-side guard) ────────────────────────────────────
const clientRateLimit = (() => {
  const counts = new Map();
  return (key, max = 10, windowMs = 60000) => {
    const now = Date.now();
    const entry = counts.get(key) || { n: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.n = 0; entry.reset = now + windowMs; }
    entry.n++;
    counts.set(key, entry);
    return entry.n > max;
  };
})();

// ── Input sanitisation ────────────────────────────────────────────────────────
export const sanitise = (val, maxLen = 1000) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .slice(0, maxLen)
    .trim();
};

export const sanitiseNumber = (val, min = -999999, max = 999999) => {
  const n = parseFloat(val);
  if (isNaN(n)) return 0;
  return Math.min(max, Math.max(min, n));
};

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function pbFetch(path, options = {}) {
  const url = `${PB_URL}${path}`;
  const token = TokenStore.get();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: token } : {}),
    ...options.headers,
  };

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) delete headers['Content-Type'];

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    throw new Error('Network error — check your connection');
  }

  // Handle 429 rate limit from server
  if (res.status === 429) throw new Error('Too many requests. Please wait a moment.');

  // Handle 401 — token expired
  if (res.status === 401) {
    TokenStore.clear();
    window.dispatchEvent(new CustomEvent('pb:logout'));
    throw new Error('Session expired. Please sign in again.');
  }

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = { message: await res.text() };
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const Auth = {
  async register({ email, password, passwordConfirm, displayName }) {
    if (clientRateLimit('register', 5, 300000)) throw new Error('Too many registration attempts');

    // Validate inputs
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email address');
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== passwordConfirm) throw new Error('Passwords do not match');
    if (!displayName || displayName.trim().length < 2) throw new Error('Display name must be at least 2 characters');
    if (password.toLowerCase().includes('password') || password.toLowerCase().includes('123456')) {
      throw new Error('Password is too weak');
    }

    const data = await pbFetch('/api/collections/users/records', {
      method: 'POST',
      body: JSON.stringify({
        email: sanitise(email, 200).toLowerCase(),
        password,
        passwordConfirm,
        name: sanitise(displayName, 60),
      }),
    });

    // Auto-login after register
    return Auth.login({ email, password });
  },

  async login({ email, password }) {
    if (clientRateLimit('login', 10, 60000)) throw new Error('Too many login attempts. Wait 1 minute.');

    const data = await pbFetch('/api/collections/users/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({
        identity: sanitise(email, 200).toLowerCase(),
        password,
      }),
    });

    TokenStore.set(data.token);
    TokenStore.setModel(data.record);
    scheduleTokenRefresh();
    return data;
  },

  async refreshToken() {
    if (!TokenStore.get()) return;
    try {
      const data = await pbFetch('/api/collections/users/auth-refresh', { method: 'POST' });
      TokenStore.set(data.token);
      TokenStore.setModel(data.record);
    } catch (e) {
      TokenStore.clear();
    }
  },

  logout() {
    TokenStore.clear();
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = null;
  },

  getToken: () => TokenStore.get(),
  getModel: () => TokenStore.getModel(),
  isLoggedIn: () => !!TokenStore.get(),

  async requestPasswordReset(email) {
    if (clientRateLimit('pwreset', 3, 300000)) throw new Error('Too many reset attempts');
    return pbFetch('/api/collections/users/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: sanitise(email, 200).toLowerCase() }),
    });
  },
};

function scheduleTokenRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  // Refresh every 25 minutes (tokens expire at 30 min by default)
  _refreshTimer = setTimeout(async () => {
    await Auth.refreshToken();
    scheduleTokenRefresh();
  }, 25 * 60 * 1000);
}

// Auto-restore session
if (TokenStore.get()) scheduleTokenRefresh();

// ── Profile ───────────────────────────────────────────────────────────────────
export const Profiles = {
  async getMine() {
    const model = Auth.getModel();
    if (!model) throw new Error('Not authenticated');
    const data = await pbFetch(`/api/collections/profiles/records?filter=user="${model.id}"&expand=user`);
    return data.items?.[0] || null;
  },

  async update(profileId, updates) {
    const allowed = ['display_name','theme','sidebar_collapsed','timezone','default_lot_size','default_currency','ads_enabled','investor_link_enabled'];
    const safe = {};
    for (const key of allowed) {
      if (key in updates) safe[key] = updates[key];
    }
    return pbFetch(`/api/collections/profiles/records/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify(safe),
    });
  },
};

// ── Trades ────────────────────────────────────────────────────────────────────
export const Trades = {
  async list({ page = 1, perPage = 50, filter = '', sort = '-trade_date' } = {}) {
    const model = Auth.getModel();
    const userFilter = `user="${model.id}"`;
    const fullFilter = filter ? `${userFilter}&&${filter}` : userFilter;
    const params = new URLSearchParams({
      page, perPage, sort,
      filter: fullFilter,
      expand: 'mt5_account',
    });
    return pbFetch(`/api/collections/trades/records?${params}`);
  },

  async getOne(id) {
    const model = Auth.getModel();
    const data = await pbFetch(`/api/collections/trades/records/${id}?expand=mt5_account`);
    if (data.user !== model.id) throw new Error('Unauthorised');
    return data;
  },

  async create(tradeData) {
    const model = Auth.getModel();
    const safe = sanitiseTrade(tradeData, model.id);
    return pbFetch('/api/collections/trades/records', {
      method: 'POST',
      body: JSON.stringify(safe),
    });
  },

  async update(id, updates) {
    const safe = sanitiseTrade(updates);
    // Don't allow changing user or source via client
    delete safe.user;
    delete safe.source;
    delete safe.mt5_ticket;
    return pbFetch(`/api/collections/trades/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(safe),
    });
  },

  async delete(id) {
    return pbFetch(`/api/collections/trades/records/${id}`, { method: 'DELETE' });
  },

  async uploadImages(tradeId, files) {
    if (!files || files.length === 0) return;
    if (files.length > 2) throw new Error('Maximum 2 images per trade (before + after)');

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds 5MB limit`);
      if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) {
        throw new Error(`${file.name} is not a supported image type`);
      }
    }

    const fd = new FormData();
    files.forEach(f => fd.append('chart_images', f));
    return pbFetch(`/api/collections/trades/records/${tradeId}`, {
      method: 'PATCH',
      body: fd,
    });
  },

  getImageUrl(tradeId, filename) {
    return `${PB_URL}/api/files/trades/${tradeId}/${filename}`;
  },

  async getStats(userId) {
    // Fetch all trades for stats computation
    const params = new URLSearchParams({
      filter: `user="${userId}"`,
      perPage: 500,
      fields: 'pnl,rr,lot_size,direction,followed_plan,trade_date,session,setup,grade,pair,pips',
    });
    const data = await pbFetch(`/api/collections/trades/records?${params}`);
    return computeStats(data.items || []);
  },

  // Realtime subscription
  subscribe(userId, callback) {
    return subscribeRealtime(`trades`, (e) => {
      if (e.record?.user === userId) callback(e);
    });
  },
};

// ── Investor Links ────────────────────────────────────────────────────────────
export const InvestorLinks = {
  async list() {
    const model = Auth.getModel();
    return pbFetch(`/api/collections/investor_links/records?filter=user="${model.id}"&sort=-created`);
  },

  async create({ label, showPnl = true, showLotSize = false, expiresAt = null }) {
    const model = Auth.getModel();
    const token = generateSecureToken(32);
    return pbFetch('/api/collections/investor_links/records', {
      method: 'POST',
      body: JSON.stringify({
        user: model.id,
        token,
        label: sanitise(label, 60),
        is_active: true,
        views: 0,
        show_pnl: showPnl,
        show_lot_size: showLotSize,
        expires_at: expiresAt,
      }),
    });
  },

  async toggle(id, isActive) {
    return pbFetch(`/api/collections/investor_links/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
  },

  async delete(id) {
    return pbFetch(`/api/collections/investor_links/records/${id}`, { method: 'DELETE' });
  },

  getShareUrl(token) {
    return `${window.location.origin}/investor/${token}`;
  },
};

// ── MT5 Accounts ──────────────────────────────────────────────────────────────
export const MT5Accounts = {
  async list() {
    const model = Auth.getModel();
    return pbFetch(`/api/collections/mt5_accounts/records?filter=user="${model.id}"`);
  },

  async create({ label, mt5Login, broker, server }) {
    const model = Auth.getModel();
    // Generate a unique API key for this EA instance
    const apiKey = generateSecureToken(40);
    // We store the hash server-side, return plain key once to user
    return { apiKey, record: await pbFetch('/api/collections/mt5_accounts/records', {
      method: 'POST',
      body: JSON.stringify({
        user: model.id,
        account_label: sanitise(label, 60),
        mt5_login: sanitise(mt5Login, 30),
        broker: sanitise(broker, 100),
        server: sanitise(server, 100),
        api_key_hash: await hashApiKey(apiKey),
        is_active: true,
        sync_enabled: true,
      }),
    })};
  },

  async delete(id) {
    return pbFetch(`/api/collections/mt5_accounts/records/${id}`, { method: 'DELETE' });
  },
};

// ── Journal Entries ───────────────────────────────────────────────────────────
export const JournalEntries = {
  async list(page = 1) {
    const model = Auth.getModel();
    return pbFetch(`/api/collections/journal_entries/records?filter=user="${model.id}"&sort=-entry_date&page=${page}&perPage=30`);
  },

  async upsert(data) {
    const model = Auth.getModel();
    const safe = {
      user: model.id,
      entry_date: sanitise(data.entry_date, 20),
      title: sanitise(data.title, 120),
      content: sanitise(data.content, 10000),
      market_bias: data.market_bias || null,
      mood: sanitiseNumber(data.mood, 1, 10),
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 20).map(t => sanitise(t, 30)) : [],
    };
    if (data.id) {
      return pbFetch(`/api/collections/journal_entries/records/${data.id}`, {
        method: 'PATCH', body: JSON.stringify(safe),
      });
    }
    return pbFetch('/api/collections/journal_entries/records', {
      method: 'POST', body: JSON.stringify(safe),
    });
  },

  async delete(id) {
    return pbFetch(`/api/collections/journal_entries/records/${id}`, { method: 'DELETE' });
  },
};

// ── Realtime ──────────────────────────────────────────────────────────────────
const realtimeCallbacks = new Map();
let evtSource = null;

function subscribeRealtime(collection, callback) {
  const token = TokenStore.get();
  if (!token) return () => {};

  const key = `${collection}_${Date.now()}`;
  realtimeCallbacks.set(key, { collection, callback });

  // Use SSE for realtime
  if (!evtSource || evtSource.readyState === EventSource.CLOSED) {
    evtSource = new EventSource(`${PB_URL}/api/realtime?token=${token}`);
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        realtimeCallbacks.forEach(({ collection: col, callback: cb }) => {
          if (data.collection === col) cb(data);
        });
      } catch {}
    };
  }

  return () => realtimeCallbacks.delete(key);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitiseTrade(t, userId) {
  const safe = {};
  if (userId) safe.user = userId;
  if (!t.source) safe.source = 'manual';
  if (t.trade_date) safe.trade_date = sanitise(t.trade_date, 20);
  if (t.trade_time) safe.trade_time = sanitise(t.trade_time, 10);
  if (t.pair)       safe.pair = sanitise(t.pair, 20).toUpperCase();
  if (t.direction)  safe.direction = ['LONG','SHORT'].includes(t.direction) ? t.direction : 'LONG';
  if (t.session)    safe.session = sanitise(t.session, 30);
  if (t.setup)      safe.setup = sanitise(t.setup, 60);
  if (t.entry_price !== undefined) safe.entry_price = sanitiseNumber(t.entry_price, 0, 999999);
  if (t.exit_price  !== undefined) safe.exit_price  = sanitiseNumber(t.exit_price,  0, 999999);
  if (t.sl          !== undefined) safe.sl           = sanitiseNumber(t.sl,          0, 999999);
  if (t.tp          !== undefined) safe.tp           = sanitiseNumber(t.tp,          0, 999999);
  if (t.lot_size    !== undefined) safe.lot_size     = sanitiseNumber(t.lot_size,    0, 10000);
  if (t.rr          !== undefined) safe.rr           = sanitiseNumber(t.rr,          0, 1000);
  if (t.pnl         !== undefined) safe.pnl          = sanitiseNumber(t.pnl,         -999999, 999999);
  if (t.pips        !== undefined) safe.pips         = sanitiseNumber(t.pips,        -99999,  99999);
  if (t.emotions)   safe.emotions    = sanitise(t.emotions, 30);
  if (t.followed_plan !== undefined) safe.followed_plan = Boolean(t.followed_plan);
  if (t.mistakes)   safe.mistakes    = sanitise(t.mistakes, 1000);
  if (t.notes)      safe.notes       = sanitise(t.notes, 5000);
  if (t.grade)      safe.grade       = sanitise(t.grade, 5);
  if (t.is_open !== undefined) safe.is_open = Boolean(t.is_open);
  if (t.tags)       safe.tags        = Array.isArray(t.tags) ? t.tags.slice(0, 30).map(x => sanitise(x, 30)) : [];
  return safe;
}

function generateSecureToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashApiKey(key) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(key));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function computeStats(trades = []) {
  if (!trades.length) return {
    totalTrades: 0, wins: 0, losses: 0, breakeven: 0,
    winRate: '0.0', totalPnl: '0.00', avgPnl: '0.00',
    avgRR: '0.00', bestTrade: '0.00', worstTrade: '0.00',
    planFollowed: 0, planFollowRate: '0.0', profitFactor: '0.00',
    grossProfit: '0.00', grossLoss: '0.00',
  };
  const wins   = trades.filter(t => Number(t.pnl) > 0);
  const losses = trades.filter(t => Number(t.pnl) < 0);
  const totalPnl     = trades.reduce((a, b) => a + Number(b.pnl  || 0), 0);
  const grossProfit  = wins.reduce((a, b)   => a + Number(b.pnl  || 0), 0);
  const grossLoss    = Math.abs(losses.reduce((a, b) => a + Number(b.pnl || 0), 0));
  const followed     = trades.filter(t => t.followed_plan);
  return {
    totalTrades: trades.length,
    wins: wins.length, losses: losses.length,
    breakeven: trades.length - wins.length - losses.length,
    winRate:         (wins.length / trades.length * 100).toFixed(1),
    totalPnl:        totalPnl.toFixed(2),
    avgPnl:          (totalPnl / trades.length).toFixed(2),
    avgRR:           (trades.reduce((a, b) => a + Number(b.rr || 0), 0) / trades.length).toFixed(2),
    bestTrade:       Math.max(...trades.map(t => Number(t.pnl || 0))).toFixed(2),
    worstTrade:      Math.min(...trades.map(t => Number(t.pnl || 0))).toFixed(2),
    planFollowed:    followed.length,
    planFollowRate:  (followed.length / trades.length * 100).toFixed(1),
    profitFactor:    grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '∞',
    grossProfit:     grossProfit.toFixed(2),
    grossLoss:       grossLoss.toFixed(2),
  };
}

export default { Auth, Profiles, Trades, InvestorLinks, MT5Accounts, JournalEntries, sanitise, sanitiseNumber, computeStats };
