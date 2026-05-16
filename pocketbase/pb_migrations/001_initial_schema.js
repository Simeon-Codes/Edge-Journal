/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration : 001_initial_schema
 * App       : EDGE Journal
 *
 * Written for the CURRENT PocketBase JS migration API:
 *   migrate((app) => { ... app.save(collection) ... })
 *
 * Your Dockerfile was pinned to v0.22.4 which uses a completely different
 * API (new Dao(db), dao.saveCollection, etc.) — that entire API was removed
 * in v0.23+.  Update your Dockerfile to download the latest PocketBase binary
 * so this migration works correctly.
 *
 * Dockerfile change required — replace your wget line with:
 *   ARG PB_VERSION=0.28.2
 *   RUN wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
 *       && unzip pocketbase_${PB_VERSION}_linux_amd64.zip ...
 *
 * Collections (FK-dependency order):
 *   1. profiles         – 1-to-1 extension of built-in users auth
 *   2. mt5_accounts     – broker login credentials per user
 *   3. trades           – core trade records
 *   4. journal_entries  – daily free-form notes
 *   5. investor_links   – shareable read-only portfolio URLs
 *   6. usage_logs       – daily tier/quota snapshots  (append-only)
 *   7. sync_logs        – MT5 EA activity audit log   (append-only)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared access-rule fragments
// ─────────────────────────────────────────────────────────────────────────────
var IS_AUTH   = "@request.auth.id != ''";
var IS_OWNER  = "id = @request.auth.id";          // for auth collections
var OWN_ROW   = "user = @request.auth.id";        // for base collections with a user relation
var AUTH_OWN  = IS_AUTH + " && " + OWN_ROW;

