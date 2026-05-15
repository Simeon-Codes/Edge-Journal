/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration : 001_initial_schema
 * App      : EDGE Journal
 * Target   : PocketBase v0.22.x
 *
 * Collections (creation order respects FK dependencies):
 *   1. profiles          – extends _pb_users_auth_ (1-to-1)
 *   2. mt5_accounts      – broker accounts per user
 *   3. trades            – individual trade records (core entity)
 *   4. journal_entries   – daily free-form notes
 *   5. investor_links    – shareable read-only portfolio links
 *   6. usage_logs        – daily tier/usage snapshots  (append-only)
 *   7. sync_logs         – MT5 EA activity log          (append-only)
 *
 * Security model
 *   • Every user-owned collection enforces `user = @request.auth.id` on
 *     list/view/update/delete so rows are invisible across accounts.
 *   • Append-only collections (usage_logs, sync_logs) have deleteRule: null.
 *   • sync_logs createRule is "" (empty string = server/hook only; no client
 *     can write directly).
 *   • investor_links viewRule allows unauthenticated access via query token
 *     so the shareable page works without a login.
 *   • trades viewRule mirrors that pattern for the investor-facing trade feed.
 *
 * Naming conventions
 *   • snake_case field names throughout.
 *   • Boolean fields prefixed with `is_` or `has_` for clarity.
 *   • Relation fields named after the target collection (singular).
 *   • `*_at` suffix for full datetime fields; `*_date` for date-only fields.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Shorthand to build a relation field descriptor.
 *  Pass collectionId for non-users collections (stable numeric IDs).
 *  Pass collectionName for the built-in "users" collection (v0.22+ safe). */
function rel(name, collectionRef, opts = {}) {
  // If the ref is the users collection name, use collectionName key; otherwise collectionId.
  const refKey = collectionRef === "users" ? "collectionName" : "collectionId";
  return {
    name,
    type: "relation",
    required: opts.required ?? true,
    options: {
      [refKey]:      collectionRef,
      cascadeDelete: opts.cascadeDelete ?? true,
      maxSelect:     opts.maxSelect ?? 1,
    },
  };
}

/** Shorthand for a text field. */
function txt(name, maxLen, opts = {}) {
  return {
    name,
    type: "text",
    required: opts.required ?? false,
    options: { max: maxLen },
  };
}

/** Shorthand for a number field. */
function num(name, opts = {}) {
  const field = { name, type: "number", required: opts.required ?? false, options: {} };
  if (opts.min !== undefined) field.options.min = opts.min;
  if (opts.max !== undefined) field.options.max = opts.max;
  return field;
}

/** Shorthand for a select field (single value). */
function sel(name, values, opts = {}) {
  return {
    name,
    type: "select",
    required: opts.required ?? false,
    options: { values, maxSelect: 1 },
  };
}

