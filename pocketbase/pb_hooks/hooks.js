/// <reference path="../pb_data/types.d.ts" />

// ─── EDGE Journal — PocketBase Server Hooks ───────────────────────────────────
const crypto = require("crypto");

// ── In-memory rate limiter ────────────────────────────────────────────────────
const rl = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const e = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > e.reset) { e.n = 0; e.reset = now + windowMs; }
  e.n++;
  rl.set(key, e);
  return e.n > max;
}

// ── Sanitise ──────────────────────────────────────────────────────────────────
function san(str, max = 500) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").slice(0, max).trim();
}

// ── Hash API key with server salt ─────────────────────────────────────────────
function hashKey(key) {
  const salt = $app.settings().meta.senderAddress || "edge_salt";
  return crypto.createHash("sha256").update(key + salt).digest("hex");
}

// ── Security headers on every response ───────────────────────────────────────
routerAdd("USE", "/*", (c) => {
  c.response().header().set("X-Content-Type-Options", "nosniff");
  c.response().header().set("X-Frame-Options", "DENY");
  c.response().header().set("X-XSS-Protection", "1; mode=block");
  c.response().header().set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.response().header().set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.response().header().set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com;"
  );
});

// ── MT5 EA sync endpoint ──────────────────────────────────────────────────────
routerAdd("POST", "/api/mt5/sync", (c) => {
  const ip = c.realIP();
  if (rateLimit("mt5:" + ip, 120, 60000)) {
    return c.json(429, { error: "Rate limit exceeded" });
  }

  // Validate Bearer API key
  const auth = c.request().header.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return c.json(401, { error: "Missing API key" });
  const apiKey = auth.slice(7).trim();
  if (!apiKey || apiKey.length < 20) return c.json(401, { error: "Invalid API key" });
  const keyHash = hashKey(apiKey);

  // Find MT5 account by key hash
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

  // Parse body via PocketBase request info
  let payload;
  try {
    payload = $apis.requestInfo(c).data;
    if (!payload || typeof payload !== "object") {
      return c.json(400, { error: "Invalid payload" });
    }
  } catch (e) {
    return c.json(400, { error: "Invalid payload" });
  }

  const evt    = san(String(payload.event || ""), 30);
  const userId = mt5Acct.get("user");
  const validEvts = ["trade_open","trade_close","trade_modify","full_sync","heartbeat"];
  if (!validEvts.includes(evt)) return c.json(400, { error: "Invalid event" });

  // Heartbeat
  if (evt === "heartbeat") {
    try {
      mt5Acct.set("last_sync", new Date().toISOString());
      if (payload.balance !== undefined) mt5Acct.set("balance", Number(payload.balance)||0);
      if (payload.equity  !== undefined) mt5Acct.set("equity",  Number(payload.equity)||0);
      $app.dao().saveRecord(mt5Acct);
    } catch(e) {}
    return c.json(200, { status: "ok" });
  }

  // Full sync — import historical trades array
  if (evt === "full_sync" && Array.isArray(payload.trades)) {
    let imported = 0, skipped = 0;
    const col = $app.dao().findCollectionByNameOrId("trades");

    for (const t of payload.trades.slice(0, 10000)) {
      try {
        const ticket = san(String(t.ticket || ""), 30);
        if (!ticket) { skipped++; continue; }

        // Deduplicate by ticket
        const existing = $app.dao().findRecordsByFilter(
          "trades", "mt5_ticket = {:tk} && user = {:uid}", { tk: ticket, uid: userId }, 1, 0
        );
        if (existing && existing.length) { skipped++; continue; }

        const rec = new Record(col);
        rec.set("user",       userId);
        rec.set("mt5_account",mt5Acct.id);
        rec.set("mt5_ticket", ticket);
        rec.set("source",     "mt5_import");
        rec.set("trade_date", san(String(t.open_time||"").slice(0,10), 20));
        rec.set("trade_time", san(String(t.open_time||"").slice(11,16), 10));
        rec.set("pair",       san(String(t.symbol||""), 20));
        rec.set("direction",  t.type === 0 ? "LONG" : "SHORT");
        rec.set("lot_size",   Math.abs(Number(t.lots)||0));
        rec.set("entry_price",Number(t.open_price)||0);
        rec.set("exit_price", Number(t.close_price)||0);
        rec.set("sl",         Number(t.sl)||0);
        rec.set("tp",         Number(t.tp)||0);
        rec.set("pnl",        Number(t.profit)||0);
        rec.set("commission", Number(t.commission)||0);
        rec.set("swap",       Number(t.swap)||0);
        rec.set("is_open",    !t.close_time);
        rec.set("closed_at",  t.close_time ? san(String(t.close_time),30) : null);
        $app.dao().saveRecord(rec);
        imported++;
      } catch(e) { skipped++; }
    }

    // Log
    try {
      const sCol = $app.dao().findCollectionByNameOrId("sync_logs");
      const sRec = new Record(sCol);
      sRec.set("mt5_account", mt5Acct.id);
      sRec.set("event_type",  "full_sync");
      sRec.set("payload",     { imported, skipped });
      sRec.set("ip_address",  ip);
      $app.dao().saveRecord(sRec);
    } catch(e) {}

    mt5Acct.set("last_sync", new Date().toISOString());
    $app.dao().saveRecord(mt5Acct);
    return c.json(200, { status:"ok", imported, skipped });
  }

  // Single trade event
  if (["trade_open","trade_close","trade_modify"].includes(evt) && payload.trade) {
    const t      = payload.trade;
    const ticket = san(String(t.ticket||""), 30);
    if (!ticket) return c.json(400, { error: "Missing ticket" });

    try {
      const existing = $app.dao().findRecordsByFilter(
        "trades", "mt5_ticket = {:tk} && user = {:uid}", { tk: ticket, uid: userId }, 1, 0
      );
      const col = $app.dao().findCollectionByNameOrId("trades");
      const rec = (existing && existing.length) ? existing[0] : new Record(col);
      const isNew = !(existing && existing.length);

      if (isNew) {
        rec.set("user",        userId);
        rec.set("mt5_account", mt5Acct.id);
        rec.set("mt5_ticket",  ticket);
        rec.set("source",      "mt5_ea");
        rec.set("trade_date",  san(String(t.open_time||"").slice(0,10), 20));
        rec.set("trade_time",  san(String(t.open_time||"").slice(11,16), 10));
        rec.set("pair",        san(String(t.symbol||""), 20));
        rec.set("direction",   t.type === 0 ? "LONG" : "SHORT");
        rec.set("lot_size",    Math.abs(Number(t.lots)||0));
        rec.set("entry_price", Number(t.open_price)||0);
      }

      rec.set("sl", Number(t.sl)||0);
      rec.set("tp", Number(t.tp)||0);

      if (evt === "trade_close" || t.close_price) {
        rec.set("exit_price", Number(t.close_price)||0);
        rec.set("pnl",        Number(t.profit)||0);
        rec.set("commission", Number(t.commission)||0);
        rec.set("swap",       Number(t.swap)||0);
        rec.set("is_open",    false);
        rec.set("closed_at",  new Date().toISOString());
      } else {
        rec.set("is_open", true);
      }

      $app.dao().saveRecord(rec);
      mt5Acct.set("last_sync", new Date().toISOString());
      $app.dao().saveRecord(mt5Acct);
      return c.json(200, { status:"ok", ticket });
    } catch(e) {
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
      "investor_links", "token = {:tok} && is_active = true", { tok: token }, 1, 0
    );
    if (!links || !links.length) return c.json(404, { error: "Link not found" });
    const link = links[0];

    // Check expiry
    const exp = link.get("expires_at");
    if (exp && new Date(exp) < new Date()) return c.json(410, { error: "Link expired" });

    const uid       = link.get("user");
    const showPnl   = link.get("show_pnl");
    const showLots  = link.get("show_lot_size");

    // Get user profile (display name only)
    let displayName = "Trader";
    try {
      const profiles = $app.dao().findRecordsByFilter("profiles","user = {:uid}",{uid},1,0);
      if (profiles && profiles.length) displayName = profiles[0].get("display_name") || "Trader";
    } catch(e) {}

    // Fetch trades — limited fields
    const trades = $app.dao().findRecordsByFilter(
      "trades", "user = {:uid}", { uid }, 500, 0
    );

    const safeTrades = trades.map(t => ({
      id:           t.id,
      trade_date:   t.get("trade_date"),
      pair:         t.get("pair"),
      direction:    t.get("direction"),
      session:      t.get("session"),
      setup:        t.get("setup"),
      rr:           t.get("rr"),
      grade:        t.get("grade"),
      pips:         t.get("pips"),
      followed_plan:t.get("followed_plan"),
      tags:         t.get("tags"),
      is_open:      t.get("is_open"),
      pnl:          showPnl  ? t.get("pnl")      : null,
      lot_size:     showLots ? t.get("lot_size")  : null,
    }));

    // Increment view count
    link.set("views",       (link.get("views")||0) + 1);
    link.set("last_viewed", new Date().toISOString());
    $app.dao().saveRecord(link);

    return c.json(200, {
      display_name: displayName,
      label:        link.get("label"),
      show_pnl:     showPnl,
      show_lots:    showLots,
      trades:       safeTrades,
    });
  } catch(e) {
    return c.json(500, { error: "Server error" });
  }
});

