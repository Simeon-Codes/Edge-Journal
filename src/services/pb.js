// services/pb.js — Clean PocketBase SDK Architecture
//
// Architecture: UI → PocketBase SDK → Railway PocketBase → stable API
//
// What this eliminates vs the old file:
//   ✗ pbFetch() — custom REST wrapper that guessed endpoint paths (source of 404s)
//   ✗ TokenStore — manual sessionStorage token management
//   ✗ clientRateLimit — rate limiting belongs on the backend, not the browser
//   ✗ scheduleTokenRefresh — SDK authStore handles refresh automatically
//   ✗ custom SSE/EventSource — SDK pb.collection().subscribe() does this natively
//   ✗ hashApiKey — crypto hashing stayed in browser, now only in backend hooks
//
// What is deliberately preserved (all method signatures are unchanged so no
// consumer file needs to be rewritten):
//   ✓ Auth.register / login / logout / getModel / isLoggedIn / getToken / requestPasswordReset
//   ✓ Trades.list / create / update / delete / uploadImages / getImageUrl / subscribe
//   ✓ Profiles.getMine / update
//   ✓ InvestorLinks.list / create / toggle / delete / getShareUrl
//   ✓ MT5Accounts.list / create / delete  (create still returns { apiKey, record })
//   ✓ JournalEntries.list / upsert / delete
//   ✓ computeStats()  — rich version with all fields Dashboard/Analytics depend on
//   ✓ sanitise() / sanitiseNumber() — kept as lightweight exports (used by AICoach etc.)

import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL;

if (!PB_URL) {
  throw new Error(
    'Missing VITE_PB_URL environment variable. ' +
    'Add it to your .env file: VITE_PB_URL=https://your-railway-app.up.railway.app'
  );
}

// ── Single source-of-truth client ─────────────────────────────────────────────
// One instance shared across the whole app. The SDK keeps auth state internally
// in pb.authStore — no manual token storage needed.
export const pb = new PocketBase(PB_URL);

// Disable the SDK's auto-cancel so rapid pagination calls don't cancel each other
pb.autoCancellation(false);

// ── Lightweight sanitisation helpers ─────────────────────────────────────────
// These are thin guards against accidental XSS from user-pasted text. The real
// security enforcement lives in PocketBase collection rules and pb_hooks/hooks.js.
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

// ── Secure random token (browser crypto) ─────────────────────────────────────
function generateSecureToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const Auth = {
  async register({ email, password, passwordConfirm, displayName }) {
    // ── Client-side validation — instant feedback before any network call ────────
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error('Invalid email address');
    if (!password || password.length < 8)
      throw new Error('Password must be at least 8 characters');
    if (password !== passwordConfirm)
      throw new Error('Passwords do not match');
    if (!displayName || displayName.trim().length < 2)
      throw new Error('Display name must be at least 2 characters');

    // ── Step 1: Create the user record ───────────────────────────────────────────
    await pb.collection('users').create({
      email:           sanitise(email, 200).toLowerCase(),
      password,
      passwordConfirm,
      name:            sanitise(displayName, 60),
    });

    // ── Step 2: Authenticate immediately ────────────────────────────────────────
    const authData = await this.login({ email, password });

    // ── Step 3: Guarantee the profile record exists ──────────────────────────────
    // The server-side hook (pb_hooks/hooks.js onRecordAfterCreateRequest) creates
    // the profile automatically. However two failure modes exist:
    //   a) Race condition — the frontend calls getMine() before the hook completes.
    //   b) Hook silently fails — collection schema mismatch, hook error, etc.
    //
    // Strategy: wait 1.5s for the hook, then check. If the profile still does not
    // exist, create it client-side as a guaranteed fallback. This makes registration
    // deterministic regardless of backend hook timing or failure.
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const existing = await Profiles.getMine();

      if (!existing) {
        // Hook did not fire or lost the race — create the profile ourselves.
        // Fields match exactly what pb_hooks/hooks.js sets so the app behaves
        // identically whether the hook created the record or we did.
        await pb.collection('profiles').create({
          user:                  pb.authStore.model.id,
          display_name:          sanitise(displayName, 60),
          tier:                  0,
          subscription_status:   'trial',
          trial_ends_at:         new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          investor_link_enabled: false,
          theme:                 'system',
          sidebar_collapsed:     false,
          ads_enabled:           true,
          default_lot_size:      0.01,
          default_currency:      'USD',
        });
      }
    } catch (profileErr) {
      // Profile check/creation failed — do not block the user.
      // AuthContext.loadProfile() retries on next render.
      console.error('[EDGE] Profile guarantee failed after registration:', profileErr);
    }

    return authData;
  },

  async login({ email, password }) {
    // SDK handles token storage, refresh scheduling, and authStore updates
    return pb.collection('users').authWithPassword(
      sanitise(email, 200).toLowerCase(),
      password
    );
  },

  logout() {
    pb.authStore.clear();
  },

  // getToken — called by AuthContext to pass JWT to custom pb_hooks endpoints
  // (e.g. /api/ai-coach). The SDK stores the token in pb.authStore.token.
  getToken() {
    return pb.authStore.token || null;
  },

  getModel() {
    return pb.authStore.model || null;
  },

  isLoggedIn() {
    return pb.authStore.isValid;
  },

  async requestPasswordReset(email) {
    return pb.collection('users').requestPasswordReset(
      sanitise(email, 200).toLowerCase()
    );
  },
};

