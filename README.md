# EDGE Journal v2 — Full Production PWA
## ICT Smart Money Concepts Trading Journal

Cloud-synced · MT5 auto-import · Multi-device · Investor links · 5 subscription tiers · Google Ads

---

## What's Built

| Component | Status | Notes |
|-----------|--------|-------|
| Cloud auth (email + password) | ✅ Complete | JWT, auto-refresh, password reset |
| Cross-device real-time sync | ✅ Complete | PocketBase SSE realtime |
| Dark / Light / System theme | ✅ Complete | Persists to profile |
| Collapsible sidebar | ✅ Complete | Auto-collapses on mobile |
| Full trade logging (ICT fields) | ✅ Complete | OTE, OB, FVG, SMT, Breaker etc |
| Chart image upload (before/after) | ✅ Complete | 2 images per trade, 5MB each |
| Dashboard with equity curve | ✅ Complete | Recharts, real-time |
| Analytics (monthly, pairs, grades) | ✅ Complete | |
| ICT Playbook | ✅ Complete | OTE, OB, FVG, SMT, Breaker |
| Daily journal notes | ✅ Complete | Market bias, mood tracking |
| MT5 EA auto-sync | ✅ Complete | MQL5 file included |
| Investor view links | ✅ Complete | Public read-only page |
| 5-tier subscription enforcement | ✅ Complete | Server + client side |
| Stripe payments scaffold | ✅ Ready | Add your Stripe keys to activate |
| Google Ad Manager slots | ✅ Ready | Add your network code to activate |
| Toast notifications | ✅ Complete | All CRUD actions |
| Error boundary | ✅ Complete | Crash recovery |
| Offline PWA | ✅ Complete | Service worker + Workbox |
| Security hardening | ✅ Complete | CSP, rate limiting, sanitisation |
| Password reset flow | ✅ Complete | PocketBase email |
| PocketBase backend | ✅ Complete | Schema + hooks + EA endpoint |
| Railway / Render deploy | ✅ Ready | One command |

---

## STEP-BY-STEP SETUP GUIDE

### Step 1 — Deploy your PocketBase backend (10 minutes)

**Option A — Railway (recommended, free to start)**

1. Create a free account at railway.app
2. Install Railway CLI:
   ```
   npm install -g @railway/cli
   ```
3. In a terminal inside the project folder:
   ```
   railway login
   railway init
   railway up
   ```
4. Railway will give you a URL like `https://edge-journal-abc123.railway.app`
5. Visit `https://your-url.railway.app/_/` to access the PocketBase admin panel
6. Create your admin account when prompted

**Option B — Render (free tier with sleep)**

1. Push this project to a GitHub repo
2. Go to render.com → New → Blueprint
3. Connect your repo — Render reads `render.yaml` automatically
4. Set environment variables in Render dashboard (see Step 2)

**Option C — Local development only**

```bash
# Download PocketBase binary from https://pocketbase.io/docs/
chmod +x pocketbase
./pocketbase serve --dir=./pocketbase/pb_data
# Admin UI: http://127.0.0.1:8090/_/
```

---

### Step 2 — Set environment variables

Create a `.env` file in the project root:

```
VITE_PB_URL=https://your-url.railway.app
```

For Railway/Render, add these in the dashboard (not in code):
```
STRIPE_SECRET_KEY=sk_live_...          (when ready)
STRIPE_WEBHOOK_SECRET=whsec_...        (when ready)
```

---

### Step 3 — Build and deploy the frontend

```bash
npm install
npm run build
```

**Deploy `dist/` folder to Netlify (30 seconds):**
1. Go to app.netlify.com/drop
2. Drag your `dist/` folder onto the page
3. Done — you get a live HTTPS URL instantly

**Or any static host** — Vercel, Cloudflare Pages, GitHub Pages.

For Netlify, add a `_redirects` file in `dist/`:
```
/investor/*  /index.html  200
/*           /index.html  200
```

---

### Step 4 — Install as app on your devices

**Windows (Chrome or Edge):**
1. Open your app URL in Chrome or Edge
2. Click the ⊕ icon in the address bar
3. Click "Install EDGE Journal"
4. App appears in Start Menu and Desktop — works offline

