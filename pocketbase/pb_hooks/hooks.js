/// <reference path="../pb_data/types.d.ts" />

// ─── EDGE Journal — PocketBase Server Hooks ───────────────────────────────────
// Runtime: goja (not Node.js) — no require(), no process.env, no Node crypto.
// PocketBase v0.23+ API — all handlers use (e) parameter, e.next() for middleware.
// $app.dao() replaced with $app directly for record operations.

// ── In-memory rate limiter ────────────────────────────────────────────────────
const rl = new Map();
function rateLimit(key, max, windowMs) {
  const now  = Date.now();
  const entry = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.n = 0; entry.reset = now + windowMs; }
  entry.n++;
  rl.set(key, entry);
  return entry.n > max;
}

// ── Sanitise ──────────────────────────────────────────────────────────────────
function san(str, max) {
  max = max || 500;
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").slice(0, max).trim();
}

// ── Hash API key ──────────────────────────────────────────────────────────────
function hashKey(plain) {
  return $security.sha256(plain + "edge_journal_salt");
}

// ── Allowed origins ───────────────────────────────────────────────────────────
var ALLOWED_ORIGINS = [
  "https://edge-journal-sepia.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

// ── CORS + Security headers middleware ────────────────────────────────────────
// FIX: v0.23+ middleware uses (e) parameter.
// FIX: e.next() MUST be called for non-OPTIONS requests so PocketBase
//      continues processing the request. Without it every request returned 400.
routerAdd("USE", "/*", (e) => {
  const origin = e.request.header.get("Origin") || "";

  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    e.response.header().set("Access-Control-Allow-Origin",      origin);
    e.response.header().set("Access-Control-Allow-Methods",     "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    e.response.header().set("Access-Control-Allow-Headers",     "Content-Type, Authorization, X-Token");
    e.response.header().set("Access-Control-Allow-Credentials", "true");
    e.response.header().set("Vary",                             "Origin");
  }

  // Handle preflight — respond immediately, do NOT call next()
  if (e.request.method === "OPTIONS") {
    e.response.writeHeader(204);
    return;
  }

  // Security headers
  e.response.header().set("X-Content-Type-Options", "nosniff");
  e.response.header().set("X-Frame-Options",         "SAMEORIGIN");
  e.response.header().set("X-XSS-Protection",        "1; mode=block");
  e.response.header().set("Referrer-Policy",          "strict-origin-when-cross-origin");
  e.response.header().set("Permissions-Policy",       "camera=(), microphone=(), geolocation=()");
  e.response.header().set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com;"
  );

  // FIX: this is the critical line that was missing — passes the request through
  e.next();
});

// ── MT5 account — hash api_key_plain before saving ───────────────────────────
onRecordBeforeCreateRequest((e) => {
  if (e.record.collection().name !== "mt5_accounts") return;

  const plain = String(e.record.get("api_key_plain") || "");
  if (plain.length < 10) {
    throw new BadRequestError("API key is too short or missing.");
  }

  try {
    e.record.set("api_key_hash",  hashKey(plain));
    e.record.set("api_key_plain", "");
  } catch (err) {
    throw new BadRequestError("Failed to hash API key — record not created.");
  }
}, "mt5_accounts");