// ── Profiles ──────────────────────────────────────────────────────────────────
export const Profiles = {
  async getMine() {
    const user = pb.authStore.model;
    if (!user) throw new Error('Not authenticated');

    const query = async () => {
      const res = await pb.collection('profiles').getList(1, 1, {
        filter: `user="${user.id}"`,
      });
      return res.items[0] || null;
    };

    // First attempt
    const profile = await query();
    if (profile) return profile;

    // If nothing came back — could be a hook race on a fresh registration.
    // Wait 2 seconds and try once more before returning null.
    await new Promise(resolve => setTimeout(resolve, 2000));
    return query();
  },

  async update(profileId, updates) {
    // Whitelist the fields that are safe to update from the client
    const allowed = [
      'display_name', 'theme', 'sidebar_collapsed', 'timezone',
      'default_lot_size', 'default_currency', 'ads_enabled',
      'investor_link_enabled',
    ];
    const safe = {};
    for (const key of allowed) {
      if (key in updates) safe[key] = updates[key];
    }
    return pb.collection('profiles').update(profileId, safe);
  },
};

// ── Trades ────────────────────────────────────────────────────────────────────
export const Trades = {
  async list({ page = 1, perPage = 50, filter = '', sort = '-trade_date' } = {}) {
    const user = pb.authStore.model;
    const userFilter  = `user="${user.id}"`;
    const finalFilter = filter ? `(${userFilter})&&(${filter})` : userFilter;

    return pb.collection('trades').getList(page, perPage, {
      sort,
      filter:  finalFilter,
      expand: 'mt5_account',
    });
  },

  async getOne(id) {
    return pb.collection('trades').getOne(id, { expand: 'mt5_account' });
  },

  async create(data) {
    const user = pb.authStore.model;
    return pb.collection('trades').create({
      ...sanitiseTrade(data),
      user:   user.id,
      source: data.source || 'manual',
    });
  },

  async update(id, data) {
    const safe = sanitiseTrade(data);
    // These fields must never be overwritten from the client
    delete safe.user;
    delete safe.source;
    delete safe.mt5_ticket;
    return pb.collection('trades').update(id, safe);
  },

  async delete(id) {
    return pb.collection('trades').delete(id);
  },

  async uploadImages(tradeId, files) {
    if (!files || files.length === 0) return;
    if (files.length > 2) throw new Error('Maximum 2 images per trade (before + after)');

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(`${file.name} exceeds the 5MB limit`);
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
        throw new Error(`${file.name} is not a supported image type`);
    }

    const fd = new FormData();
    files.forEach(f => fd.append('chart_images', f));
    // SDK accepts FormData directly — no manual Content-Type header needed
    return pb.collection('trades').update(tradeId, fd);
  },

  getImageUrl(tradeId, filename) {
    return pb.files.getURL({ id: tradeId, collectionName: 'trades' }, filename);
  },

  // Realtime subscription — uses SDK's native SSE, no custom EventSource needed.
  // Returns an unsubscribe function (call it on component unmount).
  async subscribe(userId, callback) {
    return pb.collection('trades').subscribe('*', (event) => {
      // Only forward events for this user's own trades
      if (event.record?.user === userId) callback(event);
    });
  },
};