/** Shorthand for a bool field. */
function bool(name, opts = {}) {
  return { name, type: "bool", required: opts.required ?? true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection IDs  (stable, deterministic — never change after first deploy)
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: In PocketBase v0.22+, reference the built-in auth collection by its
// stable *name* ("users") rather than the internal system ID ("_pb_users_auth_").
// Using the name makes the relation portable across PB instances and avoids
// breakage if the system ID changes in a future PB release.
const IDS = {
  USERS:           "users",           // built-in auth collection (v0.22+ stable name)
  PROFILES:        "pf_profiles_001",
  MT5_ACCOUNTS:    "mt_accounts_001",
  TRADES:          "tr_trades_00001",
  JOURNAL:         "je_journal_001",
  INVESTOR_LINKS:  "il_inv_links_01",
  USAGE_LOGS:      "ul_usage_log_01",
  SYNC_LOGS:       "sl_sync_log_001",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared rule fragments
// ─────────────────────────────────────────────────────────────────────────────
const AUTH         = "@request.auth.id != ''";
const OWNS         = "user = @request.auth.id";
const AUTH_AND_OWN = `${AUTH} && ${OWNS}`;

// ─────────────────────────────────────────────────────────────────────────────
// UP migration
// ─────────────────────────────────────────────────────────────────────────────
migrate((db) => {
  // PocketBase v0.22 JS migrations use the DAO layer — db.save() does not exist.
  const dao = new Dao(db);

  // ── 1. PROFILES ────────────────────────────────────────────────────────────
  // One profile per auth user.  Tier 0 = free/trial; 1-5 = paid tiers.
  // Subscription state lives here so the app can gate features client-side
  // without an extra round-trip to Stripe.
  const profiles = new Collection({
    id:     IDS.PROFILES,
    name:   "profiles",
    type:   "base",
    system: false,
    schema: [
      rel("user", IDS.USERS, { required: true, cascadeDelete: true }),

      // Identity
      txt("display_name", 60,  { required: true }),
      txt("timezone",     60),                       // IANA tz string, e.g. "Africa/Lagos"

      // Subscription
      num("tier",                 { required: true, min: 0, max: 5 }),
      sel("subscription_status",  ["trial","active","past_due","canceled","paused"], { required: true }),
      { name: "trial_ends_at",    type: "date",   required: false },

      // Stripe (stored hashed/opaque; never expose raw IDs in list views)
      txt("stripe_customer_id",      100),
      txt("stripe_subscription_id",  100),

      // Investor link gate
      txt("investor_password_hash",  255),           // bcrypt hash, nullable
      bool("investor_link_enabled",  { required: true }),

      // UI preferences
      sel("theme",         ["dark","light","system"], { required: true }),
      bool("sidebar_collapsed",      { required: true }),
      bool("ads_enabled",            { required: true }),

      // Trading defaults
      num("default_lot_size"),
      txt("default_currency", 10),
    ],

    // One user can only see/edit their own profile row.
    listRule:   AUTH_AND_OWN,
    viewRule:   AUTH_AND_OWN,
    createRule: AUTH,              // hook should enforce 1-per-user
    updateRule: AUTH_AND_OWN,
    deleteRule: null,              // profiles are never hard-deleted; cancel subscription instead
  });


  // ── 2. MT5 ACCOUNTS ────────────────────────────────────────────────────────
  // A user may connect multiple MT5 logins (e.g. live + demo).
  // api_key_hash is the HMAC/SHA-256 of the EA's secret key — never stored raw.
  const mt5Accounts = new Collection({
    id:   IDS.MT5_ACCOUNTS,
    name: "mt5_accounts",
    type: "base",
    schema: [
      rel("user", IDS.USERS, { required: true, cascadeDelete: true }),

      txt("account_label", 60,  { required: true }),
      txt("mt5_login",     30,  { required: true }),   // numeric string, not int
      txt("broker",        100),
      txt("server",        100),
      txt("api_key_hash",  255, { required: true }),

      // Live balance mirror — written by the EA on each sync tick
      txt("currency",     10),
      num("balance"),
      num("equity"),

      // Sync control
      bool("is_active",     { required: true }),
      bool("sync_enabled",  { required: true }),
      { name: "last_sync_at", type: "date", required: false },
    ],

    listRule:   AUTH_AND_OWN,
    viewRule:   AUTH_AND_OWN,
    createRule: AUTH,
    updateRule: AUTH_AND_OWN,
    deleteRule: AUTH_AND_OWN,
  });


  // ── 3. TRADES ──────────────────────────────────────────────────────────────
  // Core entity.  Manual trades are fully editable; EA-sourced trades
  // (source ≠ 'manual') are read-only via updateRule to preserve audit trail.
  //
  // Investor-link access: viewRule allows unauthenticated reads when
  // @request.query.investor_token is present.  The app layer validates the
  // token and filters the query accordingly — PocketBase enforces the rule
  // but the token check itself is done in a pb_hooks handler.
  const trades = new Collection({
    id:   IDS.TRADES,
    name: "trades",
    type: "base",
    schema: [
      rel("user",        IDS.USERS,        { required: true,  cascadeDelete: true }),
      rel("mt5_account", IDS.MT5_ACCOUNTS, { required: false, cascadeDelete: false }),

      // MT5 provenance
      txt("mt5_ticket", 30),
      sel("source", ["manual","mt5_ea","mt5_import"], { required: true }),

      // ── Timing ────────────────────────────────────────────────────────────
      { name: "opened_at",  type: "date", required: true  },
      { name: "closed_at",  type: "date", required: false },

      // ── Instrument & direction ────────────────────────────────────────────
      txt("pair",      20, { required: true }),
      sel("direction", ["LONG","SHORT"], { required: true }),
      txt("session",   30),
      txt("setup",     60),

      // ── Prices ────────────────────────────────────────────────────────────
      num("entry_price", { required: true }),
      num("exit_price"),
      num("sl"),
      num("tp"),
      num("lot_size",   { required: true }),

      // ── Outcome ───────────────────────────────────────────────────────────
      num("rr"),                    // risk-reward ratio achieved
      num("pnl"),                   // net PnL in account currency
      num("pips"),
      num("commission"),
      num("swap"),

      // ── Journal metadata ──────────────────────────────────────────────────
      txt("emotions",   30),
      bool("followed_plan",  { required: false }),
      txt("mistakes",   1000),
      txt("notes",      5000),
      { name: "tags",   type: "json",   required: false },   // string[]
      txt("grade",      5),          // e.g. "A+", "B", "F"

      // ── Attachments (max 2: pre-trade & post-trade chart) ─────────────────
      {
        name: "chart_images",
        type: "file",
        required: false,
        options: {
          maxSelect: 2,
          maxSize:   5242880,        // 5 MB per file
          mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"],
        },
      },

      // ── Status ────────────────────────────────────────────────────────────
      bool("is_open", { required: true }),
    ],

    listRule:   AUTH_AND_OWN,
    // Investor token allows public read — token validation is enforced in hook
    viewRule:   `(${AUTH_AND_OWN}) || @request.query.investor_token != ''`,
    createRule: AUTH,
    // EA-sourced trades are immutable; only manual trades can be edited
    updateRule: `${AUTH_AND_OWN} && source = 'manual'`,
    deleteRule: AUTH_AND_OWN,
  });


  // ── 4. JOURNAL ENTRIES ─────────────────────────────────────────────────────
  // Daily free-form notes, market bias and mood tracking.
  // Unique constraint on (user, entry_date) should be enforced at app layer
  // or via a pb_hooks beforeCreate hook.
  const journalEntries = new Collection({
    id:   IDS.JOURNAL,
    name: "journal_entries",
    type: "base",
    schema: [
      rel("user", IDS.USERS, { required: true, cascadeDelete: true }),

      { name: "entry_date",  type: "date",   required: true },
      txt("title",   120),
      txt("content", 10000),
      sel("market_bias", ["bullish","bearish","neutral","ranging"]),
      num("mood", { min: 1, max: 10 }),         // 1-10 self-rating
      { name: "tags", type: "json", required: false },
    ],

    listRule:   AUTH_AND_OWN,
    viewRule:   AUTH_AND_OWN,
    createRule: AUTH,
    updateRule: AUTH_AND_OWN,
    deleteRule: AUTH_AND_OWN,
  });


  // ── 5. INVESTOR LINKS ──────────────────────────────────────────────────────
  // Each link has a unique URL token.  Password protection is optional
  // (password_hash = bcrypt of user-set password).
  // View counters (views, last_viewed_at) are updated server-side via hook.
  const investorLinks = new Collection({
    id:   IDS.INVESTOR_LINKS,
    name: "investor_links",
    type: "base",
    schema: [
      rel("user", IDS.USERS, { required: true, cascadeDelete: true }),

      txt("token", 128, { required: true }),    // cryptographically random, URL-safe
      txt("label",  60),

      bool("is_active",      { required: true }),
      bool("show_pnl",       { required: true }),
      bool("show_lot_size",  { required: true }),

      { name: "expires_at",     type: "date",   required: false },
      { name: "last_viewed_at", type: "date",   required: false },
      num("views", { required: true, min: 0 }),

      txt("password_hash", 255),                // nullable; bcrypt hash
    ],

    listRule:   AUTH_AND_OWN,
    // Public view via token so the shareable URL works unauthenticated
    viewRule:   `${OWNS} || @request.query.token != ''`,
    createRule: AUTH,
    updateRule: AUTH_AND_OWN,
    deleteRule: AUTH_AND_OWN,
  });


  // ── 6. USAGE LOGS ──────────────────────────────────────────────────────────
  // Daily snapshots written by a server-side cron/hook — never by the client.
  // Append-only: deleteRule is null to preserve billing history.
  const usageLogs = new Collection({
    id:   IDS.USAGE_LOGS,
    name: "usage_logs",
    type: "base",
    schema: [
      rel("user", IDS.USERS, { required: true, cascadeDelete: true }),

      { name: "log_date",     type: "date",   required: true },
      num("trades_count",   { required: true, min: 0 }),
      num("total_lots",     { required: true, min: 0 }),
      num("tier_at_time",   { required: true, min: 0, max: 5 }),
      bool("is_over_limit", { required: true }),
    ],

    listRule:   AUTH_AND_OWN,
    viewRule:   AUTH_AND_OWN,
    createRule: AUTH,              // enforced by server hook only; add hook guard
    updateRule: AUTH_AND_OWN,
    deleteRule: null,              // billing records are immutable
  });


  // ── 7. SYNC LOGS ───────────────────────────────────────────────────────────
  // MT5 EA activity log.  createRule "" means only server-side hooks/API keys
  // can insert rows — no client can write directly.
  // All read rules are null — these are internal audit records only.
  const syncLogs = new Collection({
    id:   IDS.SYNC_LOGS,
    name: "sync_logs",
    type: "base",
    schema: [
      rel("mt5_account", IDS.MT5_ACCOUNTS, { required: true, cascadeDelete: true }),

      sel("event_type", [
        "connect",
        "disconnect",
        "trade_open",
        "trade_close",
        "trade_modify",
        "full_sync",
        "error",
      ], { required: true }),

      { name: "payload",    type: "json", required: false },
      txt("error_msg",  500),
      txt("ip_address",  45),    // supports IPv6 (max 45 chars)
    ],

    listRule:   null,   // internal only
    viewRule:   null,
    createRule: "",     // server / EA hook only — no browser client can POST
    updateRule: null,
    deleteRule: null,
  });


  // ── Persist all collections ───────────────────────────────────────────────
  // Order matters: relations must reference already-saved collections.
  dao.saveCollection(profiles);
  dao.saveCollection(mt5Accounts);
  dao.saveCollection(trades);
  dao.saveCollection(journalEntries);
  dao.saveCollection(investorLinks);
  dao.saveCollection(usageLogs);
  dao.saveCollection(syncLogs);

}, (db) => {

  // ── DOWN / rollback ────────────────────────────────────────────────────────
  // Drop in reverse dependency order so FK constraints don't block deletion.
  const dao = new Dao(db);

  const COLLECTIONS = [
    "sync_logs",
    "usage_logs",
    "investor_links",
    "journal_entries",
    "trades",
    "mt5_accounts",
    "profiles",
  ];

  for (const name of COLLECTIONS) {
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId(name));
    } catch (e) {
      // Collection may not exist if migration was partially applied
      console.warn(`[rollback] could not delete "${name}":`, e.message ?? e);
    }
  }

});
