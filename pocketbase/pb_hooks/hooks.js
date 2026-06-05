/// <reference path="../pb_data/types.d.ts" />

// ─── EDGE Journal — PocketBase Server Hooks ───────────────────────────────────
// Runtime: goja (not Node.js) — no require(), no process.env, no Node crypto.
// Use $security, $os, $http, $app, $apis — all PocketBase built-ins.

// ── In-memory rate limiter ────────────────────────────────────────────────────
const rl = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const e   = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > e.reset) { e.n = 0; e.reset = now + windowMs; }
  e.n++;
  rl.set(key, e);
  return e.n > max;
}

// ── Sanitise ──────────────────────────────────────────────────────────────────
function san(str, max) {
  max = max || 500;
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").slice(0, max).trim();
}

// ── Hash API key ──────────────────────────────────────────────────────────────
// Single function used everywhere — sync endpoint + beforeCreate hook must match.
// $security.sha256 is available in PocketBase 0.23+.
function hashKey(plain) {
  return $security.sha256(plain + "edge_journal_salt");
}

// ── CORS + Security headers ───────────────────────────────────────────────────
var ALLOWED_ORIGINS = [
  "https://edge-journal-sepia.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

routerAdd("USE", "/*", (c) => {
  var origin = c.request().header.get("Origin") || "";

  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    c.response().header().set("Access-Control-Allow-Origin",      origin);
    c.response().header().set("Access-Control-Allow-Methods",     "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    c.response().header().set("Access-Control-Allow-Headers",     "Content-Type, Authorization, X-Token");
    c.response().header().set("Access-Control-Allow-Credentials", "true");
    c.response().header().set("Vary",                             "Origin");
  }

  if (c.request().method === "OPTIONS") {
    c.response().writer().writeHeader(204);
    return;
  }

  c.response().header().set("X-Content-Type-Options",  "nosniff");
  c.response().header().set("X-Frame-Options",          "SAMEORIGIN");
  c.response().header().set("X-XSS-Protection",         "1; mode=block");
  c.response().header().set("Referrer-Policy",          "strict-origin-when-cross-origin");
  c.response().header().set("Permissions-Policy",       "camera=(), microphone=(), geolocation=()");
  c.response().header().set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com;"
  );
});

// ── MT5 account — hash api_key_plain before saving ───────────────────────────
// Frontend sends api_key_plain. Hook hashes it with hashKey(), stores the hash,
// and clears the plain text. The sync endpoint verifies using the same hashKey().
onRecordBeforeCreateRequest((e) => {
  if (e.record.collection().name !== "mt5_accounts") return;

  const plain = String(e.record.get("api_key_plain") || "");
  if (plain.length < 10) {
    throw new BadRequestError("API key is too short or missing.");
  }

  try {
    e.record.set("api_key_hash",  hashKey(plain));
    e.record.set("api_key_plain", ""); // never persist plain text
  } catch (err) {
    throw new BadRequestError("Failed to hash API key — record not created.");
  }
}, "mt5_accounts");