// ── Investor Links ────────────────────────────────────────────────────────────
export const InvestorLinks = {
  async list() {
    const user = pb.authStore.model;
    return pb.collection('investor_links').getList(1, 50, {
      filter: `user="${user.id}"`,
      sort:   '-created',
    });
  },

  async create({ label, showPnl = true, showLotSize = false, expiresAt = null }) {
    const user = pb.authStore.model;
    if (!user) throw new Error('Not authenticated');

    const token = generateSecureToken(32);

    // All bool fields sent explicitly as true/false — PocketBase required:true
    // fields reject undefined or missing values with a 400 error.
    const payload = {
      user:          user.id,
      token,
      label:         sanitise(label, 60),
      is_active:     true,
      views:         0,
      show_pnl:      showPnl  === true || showPnl  === 'true'  ? true : false,
      show_lot_size: showLotSize === true || showLotSize === 'true' ? true : false,
    };
    // Only include optional date if provided — sending null to a date field
    // can cause schema validation errors in some PocketBase versions
    if (expiresAt) payload.expires_at = expiresAt;

    try {
      return await pb.collection('investor_links').create(payload);
    } catch (err) {
      // Surface the actual PocketBase validation message so it's visible in the UI
      // instead of the generic "Failed to create record"
      const detail = err?.data?.data
        ? Object.entries(err.data.data).map(([k,v]) => `${k}: ${v?.message||v}`).join(', ')
        : err?.data?.message || err?.message || 'Unknown error';
      throw new Error(detail);
    }
  },

  async toggle(id, isActive) {
    return pb.collection('investor_links').update(id, { is_active: isActive });
  },

  async delete(id) {
    return pb.collection('investor_links').delete(id);
  },

  getShareUrl(token) {
    return `${window.location.origin}/investor/${token}`;
  },
};

// ── MT5 Accounts ──────────────────────────────────────────────────────────────
export const MT5Accounts = {
  async list() {
    const user = pb.authStore.model;
    return pb.collection('mt5_accounts').getList(1, 50, {
      filter: `user="${user.id}"`,
    });
  },

  // Returns { apiKey, record } — the plain-text key is shown once to the user
  // so they can paste it into the MT5 EA. The backend hook hashes it on save.
  async create({ label, mt5Login, broker, server }) {
    const user   = pb.authStore.model;
    const apiKey = generateSecureToken(40);

    const record = await pb.collection('mt5_accounts').create({
      user:          user.id,
      account_label: sanitise(label,    60),
      mt5_login:     sanitise(mt5Login, 30),
      broker:        sanitise(broker,   100),
      server:        sanitise(server,   100),
      // api_key_hash is computed server-side in pb_hooks/hooks.js on beforeCreate
      // We send the plain key here so the hook can hash it and discard the plain text
      api_key_plain: apiKey,
      is_active:     true,
      sync_enabled:  true,
    });

    return { apiKey, record };
  },

  async delete(id) {
    return pb.collection('mt5_accounts').delete(id);
  },
};

// ── Journal Entries ───────────────────────────────────────────────────────────
export const JournalEntries = {
  async list(page = 1) {
    const user = pb.authStore.model;
    return pb.collection('journal_entries').getList(page, 30, {
      filter: `user="${user.id}"`,
      sort:   '-entry_date',
    });
  },

  async upsert(data) {
    const user = pb.authStore.model;
    const safe = {
      user:         user.id,
      entry_date:   sanitise(data.entry_date, 20),
      title:        sanitise(data.title,      120),
      content:      sanitise(data.content,    10000),
      market_bias:  data.market_bias || null,
      mood:         sanitiseNumber(data.mood, 1, 10),
      tags:         Array.isArray(data.tags)
                      ? data.tags.slice(0, 20).map(t => sanitise(t, 30))
                      : [],
    };

    if (data.id) {
      return pb.collection('journal_entries').update(data.id, safe);
    }
    return pb.collection('journal_entries').create(safe);
  },

  async delete(id) {
    return pb.collection('journal_entries').delete(id);
  },
};