// ─────────────────────────────────────────────────────────────────────────────
// UP
// ─────────────────────────────────────────────────────────────────────────────
migrate(function(app) {

  // ── 1. PROFILES ─────────────────────────────────────────────────────────────
  var profiles = new Collection({
    name:   "profiles",
    type:   "base",
    fields: [
      { name: "user",         type: "relation", required: true,
        options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "display_name", type: "text",     required: true,  options: { max: 60 } },
      { name: "timezone",     type: "text",     required: false, options: { max: 60 } },

      // Subscription
      { name: "tier",                   type: "number", required: true,  options: { min: 0, max: 5 } },
      { name: "subscription_status",    type: "select", required: true,
        options: { values: ["trial","active","past_due","canceled","paused"], maxSelect: 1 } },
      { name: "trial_ends_at",          type: "date",   required: false },
      { name: "stripe_customer_id",     type: "text",   required: false, options: { max: 100 } },
      { name: "stripe_subscription_id", type: "text",   required: false, options: { max: 100 } },

      // Investor link
      { name: "investor_password_hash", type: "text",   required: false, options: { max: 255 } },
      { name: "investor_link_enabled",  type: "bool",   required: true },

      // UI preferences
      { name: "theme",             type: "select", required: true,
        options: { values: ["dark","light","system"], maxSelect: 1 } },
      { name: "sidebar_collapsed", type: "bool",   required: true },
      { name: "ads_enabled",       type: "bool",   required: true },

      // Trading defaults
      { name: "default_lot_size",  type: "number", required: false },
      { name: "default_currency",  type: "text",   required: false, options: { max: 10 } },
    ],
    listRule:   AUTH_OWN,
    viewRule:   AUTH_OWN,
    createRule: IS_AUTH,
    updateRule: AUTH_OWN,
    deleteRule: null,
  });
  app.save(profiles);

  // ── 2. MT5 ACCOUNTS ─────────────────────────────────────────────────────────
  var mt5Accounts = new Collection({
    name:   "mt5_accounts",
    type:   "base",
    fields: [
      { name: "user",          type: "relation", required: true,
        options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "account_label", type: "text",     required: true,  options: { max: 60 } },
      { name: "mt5_login",     type: "text",     required: true,  options: { max: 30 } },
      { name: "broker",        type: "text",     required: false, options: { max: 100 } },
      { name: "server",        type: "text",     required: false, options: { max: 100 } },
      { name: "api_key_hash",  type: "text",     required: true,  options: { max: 255 } },
      { name: "currency",      type: "text",     required: false, options: { max: 10 } },
      { name: "balance",       type: "number",   required: false },
      { name: "equity",        type: "number",   required: false },
      { name: "is_active",     type: "bool",     required: true },
      { name: "sync_enabled",  type: "bool",     required: true },
      { name: "last_sync_at",  type: "date",     required: false },
    ],
    listRule:   AUTH_OWN,
    viewRule:   AUTH_OWN,
    createRule: IS_AUTH,
    updateRule: AUTH_OWN,
    deleteRule: AUTH_OWN,
  });
  app.save(mt5Accounts);

  // Fetch the saved collection to get its generated ID for use as FK in trades/sync_logs
  var mt5AccountsCol = app.findCollectionByNameOrId("mt5_accounts");

  // ── 3. TRADES ───────────────────────────────────────────────────────────────
  var trades = new Collection({
    name:   "trades",
    type:   "base",
    fields: [
      { name: "user",        type: "relation", required: true,
        options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "mt5_account", type: "relation", required: false,
        options: { collectionId: mt5AccountsCol.id, cascadeDelete: false, maxSelect: 1 } },

      { name: "mt5_ticket",  type: "text",   required: false, options: { max: 30 } },
      { name: "source",      type: "select", required: true,
        options: { values: ["manual","mt5_ea","mt5_import"], maxSelect: 1 } },

      { name: "opened_at",   type: "date",   required: true },
      { name: "closed_at",   type: "date",   required: false },

      { name: "pair",        type: "text",   required: true,  options: { max: 20 } },
      { name: "direction",   type: "select", required: true,
        options: { values: ["LONG","SHORT"], maxSelect: 1 } },
      { name: "session",     type: "text",   required: false, options: { max: 30 } },
      { name: "setup",       type: "text",   required: false, options: { max: 60 } },

      { name: "entry_price", type: "number", required: true },
      { name: "exit_price",  type: "number", required: false },
      { name: "sl",          type: "number", required: false },
      { name: "tp",          type: "number", required: false },
      { name: "lot_size",    type: "number", required: true },

      { name: "rr",          type: "number", required: false },
      { name: "pnl",         type: "number", required: false },
      { name: "pips",        type: "number", required: false },
      { name: "commission",  type: "number", required: false },
      { name: "swap",        type: "number", required: false },

      { name: "emotions",      type: "text",  required: false, options: { max: 30 } },
      { name: "followed_plan", type: "bool",  required: false },
      { name: "mistakes",      type: "text",  required: false, options: { max: 1000 } },
      { name: "notes",         type: "text",  required: false, options: { max: 5000 } },
      { name: "tags",          type: "json",  required: false },
      { name: "grade",         type: "text",  required: false, options: { max: 5 } },

      { name: "chart_images",  type: "file",  required: false,
        options: { maxSelect: 2, maxSize: 5242880,
          mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"] } },

      { name: "is_open",       type: "bool",  required: true },
    ],
    listRule:   AUTH_OWN,
    viewRule:   "(" + AUTH_OWN + ") || @request.query.investor_token != ''",
    createRule: IS_AUTH,
    updateRule: AUTH_OWN + " && source = 'manual'",
    deleteRule: AUTH_OWN,
  });
  app.save(trades);

  // ── 4. JOURNAL ENTRIES ──────────────────────────────────────────────────────
  var journalEntries = new Collection({
    name:   "journal_entries",
    type:   "base",
    fields: [
      { name: "user",        type: "relation", required: true,
        options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "entry_date",  type: "date",   required: true },
      { name: "title",       type: "text",   required: false, options: { max: 120 } },
      { name: "content",     type: "text",   required: false, options: { max: 10000 } },
      { name: "market_bias", type: "select", required: false,
        options: { values: ["bullish","bearish","neutral","ranging"], maxSelect: 1 } },
      { name: "mood",        type: "number", required: false, options: { min: 1, max: 10 } },
      { name: "tags",        type: "json",   required: false },
    ],
    listRule:   AUTH_OWN,
    viewRule:   AUTH_OWN,
    createRule: IS_AUTH,
    updateRule: AUTH_OWN,
    deleteRule: AUTH_OWN,
  });
  app.save(journalEntries);

  // ── 5. INVESTOR LINKS ───────────────────────────────────────────────────────
  var investorLinks = new Collection({
    name:   "investor_links",
    type:   "base",
    fields: [
      { name: "user",           type: "relation", required: true,
        options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "token",          type: "text",   required: true,  options: { max: 128 } },
      { name: "label",          type: "text",   required: false, options: { max: 60 } },
      { name: "is_active",      type: "bool",   required: true },
      { name: "show_pnl",       type: "bool",   required: true },
      { name: "show_lot_size",  type: "bool",   required: true },
      { name: "expires_at",     type: "date",   required: false },
      { name: "last_viewed_at", type: "date",   required: false },
      { name: "views",          type: "number", required: true,  options: { min: 0 } },
      { name: "password_hash",  type: "text",   required: false, options: { max: 255 } },
    ],
    listRule:   AUTH_OWN,
    viewRule:   OWN_ROW + " || @request.query.token != ''",
    createRule: IS_AUTH,
    updateRule: AUTH_OWN,
    deleteRule: AUTH_OWN,
  });
  app.save(investorLinks);

  // ── 6. USAGE LOGS ───────────────────────────────────────────────────────────
  var usageLogs = new Collection({
    name:   "usage_logs",
    type:   "base",
    fields: [
      { name: "user",          type: "relation", required: true,
        options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "log_date",      type: "date",   required: true },
      { name: "trades_count",  type: "number", required: true, options: { min: 0 } },
      { name: "total_lots",    type: "number", required: true, options: { min: 0 } },
      { name: "tier_at_time",  type: "number", required: true, options: { min: 0, max: 5 } },
      { name: "is_over_limit", type: "bool",   required: true },
    ],
    listRule:   AUTH_OWN,
    viewRule:   AUTH_OWN,
    createRule: IS_AUTH,
    updateRule: AUTH_OWN,
    deleteRule: null,
  });
  app.save(usageLogs);

  // ── 7. SYNC LOGS ────────────────────────────────────────────────────────────
  var syncLogs = new Collection({
    name:   "sync_logs",
    type:   "base",
    fields: [
      { name: "mt5_account", type: "relation", required: true,
        options: { collectionId: mt5AccountsCol.id, cascadeDelete: true, maxSelect: 1 } },
      { name: "event_type",  type: "select",   required: true,
        options: { values: ["connect","disconnect","trade_open","trade_close","trade_modify","full_sync","error"], maxSelect: 1 } },
      { name: "payload",     type: "json",     required: false },
      { name: "error_msg",   type: "text",     required: false, options: { max: 500 } },
      { name: "ip_address",  type: "text",     required: false, options: { max: 45 } },
    ],
    listRule:   null,
    viewRule:   null,
    createRule: "",
    updateRule: null,
    deleteRule: null,
  });
  app.save(syncLogs);

}, function(app) {

  // ── DOWN / rollback ──────────────────────────────────────────────────────────
  var names = [
    "sync_logs",
    "usage_logs",
    "investor_links",
    "journal_entries",
    "trades",
    "mt5_accounts",
    "profiles",
  ];

  for (var i = 0; i < names.length; i++) {
    try {
      var col = app.findCollectionByNameOrId(names[i]);
      app.delete(col);
    } catch(e) {
      // skip — may not exist if migration was partial
    }
  }

});