// ── MT5 EA sync endpoint ──────────────────────────────────────────────────────
routerAdd("POST", "/api/mt5/sync", (c) => {
  const ip = c.realIP();
  if (rateLimit("mt5:" + ip, 120, 60000)) {
    return c.json(429, { error: "Rate limit exceeded" });
  }

  const auth = c.request().header.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return c.json(401, { error: "Missing API key" });
  const apiKey = auth.slice(7).trim();
  if (!apiKey || apiKey.length < 20) return c.json(401, { error: "Invalid API key" });

  // hashKey() here must match the one used in onRecordBeforeCreateRequest above
  const keyHash = hashKey(apiKey);

  let mt5Acct;
  try {
    const rows = $app.dao().findRecordsByFilter(
      "mt5_accounts",
      "api_key_hash = {:h} && is_active = true && sync_enabled = true",
      { h: keyHash }, 1, 0
    );
    if (!rows || !rows.length) return c.json(401, { error: "Invalid API key" });
    mt5Acct = rows[0];
  } catch (e) {
    return c.json(500, { error: "Auth error" });
  }

  let payload;
  try {
    payload = $apis.requestInfo(c).data;
    if (!payload || typeof payload !== "object") return c.json(400, { error: "Invalid payload" });
  } catch (e) {
    return c.json(400, { error: "Invalid payload" });
  }

  const evt      = san(String(payload.event || ""), 30);
  const userId   = mt5Acct.get("user");
  const validEvts = ["trade_open", "trade_close", "trade_modify", "full_sync", "heartbeat"];
  if (!validEvts.includes(evt)) return c.json(400, { error: "Invalid event" });

  // Heartbeat
  if (evt === "heartbeat") {
    try {
      mt5Acct.set("last_sync", new Date().toISOString());
      if (payload.balance !== undefined) mt5Acct.set("balance", Number(payload.balance) || 0);
      if (payload.equity  !== undefined) mt5Acct.set("equity",  Number(payload.equity)  || 0);
      $app.dao().saveRecord(mt5Acct);
    } catch (e) { /* non-fatal */ }
    return c.json(200, { status: "ok" });
  }

  // Full sync
  if (evt === "full_sync" && Array.isArray(payload.trades)) {
    var imported = 0, skipped = 0;
    const col = $app.dao().findCollectionByNameOrId("trades");

    for (var i = 0; i < Math.min(payload.trades.length, 10000); i++) {
      const t = payload.trades[i];
      try {
        const ticket = san(String(t.ticket || ""), 30);
        if (!ticket) { skipped++; continue; }

        const existing = $app.dao().findRecordsByFilter(
          "trades", "mt5_ticket = {:tk} && user = {:uid}",
          { tk: ticket, uid: userId }, 1, 0
        );
        if (existing && existing.length) { skipped++; continue; }

        const rec = new Record(col);
        rec.set("user",        userId);
        rec.set("mt5_account", mt5Acct.id);
        rec.set("mt5_ticket",  ticket);
        rec.set("source",      "mt5_import");
        rec.set("trade_date",  san(String(t.open_time || "").slice(0, 10), 20));
        rec.set("trade_time",  san(String(t.open_time || "").slice(11, 16), 10));
        rec.set("pair",        san(String(t.symbol || ""), 20));
        rec.set("direction",   t.type === 0 ? "LONG" : "SHORT");
        rec.set("lot_size",    Math.abs(Number(t.lots)        || 0));
        rec.set("entry_price", Number(t.open_price)           || 0);
        rec.set("exit_price",  Number(t.close_price)          || 0);
        rec.set("sl",          Number(t.sl)                   || 0);
        rec.set("tp",          Number(t.tp)                   || 0);
        rec.set("pnl",         Number(t.profit)               || 0);
        rec.set("commission",  Number(t.commission)           || 0);
        rec.set("swap",        Number(t.swap)                 || 0);
        rec.set("is_open",     !t.close_time);
        rec.set("closed_at",   t.close_time ? san(String(t.close_time), 30) : null);
        $app.dao().saveRecord(rec);
        imported++;
      } catch (e) { skipped++; }
    }

    try {
      const sCol = $app.dao().findCollectionByNameOrId("sync_logs");
      const sRec = new Record(sCol);
      sRec.set("mt5_account", mt5Acct.id);
      sRec.set("event_type",  "full_sync");
      sRec.set("payload",     { imported, skipped });
      sRec.set("ip_address",  ip);
      $app.dao().saveRecord(sRec);
    } catch (e) { /* non-fatal */ }

    mt5Acct.set("last_sync", new Date().toISOString());
    $app.dao().saveRecord(mt5Acct);
    return c.json(200, { status: "ok", imported, skipped });
  }

  // Single trade event
  if (["trade_open", "trade_close", "trade_modify"].includes(evt) && payload.trade) {
    const t      = payload.trade;
    const ticket = san(String(t.ticket || ""), 30);
    if (!ticket) return c.json(400, { error: "Missing ticket" });

    try {
      const existing = $app.dao().findRecordsByFilter(
        "trades", "mt5_ticket = {:tk} && user = {:uid}",
        { tk: ticket, uid: userId }, 1, 0
      );
      const col   = $app.dao().findCollectionByNameOrId("trades");
      const rec   = (existing && existing.length) ? existing[0] : new Record(col);
      const isNew = !(existing && existing.length);

      if (isNew) {
        rec.set("user",        userId);
        rec.set("mt5_account", mt5Acct.id);
        rec.set("mt5_ticket",  ticket);
        rec.set("source",      "mt5_ea");
        rec.set("trade_date",  san(String(t.open_time || "").slice(0, 10), 20));
        rec.set("trade_time",  san(String(t.open_time || "").slice(11, 16), 10));
        rec.set("pair",        san(String(t.symbol || ""), 20));
        rec.set("direction",   t.type === 0 ? "LONG" : "SHORT");
        rec.set("lot_size",    Math.abs(Number(t.lots) || 0));
        rec.set("entry_price", Number(t.open_price)    || 0);
      }

      rec.set("sl", Number(t.sl) || 0);
      rec.set("tp", Number(t.tp) || 0);

      if (evt === "trade_close" || t.close_price) {
        rec.set("exit_price", Number(t.close_price) || 0);
        rec.set("pnl",        Number(t.profit)      || 0);
        rec.set("commission", Number(t.commission)  || 0);
        rec.set("swap",       Number(t.swap)        || 0);
        rec.set("is_open",    false);
        rec.set("closed_at",  new Date().toISOString());
      } else {
        rec.set("is_open", true);
      }

      $app.dao().saveRecord(rec);
      mt5Acct.set("last_sync", new Date().toISOString());
      $app.dao().saveRecord(mt5Acct);
      return c.json(200, { status: "ok", ticket });
    } catch (e) {
      return c.json(500, { error: "Save failed" });
    }
  }

  return c.json(400, { error: "Unhandled event" });
});

