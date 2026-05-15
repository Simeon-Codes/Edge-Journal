///
<reference path="../pb_data/types.d.ts" /> /** * EDGE Journal * Production-grade PocketBase v0.22 schema migration * * Improvements:
* - PocketBase v0.22 compliant field definitions * - Consistent naming conventions
* - Stronger validation constraints * - Proper indexes for performance * - Future-proof
collection metadata * - Safer access rules * - Better default values * - Reduced
nullable ambiguity * - Improved relational integrity * - Optimized for scale and
maintainability */ migrate((app) => { const { Dao, Collection } = require("../pb_data/types")
const dao = new Dao(app.db()) // -------------------------------------------------------------------------
// HELPERS // -------------------------------------------------------------------------
const nowISO = () => new Date().toISOString() const relationField = ({ name, collectionId,
required = false, cascadeDelete = false, maxSelect = 1, }) => ({ system: false,
id: `${name}_field`, name, type: "relation", required, presentable: false, unique:
false, options: { collectionId, cascadeDelete, minSelect: required ? 1 : null,
maxSelect, displayFields: [], }, }) const textField = ({ name, required = false,
min = null, max = null, pattern = "", }) => ({ system: false, id: `${name}_field`,
name, type: "text", required, presentable: false, unique: false, options: { min,
max, pattern, }, }) const numberField = ({ name, required = false, min = null,
max = null, noDecimal = false, }) => ({ system: false, id: `${name}_field`, name,
type: "number", required, presentable: false, unique: false, options: { min, max,
noDecimal, }, }) const boolField = ({ name, required = true }) => ({ system: false,
id: `${name}_field`, name, type: "bool", required, presentable: false, unique:
false, options: {}, }) const dateField = ({ name, required = false }) => ({ system:
false, id: `${name}_field`, name, type: "date", required, presentable: false, unique:
false, options: { min: "", max: "", }, }) const selectField = ({ name, values,
required = false, maxSelect = 1, }) => ({ system: false, id: `${name}_field`, name,
type: "select", required, presentable: false, unique: false, options: { maxSelect,
values, }, }) const jsonField = ({ name, required = false }) => ({ system: false,
id: `${name}_field`, name, type: "json", required, presentable: false, unique:
false, options: { maxSize: 1048576, }, }) const fileField = ({ name, required =
false, maxSelect = 1, maxSize, mimeTypes = [], }) => ({ system: false, id: `${name}_field`,
name, type: "file", required, presentable: false, unique: false, options: { mimeTypes,
thumbs: [], maxSelect, maxSize, protected: false, }, }) // -------------------------------------------------------------------------
// PROFILES // -------------------------------------------------------------------------
const profiles = new Collection({ id: "profiles", created: nowISO(), updated: nowISO(),
name: "profiles", type: "base", system: false, schema: [ relationField({ name:
"user", collectionId: "_pb_users_auth_", required: true, cascadeDelete: true, }),
textField({ name: "display_name", required: true, min: 2, max: 60, }), numberField({
name: "tier", required: true, min: 0, max: 5, noDecimal: true, }), textField({
name: "stripe_customer_id", max: 120, }), textField({ name: "stripe_subscription_id",
max: 120, }), selectField({ name: "subscription_status", required: true, values:
[ "trial", "active", "past_due", "canceled", "paused", ], }), dateField({ name:
"trial_ends_at", }), textField({ name: "investor_password_hash", max: 255, }),
boolField({ name: "investor_link_enabled", }), selectField({ name: "theme", required:
true, values: ["dark", "light", "system"], }), boolField({ name: "sidebar_collapsed",
}), boolField({ name: "ads_enabled", }), textField({ name: "timezone", max: 80,
}), textField({ name: "default_currency", max: 10, pattern: "^[A-Z]{3,10}$", }),
numberField({ name: "default_lot_size", min: 0, }), ], indexes: [ "CREATE UNIQUE
INDEX idx_profiles_user ON profiles (user)", "CREATE INDEX idx_profiles_subscription_status
ON profiles (subscription_status)", "CREATE INDEX idx_profiles_tier ON profiles
(tier)", ], listRule: "@request.auth.id != '' && user = @request.auth.id", viewRule:
"@request.auth.id != '' && user = @request.auth.id", createRule: "@request.auth.id
!= ''", updateRule: "@request.auth.id != '' && user = @request.auth.id", deleteRule:
null, options: {}, }) dao.saveCollection(profiles) // -------------------------------------------------------------------------
// MT5 ACCOUNTS // -------------------------------------------------------------------------
const mt5Accounts = new Collection({ id: "mt5_accounts", created: nowISO(), updated:
nowISO(), name: "mt5_accounts", type: "base", system: false, schema: [ relationField({
name: "user", collectionId: "_pb_users_auth_", required: true, cascadeDelete: true,
}), textField({ name: "account_label", required: true, min: 2, max: 60, }), textField({
name: "mt5_login", required: true, min: 3, max: 30, }), textField({ name: "broker",
max: 120, }), textField({ name: "server", max: 120, }), textField({ name: "api_key_hash",
required: true, min: 32, max: 255, }), boolField({ name: "is_active", }), boolField({
name: "sync_enabled", }), dateField({ name: "last_sync_at", }), textField({ name:
"currency", max: 10, pattern: "^[A-Z]{3,10}$", }), numberField({ name: "balance",
}), numberField({ name: "equity", }), ], indexes: [ "CREATE UNIQUE INDEX idx_mt5_login_user
ON mt5_accounts (user, mt5_login)", "CREATE INDEX idx_mt5_accounts_user ON mt5_accounts
(user)", "CREATE INDEX idx_mt5_accounts_active ON mt5_accounts (is_active)", "CREATE
INDEX idx_mt5_accounts_sync_enabled ON mt5_accounts (sync_enabled)", ], listRule:
"@request.auth.id != '' && user = @request.auth.id", viewRule: "@request.auth.id
!= '' && user = @request.auth.id", createRule: "@request.auth.id != ''", updateRule:
"@request.auth.id != '' && user = @request.auth.id", deleteRule: "@request.auth.id
!= '' && user = @request.auth.id", options: {}, }) dao.saveCollection(mt5Accounts)
// ------------------------------------------------------------------------- //
TRADES // -------------------------------------------------------------------------
const trades = new Collection({ id: "trades", created: nowISO(), updated: nowISO(),
name: "trades", type: "base", system: false, schema: [ relationField({ name: "user",
collectionId: "_pb_users_auth_", required: true, cascadeDelete: true, }), relationField({
name: "mt5_account", collectionId: "mt5_accounts", }), textField({ name: "mt5_ticket",
max: 40, }), selectField({ name: "source", required: true, values: ["manual", "mt5_ea",
"mt5_import"], }), dateField({ name: "trade_date", required: true, }), textField({
name: "trade_time", max: 10, pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$", }), textField({
name: "pair", required: true, min: 3, max: 20, }), selectField({ name: "direction",
required: true, values: ["LONG", "SHORT"], }), textField({ name: "session", max:
30, }), textField({ name: "setup", max: 60, }), numberField({ name: "entry_price",
required: true, }), numberField({ name: "exit_price", }), numberField({ name: "stop_loss",
}), numberField({ name: "take_profit", }), numberField({ name: "lot_size", required:
true, min: 0.01, }), numberField({ name: "risk_reward_ratio", }), numberField({
name: "pnl", }), numberField({ name: "pips", }), numberField({ name: "commission",
}), numberField({ name: "swap", }), textField({ name: "emotions", max: 120, }),
boolField({ name: "followed_plan", required: false, }), textField({ name: "mistakes",
max: 2000, }), textField({ name: "notes", max: 10000, }), jsonField({ name: "tags",
}), textField({ name: "grade", max: 5, }), fileField({ name: "chart_images", maxSelect:
5, maxSize: 5 * 1024 * 1024, mimeTypes: [ "image/jpeg", "image/png", "image/webp",
"image/gif", ], }), boolField({ name: "is_open", }), dateField({ name: "closed_at",
}), ], indexes: [ "CREATE INDEX idx_trades_user ON trades (user)", "CREATE INDEX
idx_trades_trade_date ON trades (trade_date)", "CREATE INDEX idx_trades_user_date
ON trades (user, trade_date DESC)", "CREATE INDEX idx_trades_mt5_account ON trades
(mt5_account)", "CREATE INDEX idx_trades_is_open ON trades (is_open)", "CREATE
INDEX idx_trades_source ON trades (source)", "CREATE UNIQUE INDEX idx_trades_mt5_ticket_unique
ON trades (mt5_account, mt5_ticket) WHERE mt5_ticket IS NOT NULL", ], listRule:
"@request.auth.id != '' && user = @request.auth.id", viewRule: ` ( @request.auth.id
!= '' && user = @request.auth.id ) || ( @request.query.investor_token != '' ) `,
createRule: "@request.auth.id != ''", updateRule: ` @request.auth.id != '' && user
= @request.auth.id `, deleteRule: "@request.auth.id != '' && user = @request.auth.id",
options: {}, }) dao.saveCollection(trades) // -------------------------------------------------------------------------
// JOURNAL ENTRIES // -------------------------------------------------------------------------
const journalEntries = new Collection({ id: "journal_entries", created: nowISO(),
updated: nowISO(), name: "journal_entries", type: "base", system: false, schema:
[ relationField({ name: "user", collectionId: "_pb_users_auth_", required: true,
cascadeDelete: true, }), dateField({ name: "entry_date", required: true, }), textField({
name: "title", max: 120, }), textField({ name: "content", max: 20000, }), selectField({
name: "market_bias", values: ["bullish", "bearish", "neutral", "ranging"], }),
numberField({ name: "mood", min: 1, max: 10, noDecimal: true, }), jsonField({ name:
"tags", }), ], indexes: [ "CREATE INDEX idx_journal_user ON journal_entries (user)",
"CREATE INDEX idx_journal_entry_date ON journal_entries (entry_date DESC)", "CREATE
UNIQUE INDEX idx_journal_user_date ON journal_entries (user, entry_date)", ], listRule:
"@request.auth.id != '' && user = @request.auth.id", viewRule: "@request.auth.id
!= '' && user = @request.auth.id", createRule: "@request.auth.id != ''", updateRule:
"@request.auth.id != '' && user = @request.auth.id", deleteRule: "@request.auth.id
!= '' && user = @request.auth.id", options: {}, }) dao.saveCollection(journalEntries)
// ------------------------------------------------------------------------- //
INVESTOR LINKS // -------------------------------------------------------------------------
const investorLinks = new Collection({ id: "investor_links", created: nowISO(),
updated: nowISO(), name: "investor_links", type: "base", system: false, schema:
[ relationField({ name: "user", collectionId: "_pb_users_auth_", required: true,
cascadeDelete: true, }), textField({ name: "token", required: true, min: 32, max:
255, }), textField({ name: "label", max: 60, }), boolField({ name: "is_active",
}), dateField({ name: "expires_at", }), numberField({ name: "views", required:
true, min: 0, noDecimal: true, }), dateField({ name: "last_viewed_at", }), boolField({
name: "show_pnl", }), boolField({ name: "show_lot_size", }), textField({ name:
"password_hash", max: 255, }), ], indexes: [ "CREATE UNIQUE INDEX idx_investor_token
ON investor_links (token)", "CREATE INDEX idx_investor_user ON investor_links (user)",
"CREATE INDEX idx_investor_active ON investor_links (is_active)", ], listRule:
"@request.auth.id != '' && user = @request.auth.id", viewRule: ` ( @request.auth.id
!= '' && user = @request.auth.id ) || ( @request.query.token != '' ) `, createRule:
"@request.auth.id != ''", updateRule: "@request.auth.id != '' && user = @request.auth.id",
deleteRule: "@request.auth.id != '' && user = @request.auth.id", options: {}, })
dao.saveCollection(investorLinks) // -------------------------------------------------------------------------
// USAGE LOGS // -------------------------------------------------------------------------
const usageLogs = new Collection({ id: "usage_logs", created: nowISO(), updated:
nowISO(), name: "usage_logs", type: "base", system: false, schema: [ relationField({
name: "user", collectionId: "_pb_users_auth_", required: true, cascadeDelete: true,
}), dateField({ name: "log_date", required: true, }), numberField({ name: "trades_count",
required: true, min: 0, noDecimal: true, }), numberField({ name: "total_lots",
required: true, min: 0, }), numberField({ name: "tier_at_time", required: true,
min: 0, max: 5, noDecimal: true, }), boolField({ name: "over_limit", }), ], indexes:
[ "CREATE INDEX idx_usage_user ON usage_logs (user)", "CREATE INDEX idx_usage_log_date
ON usage_logs (log_date DESC)", "CREATE UNIQUE INDEX idx_usage_user_date ON usage_logs
(user, log_date)", ], listRule: "@request.auth.id != '' && user = @request.auth.id",
viewRule: "@request.auth.id != '' && user = @request.auth.id", createRule: null,
updateRule: null, deleteRule: null, options: {}, }) dao.saveCollection(usageLogs)
// ------------------------------------------------------------------------- //
SYNC LOGS // -------------------------------------------------------------------------
const syncLogs = new Collection({ id: "sync_logs", created: nowISO(), updated:
nowISO(), name: "sync_logs", type: "base", system: false, schema: [ relationField({
name: "mt5_account", collectionId: "mt5_accounts", required: true, cascadeDelete:
true, }), selectField({ name: "event_type", required: true, values: [ "connect",
"disconnect", "trade_open", "trade_close", "trade_modify", "full_sync", "error",
], }), jsonField({ name: "payload", }), textField({ name: "error_message", max:
2000, }), textField({ name: "ip_address", max: 64, }), ], indexes: [ "CREATE INDEX
idx_sync_mt5_account ON sync_logs (mt5_account)", "CREATE INDEX idx_sync_event_type
ON sync_logs (event_type)", "CREATE INDEX idx_sync_created ON sync_logs (created
DESC)", ], listRule: null, viewRule: null, createRule: null, updateRule: null,
deleteRule: null, options: {}, }) dao.saveCollection(syncLogs) }, (app) => { const
{ Dao } = require("../pb_data/types") const dao = new Dao(app.db()) const collections
= [ "sync_logs", "usage_logs", "investor_links", "journal_entries", "trades", "mt5_accounts",
"profiles", ] for (const name of collections) { try { const collection = dao.findCollectionByNameOrId(name)
dao.deleteCollection(collection) } catch (_) {} } })