**Android (Chrome):**
1. Open your app URL in Chrome
2. Tap the menu (⋮) → "Add to Home Screen" → Install
3. App icon appears on your home screen — opens full screen

---

### Step 5 — Connect your MT5 terminal

1. In the EDGE app, go to **Settings → MT5 Sync**
2. Click **Generate API Key** — fill in your MT5 account details
3. **Save the API key displayed** — it's shown only once
4. Download `EDGE_Journal_EA.mq5` from the app or from `dist/`
5. Copy the EA file to: `MT5 Data Folder → MQL5 → Experts`
6. In MetaEditor: press F7 to compile
7. In MT5: **Tools → Options → Expert Advisors** → tick "Allow WebRequest" → add your server URL
8. Attach the EA to any chart (e.g. EURUSD H1)
9. In EA settings: paste your Server URL and API Key
10. Enable "Allow Algo Trading" in the MT5 toolbar
11. On first attach, click YES to import historical trades

---

### Step 6 — Activate Stripe payments (when ready)

1. Create a Stripe account at stripe.com
2. Create 5 subscription products with monthly prices:
   - Tier 1: $50/mo
   - Tier 2: $100/mo
   - Tier 3: $200/mo
   - Tier 4: $300/mo
   - Tier 5: $500/mo
3. Copy each price ID (starts with `price_`)
4. In `pocketbase/pb_hooks/hooks.js`, update the `TIER_MAP`:
   ```js
   const TIER_MAP = {
     "price_YOURID1": 1,
     "price_YOURID2": 2,
     ...
   };
   ```
5. Add env vars to Railway: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
6. Set your Stripe webhook URL to: `https://your-url.railway.app/api/stripe/webhook`
7. In the billing UI, link the Stripe checkout to your price IDs

---

### Step 7 — Activate Google Ad Manager

1. Create a Google Ad Manager account at admanager.google.com
2. Create 4 ad units:
   - `edge_journal_leaderboard` (728x90 / 320x50)
   - `edge_journal_sidebar_top` (300x250)
   - `edge_journal_sidebar_bottom` (300x250)
   - `edge_journal_interstitial` (320x480)
3. Note your Network Code (in the GAM URL)
4. Open `src/components/shared/AdSlot.jsx`
5. Replace `YOUR_NETWORK_CODE` with your actual code
6. Update the ad unit paths to match exactly what you created in GAM
7. Rebuild: `npm run build`

---

## Subscription Tiers

| Tier | Price | Trades/Day | Lots/Day |
|------|-------|------------|----------|
| Free Trial (14 days) | Free | 3 | 0.5 |
| Tier 1 | $50/mo | 5 | 1 |
| Tier 2 | $100/mo | 10 | 5 |
| Tier 3 | $200/mo | 15 | 10 |
| Tier 4 | $300/mo | 20 | 20 |
| Tier 5 | $500/mo | Unlimited | Unlimited |

---

## Security Features

- JWT authentication with 25-minute auto-refresh
- bcrypt password hashing (PocketBase built-in)
- Row-level security — users can only see their own data
- Server-side input sanitisation on all endpoints
- Client-side input sanitisation before every API call
- Rate limiting: auth (10/min), MT5 EA (120/min), investor (30/min)
- CSP headers blocking XSS and frame embedding
- X-Frame-Options: DENY
- HTTPS enforced by Railway/Render
- No passwords or secrets stored in frontend code
- API keys hashed with SHA-256 before storage
- Investor links are read-only, token-based, with expiry support
- Tier limits enforced both client-side AND server-side in PocketBase hooks

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| PWA | vite-plugin-pwa + Workbox |
| State | React Context + hooks |
| Charts | Recharts |
| Backend | PocketBase 0.22 |
| Database | SQLite (embedded in PocketBase) |
| Auth | PocketBase built-in JWT |
| File storage | PocketBase built-in |
| Realtime | PocketBase SSE |
| MT5 | Custom MQL5 Expert Advisor |
| Payments | Stripe (scaffolded) |
| Ads | Google Ad Manager |
| Deploy | Railway / Render / Netlify |

---

## Next Phase — Flutter Native App

The Flutter app (Windows .exe + Android .apk) will use this same PocketBase backend.
Same auth, same data, same API — native shell, SQLite local cache, offline-first.
In two weeks.