// ── MT5 EA sync endpoint ──────────────────────────────────────────────────────
// FIX: v0.23+ uses (e) parameter throughout. $app.dao() replaced with $app.
routerAdd("POST", "/api/mt5/sync", (e) => {
  const ip = e.realIP();
  if (rateLimit("mt5:" + ip, 120, 60000)) {
    return e.json(429, { error: "Rate limit exceeded" });
  }

  const auth   = e.request.header.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return e.json(401, { error: "Missing API key" });
  const apiKey = auth.slice(7).trim();
  if (!apiKey || apiKey.length < 20) return e.json(401, { error: "Invalid API key" });

  const keyHash = hashKey(apiKey);

  let mt5Acct;
  try {
    const rows = $app.findRecordsByFilter(
      "mt5_accounts",
      "api_key_hash = {:h} && is_active = true && sync_enabled = true",
      "-id", 1, 0,
      { h: keyHash }
    );
    if (!rows || !rows.length) return e.json(401, { error: "Invalid API key" });
    mt5Acct = rows[0];
  } catch (err) {
    return e.json(500, { error: "Auth error" });
  }

  let payload;
  try {
    payload = e.requestInfo().body;
    if (!payload || typeof payload !== "object") return e.json(400, { error: "Invalid payload" });
  } catch (err) {
    return e.json(400, { error: "Invalid payload" });
  }

  const evt       = san(String(payload.event || ""), 30);
  const userId    = mt5Acct.get("user");
  const validEvts = ["trade_open", "trade_close", "trade_modify", "full_sync", "heartbeat"];
  if (!validEvts.includes(evt)) return e.json(400, { error: "Invalid event" });

  // Heartbeat
  if (evt === "heartbeat") {
    try {
      mt5Acct.set("last_sync", new Date().toISOString());
      if (payload.balance !== undefined) mt5Acct.set("balance", Number(payload.balance) || 0);
      if (payload.equity  !== undefined) mt5Acct.set("equity",  Number(payload.equity)  || 0);
      $app.save(mt5Acct);
    } catch (err) { /* non-fatal */ }
    return e.json(200, { status: "ok" });
  }

  // Full sync
  if (evt === "full_sync" && Array.isArray(payload.trades)) {
    var imported = 0, skipped = 0;
    const col = $app.findCollectionByNameOrId("trades");

    for (var i = 0; i < Math.min(payload.trades.length, 10000); i++) {
      const t = payload.trades[i];
      try {
        const ticket = san(String(t.ticket || ""), 30);
        if (!ticket) { skipped++; continue; }

        const existing = $app.findRecordsByFilter(
          "trades", "mt5_ticket = {:tk} && user = {:uid}",
          "-id", 1, 0,
          { tk: ticket, uid: userId }
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
        $app.save(rec);
        imported++;
      } catch (err) { skipped++; }
    }

    try {
      const sCol = $app.findCollectionByNameOrId("sync_logs");
      const sRec = new Record(sCol);
      sRec.set("mt5_account", mt5Acct.id);
      sRec.set("event_type",  "full_sync");
      sRec.set("payload",     { imported, skipped });
      sRec.set("ip_address",  ip);
      $app.save(sRec);
    } catch (err) { /* non-fatal — sync_logs collection may not exist */ }

    mt5Acct.set("last_sync", new Date().toISOString());
    $app.save(mt5Acct);
    return e.json(200, { status: "ok", imported, skipped });
  }

  // Single trade event
  if (["trade_open", "trade_close", "trade_modify"].includes(evt) && payload.trade) {
    const t      = payload.trade;
    const ticket = san(String(t.ticket || ""), 30);
    if (!ticket) return e.json(400, { error: "Missing ticket" });

    try {
      const existing = $app.findRecordsByFilter(
        "trades", "mt5_ticket = {:tk} && user = {:uid}",
        "-id", 1, 0,
        { tk: ticket, uid: userId }
      );
      const col   = $app.findCollectionByNameOrId("trades");
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

      $app.save(rec);
      mt5Acct.set("last_sync", new Date().toISOString());
      $app.save(mt5Acct);
      return e.json(200, { status: "ok", ticket });
    } catch (err) {
      return e.json(500, { error: "Save failed" });
    }
  }

  return e.json(400, { error: "Unhandled event" });
});

// ── Public investor token endpoint ────────────────────────────────────────────
// FIX: path param syntax changed from :token to {token} in v0.23+
// FIX: c.pathParam() replaced with e.request.pathValue()
// NOTE: investor_link.pb.js must be DELETED — this is the single source of truth
routerAdd("GET", "/api/investor/{token}", (e) => {
  const ip = e.realIP();
  if (rateLimit("inv:" + ip, 30, 60000)) return e.json(429, { error: "Too many requests" });

  const token = san(e.request.pathValue("token") || "", 128);
console.log("INVESTOR TOKEN:", token);

	const links = $app.findRecordsByFilter(
	  "investor_links",
	  "token = {:tok} && is_active = true",
	  "-id",
	  1,
	  0,
	  { tok: token }
	);

	console.log("LINK COUNT:", links ? links.length : 0);
  if (!token || token.length < 16) return e.json(400, { error: "Invalid token" });

  try {
    const links = $app.findRecordsByFilter(
      "investor_links",
      "token = {:tok} && is_active = true",
      "-id", 1, 0,
      { tok: token }
    );
    if (!links || !links.length) return e.json(404, { error: "Link not found" });
    const link = links[0];

    const exp = link.get("expires_at");
    if (exp && new Date(exp) < new Date()) return e.json(410, { error: "Link expired" });

    const uid      = link.get("user");
    const showPnl  = link.get("show_pnl");
    const showLots = link.get("show_lot_size");

    var displayName = "Trader";
    try {
      const profiles = $app.findRecordsByFilter(
        "profiles", "user = {:uid}", "-id", 1, 0, { uid }
      );
      if (profiles && profiles.length) displayName = profiles[0].get("display_name") || "Trader";
    } catch (err) { /* non-fatal */ }

    const trades = $app.findRecordsByFilter(
      "trades", "user = {:uid}", "-trade_date", 500, 0, { uid }
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
        pnl:           showPnl  ? t.get("pnl")     : null,
        lot_size:      showLots ? t.get("lot_size") : null,
      };
    });

    link.set("views",       (link.get("views") || 0) + 1);
    link.set("last_viewed", new Date().toISOString());
    $app.save(link);

    return e.json(200, {
      display_name: displayName,
      label:        link.get("label"),
      show_pnl:     showPnl,
      show_lots:    showLots,
      trades:       safeTrades,
    });
  } catch (err) {
    return e.json(500, { error: "Server error" });
  }
});

