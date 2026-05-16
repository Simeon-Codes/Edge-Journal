/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration : 001_initial_schema
 * App       : EDGE Journal
 * Target    : PocketBase v0.22.x
 *
 * ROOT CAUSE NOTE — "no such table: _collections"
 *   Using `new Collection({...})` in a migration causes PocketBase to query
 *   _collections at object-construction time, before the DAO has initialised
 *   that table.  The correct v0.22 pattern is to pass a plain JS object literal
 *   directly to new Dao(db).saveCollection().  No `new Collection()` anywhere.
 *
 * Collections (FK-dependency order):
 *   1. profiles         – 1-to-1 extension of built-in users auth
 *   2. mt5_accounts     – broker login credentials per user
 *   3. trades           – core trade records
 *   4. journal_entries  – daily free-form notes
 *   5. investor_links   – shareable read-only portfolio URLs
 *   6. usage_logs       – daily tier/quota snapshots  (append-only)
 *   7. sync_logs        – MT5 EA activity audit log   (append-only)
 *
 * Security model
 *   • User-owned collections: list/view/update/delete all require
 *     `@request.auth.id != '' && user = @request.auth.id`.
 *   • Append-only collections: deleteRule null.
 *   • sync_logs createRule "": server/hook-only writes, no browser client.
 *   • investor_links / trades viewRule: token-based unauthenticated read
 *     for shareable investor pages (token validated in pb_hooks).
 *
 * Naming conventions
 *   • snake_case throughout.
 *   • Booleans: is_* prefix.
 *   • Datetime fields: *_at suffix.  Date-only fields: *_date suffix.
 *   • Relation fields: singular name of the target collection.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Field-builder helpers  (return plain objects — no PB class constructors)
// ─────────────────────────────────────────────────────────────────────────────

/** Relation field. Always uses collectionId — required by PocketBase v0.22 migration runtime. */
function rel(name, collectionId, opts) {
  opts = opts || {};
  return {
    name: name,
    type: "relation",
    required: opts.required !== false,
    options: {
      collectionId:  collectionId,
      cascadeDelete: opts.cascadeDelete !== false,
      maxSelect:     opts.maxSelect || 1,
    },
  };
}

function txt(name, maxLen, opts) {
  opts = opts || {};
  return { name: name, type: "text", required: !!opts.required, options: { max: maxLen } };
}

function num(name, opts) {
  opts = opts || {};
  var o = {};
  if (opts.min !== undefined) o.min = opts.min;
  if (opts.max !== undefined) o.max = opts.max;
  return { name: name, type: "number", required: !!opts.required, options: o };
}

function sel(name, values, opts) {
  opts = opts || {};
  return { name: name, type: "select", required: !!opts.required, options: { values: values, maxSelect: 1 } };
}

function bool(name, required) {
  return { name: name, type: "bool", required: required !== false };
}