// ── Public investor token endpoint ────────────────────────────────────────────
routerAdd("GET", "/api/investor/:token", (c) => {
  const ip = c.realIP();
  if (rateLimit("inv:" + ip, 30, 60000)) return c.json(429, { error: "Too many requests" });

  const token = san(c.pathParam("token") || "", 128);
  if (!token || token.length < 16) return c.json(400, { error: "Invalid token" });

  try {
    const links = $app.dao().findRecordsByFilter(
      "investor_links",
      "token = {:tok} && is_active = true",
      { tok: token }, 1, 0
    );
    if (!links || !links.length) return c.json(404, { error: "Link not found" });
    const link = links[0];

    const exp = link.get("expires_at");
    if (exp && new Date(exp) < new Date()) return c.json(410, { error: "Link expired" });

    const uid      = link.get("user");
    const showPnl  = link.get("show_pnl");
    const showLots = link.get("show_lot_size");

    var displayName = "Trader";
    try {
      const profiles = $app.dao().findRecordsByFilter("profiles", "user = {:uid}", { uid }, 1, 0);
      if (profiles && profiles.length) displayName = profiles[0].get("display_name") || "Trader";
    } catch (e) { /* non-fatal */ }

    const trades = $app.dao().findRecordsByFilter(
      "trades", "user = {:uid}", { uid }, 500, 0
    );

    const safeTrades = trades.map(function(t) {
      return {
        id:            t.id,
        trade_date:    t.get("trade_date"),
        pair:          t.get("pair"),
        direction:     t.get("direction"),
        session:       t.get("session"),
        setup:         t.get("setup"),
        rr:            t.get("rr"),
        grade:         t.get("grade"),
        pips:          t.get("pips"),
        followed_plan: t.get("followed_plan"),
        tags:          t.get("tags"),
        is_open:       t.get("is_open"),
        pnl:           showPnl  ? t.get("pnl")      : null,
        lot_size:      showLots ? t.get("lot_size")  : null,
      };
    });

    link.set("views",       (link.get("views") || 0) + 1);
    link.set("last_viewed", new Date().toISOString());
    $app.dao().saveRecord(link);

    return c.json(200, {
      display_name: displayName,
      label:        link.get("label"),
      show_pnl:     showPnl,
      show_lots:    showLots,
      trades:       safeTrades,
    });
  } catch (e) {
    return c.json(500, { error: "Server error" });
  }
});