// ── Profile auto-create after user registration ───────────────────────────────
onRecordAfterCreateRequest((e) => {
  if (e.record.collection().name !== "users") return;

  try {
    const col = $app.findCollectionByNameOrId("profiles");
    const rec = new Record(col);
    rec.set("user",                  e.record.id);
    rec.set("display_name",          e.record.get("name") || "");
    rec.set("tier",                  0);
    rec.set("subscription_status",   "trial");
    rec.set("trial_ends_at",         new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
    rec.set("investor_link_enabled", false);
    rec.set("theme",                 "system");
    rec.set("sidebar_collapsed",     false);
    rec.set("ads_enabled",           true);
    rec.set("default_lot_size",      0.01);
    rec.set("default_currency",      "USD");
    $app.save(rec);
  } catch (err) {
    console.error("Failed to auto-create profile for user", e.record.id, err);
  }
}, "users");

// ── AI Performance Coach ──────────────────────────────────────────────────────
routerAdd("POST", "/api/ai-coach", (e) => {
  const ip = e.realIP();
  if (rateLimit("ai-coach:" + ip, 10, 3600000)) {
    return e.json(429, { error: "Rate limit reached — max 10 analyses per hour." });
  }

  let userId;
  try {
    const authRecord = e.auth;
    if (!authRecord || !authRecord.id) return e.json(401, { error: "Authentication required" });
    userId = authRecord.id;
  } catch (err) {
    return e.json(401, { error: "Authentication required" });
  }

  var userTier = 0;
  try {
    const profiles = $app.findRecordsByFilter(
      "profiles", "user = {:uid}", "-id", 1, 0, { uid: userId }
    );
    if (profiles && profiles.length) userTier = Number(profiles[0].get("tier")) || 0;
  } catch (err) { /* allow, will fail tier check below */ }

  if (userTier < 2) {
    return e.json(403, {
      error: "AI Coach is available on the Pro plan ($19/mo) and above. Please upgrade."
    });
  }

  var stats;
  try {
    stats = e.requestInfo().body;
    if (!stats || typeof stats !== "object") return e.json(400, { error: "Invalid stats payload" });
  } catch (err) {
    return e.json(400, { error: "Invalid request body" });
  }

  const anthropicKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!anthropicKey || anthropicKey.length < 20) {
    return e.json(503, { error: "AI Coach not configured. Set ANTHROPIC_API_KEY in Railway." });
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
      return e.json(502, { error: "AI service temporarily unavailable. Please try again." });
    }

    const body = JSON.parse(resp.raw);
    analysisText = (body && body.content && body.content[0] && body.content[0].text) || "";
    if (!analysisText) return e.json(502, { error: "Empty response from AI service" });

  } catch (err) {
    console.error("AI coach fetch failed:", err);
    return e.json(502, { error: "Could not reach AI service. Please try again shortly." });
  }

  var analysis;
  try {
    const cleaned = analysisText.replace(/```json|```/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch (err) {
    return e.json(200, { raw: analysisText, parsed: false });
  }

  try {
    const col = $app.findCollectionByNameOrId("ai_analyses");
    if (col) {
      const rec = new Record(col);
      rec.set("user",           userId);
      rec.set("stats_snapshot", JSON.stringify(stats));
      rec.set("analysis",       JSON.stringify(analysis));
      rec.set("score",          Number(analysis.score) || 0);
      $app.save(rec);
    }
  } catch (err) { /* non-fatal */ }

  return e.json(200, { analysis, parsed: true });
});

// ── Stripe webhook ────────────────────────────────────────────────────────────
routerAdd("POST", "/api/stripe/webhook", (e) => {
  if (rateLimit("stripe", 100, 60000)) return e.json(429, { error: "Rate limited" });

  var body;
  try {
    body = e.requestInfo().body;
    if (!body) return e.json(400, { error: "Empty payload" });
  } catch (err) {
    return e.json(400, { error: "Invalid payload" });
  }

  const TIER_MAP = {
    "price_starter":  1,
    "price_pro":      2,
    "price_advanced": 3,
    "price_elite":    4,
    "price_tier1":    2,
    "price_tier2":    2,
    "price_tier3":    3,
    "price_tier4":    4,
    "price_tier5":    4,
  };

  const evtType = String(body.type || "");

  if (evtType === "customer.subscription.created" || evtType === "customer.subscription.updated") {
    const sub = body.data && body.data.object;
    if (!sub) return e.json(400, { error: "No subscription object" });
    const cid     = String(sub.customer || "");
    const priceId = (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || "";
    const tier    = TIER_MAP[priceId] || 1;
    try {
      const rows = $app.findRecordsByFilter(
        "profiles", "stripe_customer_id = {:cid}", "-id", 1, 0, { cid }
      );
      if (rows && rows.length) {
        rows[0].set("tier",                   tier);
        rows[0].set("subscription_status",    String(sub.status || "active"));
        rows[0].set("stripe_subscription_id", String(sub.id || ""));
        $app.save(rows[0]);
      }
    } catch (err) { /* non-fatal */ }
  }

  if (evtType === "customer.subscription.deleted") {
    const sub = body.data && body.data.object;
    if (sub) {
      const cid = String(sub.customer || "");
      try {
        const rows = $app.findRecordsByFilter(
          "profiles", "stripe_customer_id = {:cid}", "-id", 1, 0, { cid }
        );
        if (rows && rows.length) {
          rows[0].set("tier",               1);
          rows[0].set("subscription_status","canceled");
          $app.save(rows[0]);
        }
      } catch (err) { /* non-fatal */ }
    }
  }

  return e.json(200, { received: true });
});