// ── Stats computation ─────────────────────────────────────────────────────────
// Rich version — all fields required by Dashboard, Analytics, and AICoach.
// The minimal version in the guide omits fields that existing components depend on.
export function computeStats(trades = []) {
  if (!trades.length) return {
    totalTrades: 0, wins: 0, losses: 0, breakeven: 0,
    winRate: '0.0', totalPnl: '0.00', avgPnl: '0.00',
    avgRR: '0.00', bestTrade: '0.00', worstTrade: '0.00',
    planFollowed: 0, planFollowRate: '0.0',
    profitFactor: '0.00', grossProfit: '0.00', grossLoss: '0.00',
  };

  const wins      = trades.filter(t => Number(t.pnl) > 0);
  const losses    = trades.filter(t => Number(t.pnl) < 0);
  const totalPnl  = trades.reduce((a, b) => a + Number(b.pnl  || 0), 0);
  const grossProfit = wins.reduce((a, b)   => a + Number(b.pnl  || 0), 0);
  const grossLoss   = Math.abs(losses.reduce((a, b) => a + Number(b.pnl || 0), 0));
  const followed    = trades.filter(t => t.followed_plan);

  return {
    totalTrades:    trades.length,
    wins:           wins.length,
    losses:         losses.length,
    breakeven:      trades.length - wins.length - losses.length,
    winRate:        (wins.length / trades.length * 100).toFixed(1),
    totalPnl:       totalPnl.toFixed(2),
    avgPnl:         (totalPnl / trades.length).toFixed(2),
    avgRR:          (trades.reduce((a, b) => a + Number(b.rr || 0), 0) / trades.length).toFixed(2),
    bestTrade:      Math.max(...trades.map(t => Number(t.pnl || 0))).toFixed(2),
    worstTrade:     Math.min(...trades.map(t => Number(t.pnl || 0))).toFixed(2),
    planFollowed:   followed.length,
    planFollowRate: (followed.length / trades.length * 100).toFixed(1),
    profitFactor:   grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '∞',
    grossProfit:    grossProfit.toFixed(2),
    grossLoss:      grossLoss.toFixed(2),
  };
}

// ── Internal trade sanitiser ──────────────────────────────────────────────────
function sanitiseTrade(t) {
  const safe = {};
  if (t.trade_date)            safe.trade_date   = sanitise(t.trade_date, 20);
  if (t.trade_time)            safe.trade_time   = sanitise(t.trade_time, 10);
  if (t.pair)                  safe.pair         = sanitise(t.pair, 20).toUpperCase();
  if (t.direction)             safe.direction    = ['LONG','SHORT'].includes(t.direction) ? t.direction : 'LONG';
  if (t.session)               safe.session      = sanitise(t.session, 30);
  if (t.setup)                 safe.setup        = sanitise(t.setup, 60);
  if (t.entry_price !== undefined) safe.entry_price = sanitiseNumber(t.entry_price, 0, 999999);
  if (t.exit_price  !== undefined) safe.exit_price  = sanitiseNumber(t.exit_price,  0, 999999);
  if (t.sl          !== undefined) safe.sl           = sanitiseNumber(t.sl,          0, 999999);
  if (t.tp          !== undefined) safe.tp           = sanitiseNumber(t.tp,          0, 999999);
  if (t.lot_size    !== undefined) safe.lot_size     = sanitiseNumber(t.lot_size,    0, 10000);
  if (t.rr          !== undefined) safe.rr           = sanitiseNumber(t.rr,          0, 1000);
  if (t.pnl         !== undefined) safe.pnl          = sanitiseNumber(t.pnl,         -999999, 999999);
  if (t.pips        !== undefined) safe.pips         = sanitiseNumber(t.pips,        -99999,  99999);
  if (t.emotions)                  safe.emotions     = sanitise(t.emotions, 30);
  if (t.followed_plan !== undefined) safe.followed_plan = Boolean(t.followed_plan);
  if (t.mistakes)                  safe.mistakes     = sanitise(t.mistakes, 1000);
  if (t.notes)                     safe.notes        = sanitise(t.notes, 5000);
  if (t.grade)                     safe.grade        = sanitise(t.grade, 5);
  if (t.is_open !== undefined)     safe.is_open      = Boolean(t.is_open);
  if (t.tags)                      safe.tags         = Array.isArray(t.tags)
    ? t.tags.slice(0, 30).map(x => sanitise(x, 30)) : [];
  return safe;
}

export default {
  pb,
  Auth, Profiles, Trades, InvestorLinks, MT5Accounts, JournalEntries,
  sanitise, sanitiseNumber, computeStats,
};
