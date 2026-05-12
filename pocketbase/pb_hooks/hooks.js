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

// ── Stripe webhook ────────────────────────────────────────────────────────────
routerAdd("POST", "/api/stripe/webhook", (c) => {
  if (rateLimit("stripe", 100, 60000)) return c.json(429, { error: "Rate limited" });

  let body;
  try {
    body = $apis.requestInfo(c).data;
    if (!body) return c.json(400, { error: "Empty payload" });
  } catch(e) {
    return c.json(400, { error: "Invalid payload" });
  }

  const TIER_MAP = {
    "price_tier1":1, "price_tier2":2, "price_tier3":3, "price_tier4":4, "price_tier5":5,
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

  const LIMITS = {
    0:{ trades:3,   lots:0.5  },
    1:{ trades:5,   lots:1    },
    2:{ trades:10,  lots:5    },
    3:{ trades:15,  lots:10   },
    4:{ trades:20,  lots:20   },
    5:{ trades:9999,lots:9999 },
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