// ── AI Performance Coach ──────────────────────────────────────────────────────
// Single registration — duplicate removed.
// Requires ANTHROPIC_API_KEY in Railway environment variables.
// Gated behind tier >= 2 (Pro and above).
routerAdd("POST", "/api/ai-coach", (c) => {
  const ip = c.realIP();
  if (rateLimit("ai-coach:" + ip, 10, 3600000)) {
    return c.json(429, { error: "Rate limit reached — max 10 analyses per hour." });
  }

  // Auth via PocketBase requestInfo (reads Authorization header automatically)
  let userId;
  try {
    const authRecord = $apis.requestInfo(c).authRecord;
    if (!authRecord || !authRecord.id) return c.json(401, { error: "Authentication required" });
    userId = authRecord.id;
  } catch (e) {
    return c.json(401, { error: "Authentication required" });
  }

  // Tier gate
  var userTier = 0;
  try {
    const profiles = $app.dao().findRecordsByFilter("profiles", "user = {:uid}", { uid: userId }, 1, 0);
    if (profiles && profiles.length) userTier = Number(profiles[0].get("tier")) || 0;
  } catch (e) { /* allow, will fail tier check below */ }

  if (userTier < 2) {
    return c.json(403, {
      error: "AI Coach is available on the Pro plan ($19/mo) and above. Please upgrade."
    });
  }

  // Parse stats payload
  var stats;
  try {
    stats = $apis.requestInfo(c).data;
    if (!stats || typeof stats !== "object") return c.json(400, { error: "Invalid stats payload" });
  } catch (e) {
    return c.json(400, { error: "Invalid request body" });
  }

  // Read API key via $os.getenv — correct for goja runtime
  const anthropicKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!anthropicKey || anthropicKey.length < 20) {
    return c.json(503, { error: "AI Coach not configured. Set ANTHROPIC_API_KEY in Railway." });
  }

  const prompt = `You are a professional trading performance coach specialising in ICT Smart Money Concepts, institutional order flow, and trading psychology.

Analyse the following trader's performance statistics and produce a structured written evaluation. Be specific, data-driven, and constructive. Do not be generic.

## Trader Statistics
- Date range analysed: ${san(String(stats.dateRange || "Last 30 days"), 100)}
- Total trades: ${Number(stats.totalTrades) || 0}
- Win rate: ${Number(stats.winRate) || 0}%
- Profit factor: ${Number(stats.profitFactor) || 0}
- Expectancy: ${Number(stats.expectancy) || 0}R
- Average RR achieved: ${Number(stats.avgRR) || 0}
- Total P&L: ${Number(stats.totalPnl) || 0}
- Max drawdown: ${Number(stats.maxDrawdown) || 0}%

## Session breakdown (win rate per session)
${san(JSON.stringify(stats.sessionStats || {}), 500)}

## Setup performance (win rate per setup type)
${san(JSON.stringify(stats.setupStats || {}), 500)}

## Psychology data
- Plan adherence rate: ${Number(stats.planAdherence) || 0}%
- Most common emotion at trade entry: ${san(String(stats.topEmotion || "Not recorded"), 50)}
- Grade distribution (A+ to F): ${san(JSON.stringify(stats.gradeDistribution || {}), 200)}
- Revenge trading incidents: ${Number(stats.revengeCount) || 0}
- Overtrading days: ${Number(stats.overtradingDays) || 0}

## Day-of-week P&L pattern
${san(JSON.stringify(stats.dowStats || {}), 300)}

Respond in the following JSON structure only — no markdown, no preamble:
{
  "headline": "One sentence overall verdict",
  "score": <integer 0-100>,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "sessionAnalysis": "2-3 sentences on session performance patterns",
  "setupAnalysis": "2-3 sentences on which setups are working and which aren't",
  "psychologyAnalysis": "2-3 sentences on emotional patterns and discipline",
  "riskAnalysis": "2-3 sentences on risk management and RR discipline",
  "recommendations": ["action 1", "action 2", "action 3", "action 4"],
  "focusForNextWeek": "One specific, actionable focus point for the coming week"
}`;

  var analysisText;
  try {
    const resp = $http.send({
      method: "POST",
      url:    "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages:   [{ role: "user", content: prompt }],
      }),
      timeout: 30,
    });

    if (resp.statusCode !== 200) {
      console.error("Anthropic API error:", resp.statusCode, resp.raw);
      return c.json(502, { error: "AI service temporarily unavailable. Please try again." });
    }

    const body = JSON.parse(resp.raw);
    analysisText = (body && body.content && body.content[0] && body.content[0].text) || "";
    if (!analysisText) return c.json(502, { error: "Empty response from AI service" });

  } catch (e) {
    console.error("AI coach fetch failed:", e);
    return c.json(502, { error: "Could not reach AI service. Please try again shortly." });
  }

  var analysis;
  try {
    const cleaned = analysisText.replace(/```json|```/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch (e) {
    return c.json(200, { raw: analysisText, parsed: false });
  }

  // Optionally store analysis history
  try {
    const col = $app.dao().findCollectionByNameOrId("ai_analyses");
    if (col) {
      const rec = new Record(col);
      rec.set("user",           userId);
      rec.set("stats_snapshot", JSON.stringify(stats));
      rec.set("analysis",       JSON.stringify(analysis));
      rec.set("score",          Number(analysis.score) || 0);
      $app.dao().saveRecord(rec);
    }
  } catch (e) { /* non-fatal — collection may not exist yet */ }

  return c.json(200, { analysis, parsed: true });
});