// ── AI Performance Coach ──────────────────────────────────────────────────────
// Receives aggregated stats from the frontend, calls the Anthropic Claude API
// server-side, and returns a structured written performance evaluation.
// Requires ANTHROPIC_API_KEY in Railway environment variables.
// Gated behind tier >= 2 (Pro and above).
routerAdd("POST", "/api/ai-coach", (c) => {
  // Rate limit: 10 analyses per user per hour (each costs ~$0.003)
  const ip = c.realIP();
  if (rateLimit("ai-coach:" + ip, 10, 3600000)) {
    return c.json(429, { error: "Rate limit reached — max 10 analyses per hour." });
  }

  // Authenticate the request — require a valid user JWT
  const authHeader = c.request().header.get("Authorization") || "";
  if (!authHeader) return c.json(401, { error: "Authentication required" });

  let userId;
  try {
    // PocketBase validates the token and returns the auth record
    const authData = $apis.requestInfo(c).authRecord;
    if (!authData) return c.json(401, { error: "Invalid token" });
    userId = authData.id;
  } catch(e) {
    return c.json(401, { error: "Invalid token" });
  }

  // Check tier — must be Pro (2) or above
  let tier = 0;
  try {
    const profiles = $app.dao().findRecordsByFilter("profiles","user = {:uid}",{uid:userId},1,0);
    if (profiles && profiles.length) tier = Number(profiles[0].get("tier")) || 0;
  } catch(e) {}

  if (tier < 2) {
    return c.json(403, { error: "AI Coach is available on Pro ($19/mo) and above. Upgrade in Settings → Billing." });
  }

  // Parse the stats payload from the frontend
  let payload;
  try {
    payload = $apis.requestInfo(c).data;
    if (!payload || !payload.stats) return c.json(400, { error: "Missing stats payload" });
  } catch(e) {
    return c.json(400, { error: "Invalid payload" });
  }

  const stats = payload.stats;

  // Build the analysis prompt — structured for a focused, actionable evaluation
  const prompt = `You are an expert ICT trading coach and performance analyst. Analyze the following trading statistics and provide a detailed, honest, and actionable performance evaluation.

TRADING STATISTICS (Last ${stats.period_days} days):
- Total trades: ${stats.total_trades} (${stats.closed_trades} closed)
- Win rate: ${stats.win_rate}
- Total P&L: $${stats.total_pnl}
- Profit factor: ${stats.profit_factor}
- Average R:R on winners: ${stats.average_rr}R
- Gross profit: $${stats.gross_profit} | Gross loss: $${stats.gross_loss}
- Plan adherence: ${stats.plan_adherence}
- Common mistakes logged: ${stats.common_mistakes}

SESSION PERFORMANCE:
${JSON.stringify(stats.session_performance, null, 2)}

TOP SETUPS BY TRADE COUNT:
${JSON.stringify(stats.top_setups, null, 2)}

EMOTION vs P&L BREAKDOWN:
${JSON.stringify(stats.emotion_pnl, null, 2)}

GRADE DISTRIBUTION:
${JSON.stringify(stats.grade_distribution, null, 2)}

Provide a structured evaluation covering exactly these sections:

## Overall Performance Summary
A concise assessment of the trader's current performance level. Be honest — if numbers are poor, say so clearly.

## Win Rate & Profit Factor Analysis
Analyse whether the win rate and profit factor together indicate a healthy edge. Consider that a low win rate can still be profitable with high R:R, and vice versa.

## Session Performance
Identify the trader's best and worst performing sessions. Flag any sessions where the trader is losing money and recommend action.

## Setup & Strategy Analysis
Rank the setups by performance. Identify which setups are generating edge and which are destroying it. Be specific.

## Psychology & Discipline Assessment
Evaluate the emotion data and plan adherence rate. Identify behavioral patterns — revenge trading, overtrading, FOMO — if the data suggests them. Reference the logged mistakes.

## Key Strengths
2-3 specific things this trader is doing well, backed by the data.

## Priority Improvements
3-5 specific, actionable improvements ranked by expected impact. Be concrete — not "work on discipline" but "your London session win rate is 38% vs 61% in NY — stop trading London until you identify why."

Keep the tone direct, professional, and coach-like. Use data to support every claim. Total length: 400-600 words.`;

  // Call the Anthropic API
  const apiKey = $app.settings().meta.senderAddress; // Reuse this field OR use a dedicated env var
  // Better: read from environment variable ANTHROPIC_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY || apiKey;

  if (!anthropicKey || anthropicKey.length < 20) {
    return c.json(500, { error: "ANTHROPIC_API_KEY not configured. Add it to your Railway environment variables." });
  }

  let evaluation;
  try {
    const response = $http.send({
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1200,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (response.statusCode !== 200) {
      const errData = JSON.parse(response.raw || "{}");
      return c.json(500, { error: "Claude API error: " + (errData.error?.message || response.statusCode) });
    }

    const body = JSON.parse(response.raw);
    evaluation  = (body.content && body.content[0] && body.content[0].text) || "";

    if (!evaluation) return c.json(500, { error: "Empty response from Claude API" });

  } catch(e) {
    return c.json(500, { error: "Failed to reach Anthropic API: " + String(e) });
  }

  // Optionally log the analysis (no sensitive data stored, just metadata)
  try {
    const col = $app.dao().findCollectionByNameOrId("sync_logs");
    if (col) {
      const log = new Record(col);
      log.set("user",    userId);
      log.set("event",   "ai_coach_analysis");
      log.set("message", `Analysis for ${stats.period_days}d period, ${stats.total_trades} trades`);
      $app.dao().saveRecord(log);
    }
  } catch(e) { /* non-fatal */ }

  return c.json(200, { evaluation });
});


routerAdd("POST", "/api/stripe/webhook", (c) => {
  if (rateLimit("stripe", 100, 60000)) return c.json(429, { error: "Rate limited" });

  let body;
  try {
    body = $apis.requestInfo(c).data;
    if (!body) return c.json(400, { error: "Empty payload" });
  } catch(e) {
    return c.json(400, { error: "Invalid payload" });
  }

  // Price IDs must match what you create in Stripe Dashboard
  // Pro=$19, Advanced=$39, Elite=$69. Update these when you create Stripe products.
  const TIER_MAP = {
    "price_starter":1,    // degraded free (manual downgrade, no Stripe product needed)
    "price_pro":    2,    // $19/mo
    "price_advanced":3,   // $39/mo
    "price_elite":  4,    // $69/mo
    // Legacy mappings — keeps old subscribers from breaking
    "price_tier1":  2,
    "price_tier2":  2,
    "price_tier3":  3,
    "price_tier4":  4,
    "price_tier5":  4,
  };
  const evtType = String(body.type || "");

  if (["customer.subscription.created","customer.subscription.updated"].includes(evtType)) {
    const sub = body.data && body.data.object;
    if (!sub) return c.json(400, { error: "No subscription object" });
    const cid    = String(sub.customer || "");
    const priceId = (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id) || "";
    const tier   = TIER_MAP[priceId] || 1;
    try {
      const rows = $app.dao().findRecordsByFilter("profiles","stripe_customer_id = {:cid}",{cid},1,0);
      if (rows && rows.length) {
        rows[0].set("tier", tier);
        rows[0].set("subscription_status", String(sub.status||"active"));
        rows[0].set("stripe_subscription_id", String(sub.id||""));
        $app.dao().saveRecord(rows[0]);
      }
    } catch(e) {}
  }

  if (evtType === "customer.subscription.deleted") {
    const sub = body.data && body.data.object;
    const cid = String((sub && sub.customer) || "");
    try {
      const rows = $app.dao().findRecordsByFilter("profiles","stripe_customer_id = {:cid}",{cid},1,0);
      if (rows && rows.length) {
        rows[0].set("tier", 0);
        rows[0].set("subscription_status", "canceled");
        $app.dao().saveRecord(rows[0]);
      }
    } catch(e) {}
  }

  return c.json(200, { received: true });
});

// ── Tier enforcement — before manual trade create ─────────────────────────────
onRecordBeforeCreateRequest((e) => {
  const rec    = e.record;
  const userId = rec.get("user");
  const source = rec.get("source");
  if (!userId || source !== "manual") return; // Only enforce on manual trades

  // Synced with src/hooks/useTrades.js TIER_LIMITS — must stay in sync
  // Tier 0 = Trial (14 days, 10 trades), 1 = Starter (free forever, degraded),
  // 2 = Pro $19, 3 = Advanced $39, 4 = Elite $69 (unlimited)
  const LIMITS = {
    0:{ trades:10,  lots:5    },   // Trial
    1:{ trades:3,   lots:0.5  },   // Starter (degraded free)
    2:{ trades:20,  lots:20   },   // Pro
    3:{ trades:50,  lots:50   },   // Advanced
    4:{ trades:9999,lots:9999 },   // Elite (and legacy tier 5)
    5:{ trades:9999,lots:9999 },   // Legacy tier 5 — treated as Elite
  };

  let tier = 0;
  try {
    const profiles = $app.dao().findRecordsByFilter("profiles","user = {:uid}",{uid:userId},1,0);
    if (profiles && profiles.length) tier = Number(profiles[0].get("tier"))||0;
  } catch(e) { return; }

  const lim   = LIMITS[tier] || LIMITS[0];
  const today = new Date().toISOString().slice(0,10);

  try {
    const todayTrades = $app.dao().findRecordsByFilter(
      "trades",
      "user = {:uid} && trade_date >= {:today} && source = 'manual'",
      { uid:userId, today }, 1000, 0
    );
    const tradeCount = todayTrades.length;
    const totalLots  = todayTrades.reduce((s,t) => s + (Number(t.get("lot_size"))||0), 0);
    const newLots    = Number(rec.get("lot_size"))||0;

    if (tradeCount >= lim.trades) {
      throw new BadRequestError(`Daily trade limit reached for your plan (${lim.trades}/day). Please upgrade to continue.`);
    }
    if (totalLots + newLots > lim.lots) {
      throw new BadRequestError(`Daily lot limit reached for your plan (${lim.lots} lots/day). Please upgrade to continue.`);
    }
  } catch(err) {
    if (err instanceof BadRequestError) throw err;
  }
}, "trades");

// ── Auto-create profile on user registration ──────────────────────────────────
onRecordAfterCreateRequest((e) => {
  const user = e.record;
  try {
    const col = $app.dao().findCollectionByNameOrId("profiles");
    const p   = new Record(col);
    p.set("user",                user.id);
    p.set("display_name",        user.get("name") || "Trader");
    p.set("tier",                0);
    p.set("subscription_status", "trial");
    p.set("trial_ends_at",       new Date(Date.now() + 14*24*60*60*1000).toISOString());
    p.set("investor_link_enabled", false);
    p.set("theme",               "system");
    p.set("sidebar_collapsed",   false);
    p.set("ads_enabled",         true);
    p.set("default_lot_size",    0.01);
    p.set("default_currency",    "USD");
    $app.dao().saveRecord(p);
  } catch(e) {
    console.error("Profile create failed:", user.id, e);
  }
}, "_pb_users_auth_");

// ── AI Performance Coach — POST /api/ai-coach ─────────────────────────────────
// Accepts aggregated trade stats from the frontend, calls Claude Sonnet via the
// Anthropic API, and returns a structured written performance evaluation.
// Gated behind Tier 2+ (Pro and above). Costs ~$0.003 per call.
// Requires env var: ANTHROPIC_API_KEY set in Railway dashboard.
routerAdd("POST", "/api/ai-coach", (c) => {
  const ip = c.realIP();
  // Tighter rate limit for AI calls — expensive and abuse-prone
  if (rateLimit("ai-coach:" + ip, 10, 60000)) {
    return c.json(429, { error: "Rate limit exceeded. Please wait before requesting another analysis." });
  }

  // ── Auth: require valid JWT ──────────────────────────────────────────────────
  const authHeader = c.request().header.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return c.json(401, { error: "Authentication required" });
  const token = authHeader.slice(7).trim();

  let userId;
  try {
    // PocketBase token verification
    const record = $app.dao().findAuthRecordByToken(token, $app.settings().meta.appName);
    userId = record.id;
  } catch (e) {
    return c.json(401, { error: "Invalid or expired session" });
  }

  // ── Tier gate: Pro (2) and above only ────────────────────────────────────────
  let userTier = 0;
  try {
    const profiles = $app.dao().findRecordsByFilter("profiles", "user = {:uid}", { uid: userId }, 1, 0);
    if (profiles && profiles.length) userTier = Number(profiles[0].get("tier")) || 0;
  } catch (e) { /* allow, will fail tier check below */ }

  if (userTier < 2) {
    return c.json(403, {
      error: "AI Coach is available on the Pro plan ($19/mo) and above. Please upgrade to access this feature."
    });
  }

  // ── Parse the stats payload from the frontend ─────────────────────────────
  let stats;
  try {
    stats = $apis.requestInfo(c).data;
    if (!stats || typeof stats !== "object") return c.json(400, { error: "Invalid stats payload" });
  } catch (e) {
    return c.json(400, { error: "Invalid request body" });
  }

  // ── Check ANTHROPIC_API_KEY is configured ────────────────────────────────────
  const anthropicKey = $os.getenv("ANTHROPIC_API_KEY");
  if (!anthropicKey || anthropicKey.length < 20) {
    return c.json(503, { error: "AI Coach is not yet configured. Set ANTHROPIC_API_KEY in Railway." });
  }

  // ── Build the analysis prompt ────────────────────────────────────────────────
  // We send aggregated statistics, never raw trade data, to keep the payload small
  // and protect user privacy. The prompt instructs Claude to act as a professional
  // trading performance coach specialising in ICT / Smart Money concepts.
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
  "headline": "One sentence overall verdict (e.g. 'Profitable but emotionally inconsistent execution')",
  "score": <integer 0-100, overall execution quality score>,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "sessionAnalysis": "2-3 sentences on session performance patterns",
  "setupAnalysis": "2-3 sentences on which setups are working and which aren't",
  "psychologyAnalysis": "2-3 sentences on emotional patterns and discipline",
  "riskAnalysis": "2-3 sentences on risk management and RR discipline",
  "recommendations": ["specific action 1", "specific action 2", "specific action 3", "specific action 4"],
  "focusForNextWeek": "One specific, actionable focus point for the coming week"
}`;

  // ── Call Anthropic API ────────────────────────────────────────────────────────
  // PocketBase hooks use Go's $http.send() for outbound HTTP requests
  let analysisText;
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
      timeout: 30, // seconds
    });

    if (resp.statusCode !== 200) {
      console.error("Anthropic API error:", resp.statusCode, resp.raw);
      return c.json(502, { error: "AI service temporarily unavailable. Please try again." });
    }

    const body = JSON.parse(resp.raw);
    analysisText = body?.content?.[0]?.text || "";
    if (!analysisText) return c.json(502, { error: "Empty response from AI service" });

  } catch (e) {
    console.error("AI coach fetch failed:", e);
    return c.json(502, { error: "Could not reach AI service. Please try again shortly." });
  }

  // ── Parse and validate the JSON response from Claude ─────────────────────────
  let analysis;
  try {
    // Strip any accidental markdown fences Claude might add
    const cleaned = analysisText.replace(/```json|```/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch (e) {
    // If JSON parse fails, return the raw text so the frontend can still display it
    return c.json(200, { raw: analysisText, parsed: false });
  }

  // ── Optional: store the analysis for history (if ai_analyses collection exists) ─
  try {
    const col = $app.dao().findCollectionByNameOrId("ai_analyses");
    if (col) {
      const rec = new Record(col);
      rec.set("user",       userId);
      rec.set("stats_snapshot", JSON.stringify(stats));
      rec.set("analysis",   JSON.stringify(analysis));
      rec.set("score",      Number(analysis.score) || 0);
      $app.dao().saveRecord(rec);
    }
  } catch (e) {
    // Non-fatal — collection may not exist yet, just log and continue
    console.warn("Could not save AI analysis to history:", e);
  }

  return c.json(200, { analysis, parsed: true });
});