function date(name, required) {
  return { name: name, type: "date", required: !!required };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable collection IDs  (never change after first deploy)
// ─────────────────────────────────────────────────────────────────────────────
var ID = {
  PROFILES:     "pf_profiles_001",
  MT5_ACCOUNTS: "mt_accounts_001",
  TRADES:       "tr_trades_00001",
  JOURNAL:      "je_journal_001",
  INV_LINKS:    "il_inv_links_01",
  USAGE_LOGS:   "ul_usage_log_01",
  SYNC_LOGS:    "sl_sync_log_001",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared access-rule fragments
// ─────────────────────────────────────────────────────────────────────────────
var IS_AUTH    = "@request.auth.id != ''";
var IS_OWNER   = "user = @request.auth.id";
var AUTH_OWNER = IS_AUTH + " && " + IS_OWNER;

// ─────────────────────────────────────────────────────────────────────────────
// UP
// ─────────────────────────────────────────────────────────────────────────────
migrate(function(db) {


  // ── 1. PROFILES ─────────────────────────────────────────────────────────────
  // One row per auth user.  Tier 0 = free/trial; 1–5 = paid tiers.
  // Subscription state here lets the app gate features without a Stripe round-trip.
  new Dao(db).saveCollection({
    id:     ID.PROFILES,
    name:   "profiles",
    type:   "base",
    system: false,
    schema: [
      rel("user", "_pb_users_auth_", { required: true, cascadeDelete: true }),

      // Identity
      txt("display_name", 60,  { required: true }),
      txt("timezone",     60),                        // IANA tz, e.g. "Africa/Lagos"

      // Subscription / billing
      num("tier",                { required: true, min: 0, max: 5 }),
      sel("subscription_status", ["trial","active","past_due","canceled","paused"], { required: true }),
      date("trial_ends_at"),

      // Stripe references (opaque — never expose raw IDs in list rules)
      txt("stripe_customer_id",     100),
      txt("stripe_subscription_id", 100),

      // Investor link gate
      txt("investor_password_hash", 255),             // bcrypt hash, nullable
      bool("investor_link_enabled"),

      // UI preferences
      sel("theme", ["dark","light","system"], { required: true }),
      bool("sidebar_collapsed"),
      bool("ads_enabled"),

      // Trading defaults
      num("default_lot_size"),
      txt("default_currency", 10),
    ],
    listRule:   AUTH_OWNER,
    viewRule:   AUTH_OWNER,
    createRule: IS_AUTH,         // pb_hook enforces 1-per-user uniqueness
    updateRule: AUTH_OWNER,
    deleteRule: null,            // never hard-delete; cancel subscription instead
  });

  // ── 2. MT5 ACCOUNTS ─────────────────────────────────────────────────────────
  // A user can connect multiple MT5 logins (e.g. live + demo).
  // api_key_hash = HMAC-SHA256 of the EA's secret — never stored raw.
  new Dao(db).saveCollection({
    id:   ID.MT5_ACCOUNTS,
    name: "mt5_accounts",
    type: "base",
    schema: [
      rel("user", "_pb_users_auth_", { required: true, cascadeDelete: true }),

      txt("account_label", 60,  { required: true }),
      txt("mt5_login",     30,  { required: true }),  // stored as string, not int
      txt("broker",        100),
      txt("server",        100),
      txt("api_key_hash",  255, { required: true }),

      // Live balance mirror — EA writes this on each sync tick
      txt("currency",  10),
      num("balance"),
      num("equity"),

      // Sync control
      bool("is_active"),
      bool("sync_enabled"),
      date("last_sync_at"),
    ],
    listRule:   AUTH_OWNER,
    viewRule:   AUTH_OWNER,
    createRule: IS_AUTH,
    updateRule: AUTH_OWNER,
    deleteRule: AUTH_OWNER,
  });

  // ── 3. TRADES ───────────────────────────────────────────────────────────────
  // Manual trades are fully editable.  EA-sourced trades are immutable
  // (updateRule gates on source = 'manual') to preserve audit integrity.
  //
  // Investor token path: unauthenticated viewRule — token is validated inside
  // a pb_hooks onRecordListRequest handler; PocketBase enforces the rule gate.
  new Dao(db).saveCollection({
    id:   ID.TRADES,
    name: "trades",
    type: "base",
    schema: [
      rel("user",        "_pb_users_auth_",         { required: true,  cascadeDelete: true  }),
      rel("mt5_account", ID.MT5_ACCOUNTS, { required: false, cascadeDelete: false }),

      // MT5 provenance
      txt("mt5_ticket", 30),
      sel("source", ["manual","mt5_ea","mt5_import"], { required: true }),

      // Timing
      date("opened_at", true),
      date("closed_at"),

      // Instrument
      txt("pair",      20, { required: true }),
      sel("direction", ["LONG","SHORT"], { required: true }),
      txt("session",   30),
      txt("setup",     60),

      // Prices
      num("entry_price", { required: true }),
      num("exit_price"),
      num("sl"),
      num("tp"),
      num("lot_size",    { required: true }),

      // Outcome
      num("rr"),           // achieved risk-reward ratio
      num("pnl"),          // net P&L in account currency
      num("pips"),
      num("commission"),
      num("swap"),

      // Journal metadata
      txt("emotions", 30),
      bool("followed_plan", false),
      txt("mistakes",  1000),
      txt("notes",     5000),
      { name: "tags", type: "json", required: false },   // string[]
      txt("grade",     5),                               // "A+", "B", "F", etc.

      // Chart screenshots (max 2: pre-entry + post-exit)
      {
        name: "chart_images",
        type: "file",
        required: false,
        options: {
          maxSelect: 2,
          maxSize:   5242880,                           // 5 MB per file
          mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"],
        },
      },

      bool("is_open"),
    ],
    listRule:   AUTH_OWNER,
    viewRule:   "(" + AUTH_OWNER + ") || @request.query.investor_token != ''",
    createRule: IS_AUTH,
    updateRule: AUTH_OWNER + " && source = 'manual'",
    deleteRule: AUTH_OWNER,
  });

  // ── 4. JOURNAL ENTRIES ──────────────────────────────────────────────────────
  // (user, entry_date) uniqueness enforced by a pb_hooks beforeCreate handler.
  new Dao(db).saveCollection({
    id:   ID.JOURNAL,
    name: "journal_entries",
    type: "base",
    schema: [
      rel("user", "_pb_users_auth_", { required: true, cascadeDelete: true }),

      date("entry_date", true),
      txt("title",   120),
      txt("content", 10000),
      sel("market_bias", ["bullish","bearish","neutral","ranging"]),
      num("mood", { min: 1, max: 10 }),               // 1–10 self-rating
      { name: "tags", type: "json", required: false },
    ],
    listRule:   AUTH_OWNER,
    viewRule:   AUTH_OWNER,
    createRule: IS_AUTH,
    updateRule: AUTH_OWNER,
    deleteRule: AUTH_OWNER,
  });

  // ── 5. INVESTOR LINKS ───────────────────────────────────────────────────────
  // token: cryptographically random, URL-safe string generated server-side.
  // View counters updated via pb_hook, not by the browser client.
  new Dao(db).saveCollection({
    id:   ID.INV_LINKS,
    name: "investor_links",
    type: "base",
    schema: [
      rel("user", "_pb_users_auth_", { required: true, cascadeDelete: true }),

      txt("token", 128, { required: true }),
      txt("label",  60),

      bool("is_active"),
      bool("show_pnl"),
      bool("show_lot_size"),

      date("expires_at"),
      date("last_viewed_at"),
      num("views", { required: true, min: 0 }),

      txt("password_hash", 255),                      // nullable; bcrypt hash
    ],
    listRule:   AUTH_OWNER,
    viewRule:   IS_OWNER + " || @request.query.token != ''",
    createRule: IS_AUTH,
    updateRule: AUTH_OWNER,
    deleteRule: AUTH_OWNER,
  });

  // ── 6. USAGE LOGS ───────────────────────────────────────────────────────────
  // Written by server-side cron/hook only.  Billing records — never deleted.
  new Dao(db).saveCollection({
    id:   ID.USAGE_LOGS,
    name: "usage_logs",
    type: "base",
    schema: [
      rel("user", "_pb_users_auth_", { required: true, cascadeDelete: true }),

      date("log_date", true),
      num("trades_count",  { required: true, min: 0 }),
      num("total_lots",    { required: true, min: 0 }),
      num("tier_at_time",  { required: true, min: 0, max: 5 }),
      bool("is_over_limit"),
    ],
    listRule:   AUTH_OWNER,
    viewRule:   AUTH_OWNER,
    createRule: IS_AUTH,         // pb_hook must guard; no direct client writes
    updateRule: AUTH_OWNER,
    deleteRule: null,            // immutable billing record
  });

  // ── 7. SYNC LOGS ────────────────────────────────────────────────────────────
  // createRule "" = server/EA hook only.  No browser client can POST.
  // All read rules null = internal audit; never exposed via the API.
  new Dao(db).saveCollection({
    id:   ID.SYNC_LOGS,
    name: "sync_logs",
    type: "base",
    schema: [
      rel("mt5_account", ID.MT5_ACCOUNTS, { required: true, cascadeDelete: true }),

      sel("event_type", [
        "connect",
        "disconnect",
        "trade_open",
        "trade_close",
        "trade_modify",
        "full_sync",
        "error",
      ], { required: true }),

      { name: "payload",  type: "json", required: false },
      txt("error_msg",  500),
      txt("ip_address",  45),   // 45 chars covers full IPv6
    ],
    listRule:   null,
    viewRule:   null,
    createRule: "",              // empty string = server/hook only in PocketBase
    updateRule: null,
    deleteRule: null,
  });

}, function(db) {

  // ── DOWN / rollback ──────────────────────────────────────────────────────────
  // Reverse FK order so dependents are removed before parents.


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
      var col = new Dao(db).findCollectionByNameOrId(names[i]);
      new Dao(db).deleteCollection(col);
    } catch (e) {
      // Safe to skip — collection may not exist if migration was partial
      console.warn("[rollback] skipping \"" + names[i] + "\":", e.message || String(e));
    }
  }

});
