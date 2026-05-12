/// <reference path="../pb_data/types.d.ts" />

// Migration: 001_initial_schema
// Creates all collections with security rules for EDGE Journal

migrate((db) => {

  // ── 1. USERS (extends built-in auth) ─────────────────────────────────────
  // PocketBase has built-in _pb_users_auth_ — we extend via profile collection
  const profiles = new Collection({
    id: "profiles",
    name: "profiles",
    type: "base",
    system: false,
    schema: [
      { name: "user",         type: "relation", required: true,  options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "display_name", type: "text",     required: true,  options: { min: 1, max: 60 } },
      { name: "tier",         type: "number",   required: true,  options: { min: 0, max: 5 } },  // 0 = free/trial
      { name: "stripe_customer_id", type: "text", required: false },
      { name: "stripe_subscription_id", type: "text", required: false },
      { name: "subscription_status", type: "select", required: true, options: { values: ["trial","active","past_due","canceled","paused"] } },
      { name: "trial_ends_at",  type: "date",   required: false },
      { name: "investor_password_hash", type: "text", required: false },
      { name: "investor_link_enabled", type: "bool", required: true },
      { name: "theme",         type: "select",  required: true,  options: { values: ["dark","light","system"] } },
      { name: "sidebar_collapsed", type: "bool", required: true },
      { name: "ads_enabled",   type: "bool",    required: true },
      { name: "timezone",      type: "text",    required: false, options: { max: 60 } },
      { name: "default_lot_size", type: "number", required: false },
      { name: "default_currency", type: "text", required: false, options: { max: 10 } },
    ],
    listRule:   "@request.auth.id != '' && @request.auth.id = user",
    viewRule:   "@request.auth.id != '' && @request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && @request.auth.id = user",
    deleteRule: null, // prevent deletion
  });

  // ── 2. MT5 ACCOUNTS ───────────────────────────────────────────────────────
  const mt5Accounts = new Collection({
    id: "mt5_accounts",
    name: "mt5_accounts",
    type: "base",
    schema: [
      { name: "user",          type: "relation", required: true,  options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "account_label", type: "text",     required: true,  options: { max: 60 } },
      { name: "mt5_login",     type: "text",     required: true,  options: { max: 30 } },
      { name: "broker",        type: "text",     required: false, options: { max: 100 } },
      { name: "server",        type: "text",     required: false, options: { max: 100 } },
      { name: "api_key_hash",  type: "text",     required: true  }, // hashed EA api key
      { name: "is_active",     type: "bool",     required: true  },
      { name: "last_sync",     type: "date",     required: false },
      { name: "sync_enabled",  type: "bool",     required: true  },
      { name: "currency",      type: "text",     required: false, options: { max: 10 } },
      { name: "balance",       type: "number",   required: false },
      { name: "equity",        type: "number",   required: false },
    ],
    listRule:   "@request.auth.id != '' && user = @request.auth.id",
    viewRule:   "@request.auth.id != '' && user = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
  });

  // ── 3. TRADES ─────────────────────────────────────────────────────────────
  const trades = new Collection({
    id: "trades",
    name: "trades",
    type: "base",
    schema: [
      { name: "user",          type: "relation", required: true,  options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "mt5_account",   type: "relation", required: false, options: { collectionId: "mt5_accounts", maxSelect: 1 } },
      { name: "mt5_ticket",    type: "text",     required: false, options: { max: 30 } }, // MT5 ticket number
      { name: "source",        type: "select",   required: true,  options: { values: ["manual","mt5_ea","mt5_import"] } },
      // Core trade data
      { name: "trade_date",    type: "date",     required: true  },
      { name: "trade_time",    type: "text",     required: false, options: { max: 10 } },
      { name: "pair",          type: "text",     required: true,  options: { max: 20 } },
      { name: "direction",     type: "select",   required: true,  options: { values: ["LONG","SHORT"] } },
      { name: "session",       type: "text",     required: false, options: { max: 30 } },
      { name: "setup",         type: "text",     required: false, options: { max: 60 } },
      // Prices
      { name: "entry_price",   type: "number",   required: true  },
      { name: "exit_price",    type: "number",   required: false },
      { name: "sl",            type: "number",   required: false },
      { name: "tp",            type: "number",   required: false },
      { name: "lot_size",      type: "number",   required: true  },
      // Results
      { name: "rr",            type: "number",   required: false },
      { name: "pnl",           type: "number",   required: false },
      { name: "pips",          type: "number",   required: false },
      { name: "commission",    type: "number",   required: false },
      { name: "swap",          type: "number",   required: false },
      // Journal
      { name: "emotions",      type: "text",     required: false, options: { max: 30 } },
      { name: "followed_plan", type: "bool",     required: false },
      { name: "mistakes",      type: "text",     required: false, options: { max: 1000 } },
      { name: "notes",         type: "text",     required: false, options: { max: 5000 } },
      { name: "tags",          type: "json",     required: false },
      { name: "grade",         type: "text",     required: false, options: { max: 5 } },
      // Images (max 2: before + after)
      { name: "chart_images",  type: "file",     required: false, options: { maxSelect: 2, maxSize: 5242880, mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"] } },
      // Status
      { name: "is_open",       type: "bool",     required: true  },
      { name: "closed_at",     type: "date",     required: false },
    ],
    listRule:   "@request.auth.id != '' && user = @request.auth.id",
    viewRule:   "(@request.auth.id != '' && user = @request.auth.id) || @request.query.investor_token != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user = @request.auth.id && source = 'manual'",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
  });

  // ── 4. JOURNAL ENTRIES (daily notes) ─────────────────────────────────────
  const journal = new Collection({
    id: "journal_entries",
    name: "journal_entries",
    type: "base",
    schema: [
      { name: "user",          type: "relation", required: true,  options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "entry_date",    type: "date",     required: true  },
      { name: "title",         type: "text",     required: false, options: { max: 120 } },
      { name: "content",       type: "text",     required: false, options: { max: 10000 } },
      { name: "market_bias",   type: "select",   required: false, options: { values: ["bullish","bearish","neutral","ranging"] } },
      { name: "mood",          type: "number",   required: false, options: { min: 1, max: 10 } },
      { name: "tags",          type: "json",     required: false },
    ],
    listRule:   "@request.auth.id != '' && user = @request.auth.id",
    viewRule:   "@request.auth.id != '' && user = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
  });

  // ── 5. INVESTOR LINKS ─────────────────────────────────────────────────────
  const investorLinks = new Collection({
    id: "investor_links",
    name: "investor_links",
    type: "base",
    schema: [
      { name: "user",          type: "relation", required: true,  options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "token",         type: "text",     required: true  }, // unique URL token
      { name: "label",         type: "text",     required: false, options: { max: 60 } },
      { name: "is_active",     type: "bool",     required: true  },
      { name: "expires_at",    type: "date",     required: false },
      { name: "views",         type: "number",   required: true  },
      { name: "last_viewed",   type: "date",     required: false },
      { name: "show_pnl",      type: "bool",     required: true  },
      { name: "show_lot_size", type: "bool",     required: true  },
      { name: "password_hash", type: "text",     required: false }, // optional link password
    ],
    listRule:   "@request.auth.id != '' && user = @request.auth.id",
    viewRule:   "user = @request.auth.id || @request.query.token != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
  });

  // ── 6. SUBSCRIPTIONS / TIER USAGE TRACKING ────────────────────────────────
  const usageLogs = new Collection({
    id: "usage_logs",
    name: "usage_logs",
    type: "base",
    schema: [
      { name: "user",          type: "relation", required: true,  options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "log_date",      type: "date",     required: true  },
      { name: "trades_count",  type: "number",   required: true  },
      { name: "total_lots",    type: "number",   required: true  },
      { name: "tier_at_time",  type: "number",   required: true  },
      { name: "over_limit",    type: "bool",     required: true  },
    ],
    listRule:   "@request.auth.id != '' && user = @request.auth.id",
    viewRule:   "@request.auth.id != '' && user = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: null,
  });

  // ── 7. SYNC LOGS (MT5 EA activity) ───────────────────────────────────────
  const syncLogs = new Collection({
    id: "sync_logs",
    name: "sync_logs",
    type: "base",
    schema: [
      { name: "mt5_account",  type: "relation", required: true,  options: { collectionId: "mt5_accounts", cascadeDelete: true, maxSelect: 1 } },
      { name: "event_type",   type: "select",   required: true,  options: { values: ["connect","disconnect","trade_open","trade_close","trade_modify","full_sync","error"] } },
      { name: "payload",      type: "json",     required: false },
      { name: "error_msg",    type: "text",     required: false, options: { max: 500 } },
      { name: "ip_address",   type: "text",     required: false, options: { max: 50 } },
    ],
    listRule:   null,
    viewRule:   null,
    createRule: "", // only via API key in hook
    updateRule: null,
    deleteRule: null,
  });

  db.save(profiles);
  db.save(mt5Accounts);
  db.save(trades);
  db.save(journal);
  db.save(investorLinks);
  db.save(usageLogs);
  db.save(syncLogs);

}, (db) => {
  // Rollback
  ["sync_logs","usage_logs","investor_links","journal_entries","trades","mt5_accounts","profiles"].forEach(name => {
    try { db.deleteCollection(name); } catch(e) {}
  });
});