// ── Stripe webhook ────────────────────────────────────────────────────────────
routerAdd("POST", "/api/stripe/webhook", (c) => {
  if (rateLimit("stripe", 100, 60000)) return c.json(429, { error: "Rate limited" });

  var body;
  try {
    body = $apis.requestInfo(c).data;
    if (!body) return c.json(400, { error: "Empty payload" });
  } catch (e) {
    return c.json(400, { error: "Invalid payload" });
  }

  const TIER_MAP = {
    "price_starter":   1,
    "price_pro":       2,
    "price_advanced":  3,
    "price_elite":     4,
    "price_tier1":     2,
    "price_tier2":     2,
    "price_tier3":     3,
    "price_tier4":     4,
    "price_tier5":     4,
  };

  const evtType = String(body.type || "");

  if (evtType === "customer.subscription.created" || evtType === "customer.subscription.updated") {
    const sub = body.data && body.data.object;
    if (!sub) return c.json(400, { error: "No subscription object" });
    const cid     = String(sub.customer || "");
    const priceId = (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || "";
    const tier    = TIER_MAP[priceId] || 1;
    try {
      const rows = $app.dao().findRecordsByFilter("profiles", "stripe_customer_id = {:cid}", { cid }, 1, 0);
      if (rows && rows.length) {
        rows[0].set("tier",                    tier);
        rows[0].set("subscription_status",     String(sub.status || "active"));
        rows[0].set("stripe_subscription_id",  String(sub.id || ""));
        $app.dao().saveRecord(rows[0]);
      }
    } catch (e) { /* non-fatal */ }
  }

  if (evtType === "customer.subscription.deleted") {
    const