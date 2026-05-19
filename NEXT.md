# Bolsa — Next Steps

Snapshot taken 2026-05-19 mid-session, before laptop reboot.
For the full V1 spec, see `bolsa.md`. For the build decisions log, see `~/.claude/projects/-Users-bohdanburukhin-Projects-bolsa/memory/project_bolsa_v1.md`.

---

## Where we are

Branch: **`feat/v1-scaffold`** (pushed to `origin`, not yet merged to `main`).

V1 is essentially feature-complete:

- Next.js 16 + React 19 + Tailwind v4, App Router, Turbopack
- Full CRT visual shell (phosphor green, scanlines, vignette, boot flicker, blink cursor, glow, tick flash)
- Vim-style keyboard nav: `j/k` watchlist, `d` delete, `b/s` buy/sell, `Enter/Esc` confirm
- API-first core in `src/core/` — pure TS, no Next.js deps; ready to be extracted for the MCP server (V2) and 3D game (V5)
- REST API routes wrap the core (`/api/account`, `/portfolio`, `/orders`, `/trades`, `/quotes`, `/snapshots`, `/bars`, `/watchlist`)
- SSE streaming at `/api/stream/quotes` backed by a singleton `AlpacaStream` (multiplexes Alpaca's 1-WS-per-account limit across multiple SSE consumers)
- All UI components read live Alpaca data via SWR hooks (`src/lib/hooks.ts`)
- Deployed to Vercel: `https://bolsa-85edibgrj-bohdan-burukhins-projects.vercel.app` (login-protected)

Live keys are in `.env.local` (gitignored). Mirrored on Vercel across Production / Preview / Development.

---

## What to do next — pick one

### 1. Merge V1 to `main` (recommended — clears the runway)

```bash
git checkout main
git merge --no-ff feat/v1-scaffold
git push origin main
```

Or open a PR at `https://github.com/bogdankf1/bolsa/pull/new/feat/v1-scaffold`.

This gets the production deploy onto a stable URL and frees future work to branch off `main`.

### 2. Move watchlist to Supabase

Currently in-memory (`src/core/watchlist.ts`) — symbols reset when the Vercel Function instance recycles. To persist:

- Provision Supabase via Vercel Marketplace (per scoping: `vercel:marketplace` skill)
- Add a `watchlists` table (single-user V1: `symbol text primary key`)
- Replace the in-memory store in `src/core/watchlist.ts` with a Supabase client
- The API route at `src/app/api/watchlist/route.ts` doesn't change — only the core impl

### 3. Symbol search typeahead

Alpaca exposes `GET /v2/assets?status=active&exchange=NASDAQ` (and NYSE). Wire it as:

- New core fn: `searchAssets(query)` in `src/core/quotes.ts` (or new `assets.ts`)
- New route: `/api/assets?q=apple`
- Watchlist's "ADD SYMBOL" input becomes a typeahead

### 4. Polish pass (per V1 spec)

- `/` to focus the symbol search
- `:` for a command palette (think vim `:command`)
- Audio: subtle keystroke clicks, price-tick beep, fill chime (muted default; toggle in settings)
- "NORMAL MODE" toggle to dial down CRT effects
- Reset-paper-account button (Alpaca has an endpoint)

Spec is in `bolsa.md`. Skip anything we already cut.

---

## How to resume locally after reboot

```bash
cd ~/Projects/bolsa
npm run dev
# → http://localhost:3000
```

Env vars come from `.env.local` (already on disk, gitignored).

If the port is taken, kill the leftover process (the Next.js error message includes the PID).

### Quick API smoke test (no UI needed)

```bash
# Account: should return $100K cash, ACTIVE
curl -s http://localhost:3000/api/account | python3 -m json.tool

# Watchlist + live snapshots
curl -s http://localhost:3000/api/snapshots?symbols=AAPL,VOO,QQQ | python3 -m json.tool

# Live tick stream (no output until market opens, but shows connection)
curl -s -N --max-time 5 "http://localhost:3000/api/stream/quotes?symbols=AAPL"
```

### Live ticks

US market hours are 09:30–16:00 ET. Outside those hours the SSE endpoint connects fine (you'll see `ready` + `status` events) but no trade/quote ticks will arrive — that's normal, not a bug.

---

## Architecture cheat sheet

```
src/
  core/                     ← reusable engine, no Next.js
    types.ts                domain shapes
    alpaca/
      client.ts             REST wrapper (trading + data APIs)
      stream.ts             WS multiplexer (singleton-safe)
      errors.ts
    account.ts portfolio.ts orders.ts trades.ts quotes.ts watchlist.ts

  app/api/                  ← thin HTTP wrappers, all { ok, data }
    account/ portfolio/ orders/ orders/[id]/ trades/
    quotes/ quotes/[symbol]/ snapshots/ bars/[symbol]/
    watchlist/ stream/quotes/

  lib/
    server.ts               server-only singletons (Alpaca client + stream)
    api.ts                  withErrors() + ok() + err() helpers
    fetcher.ts              client-side fetch with typed envelope unwrap
    hooks.ts                SWR hooks + mutations + useQuoteStream (SSE)
    format.ts               fmtUsd / fmtPct / fmtPrice / fmtVolume

  components/terminal/      ← Header, Watchlist, ChartPanel, OrderEntry,
                              StatusBar, TradeLog, Panel
```

**Key principle:** business logic lives in `src/core/`. API routes are ~10-line wrappers. UI components are SWR-only — never call Alpaca directly. When V2 brings MCP, the MCP server imports from `src/core/` and re-exposes the same operations as tools.

---

## Known gotchas

- **Watchlist resets** when the dev server restarts (in-memory). Step 2 above fixes this.
- **Wide bid/ask spreads after-hours** are normal for IEX feed. SIP (paid) gives full market depth.
- **SSE on Vercel** uses Fluid Compute. The `maxDuration = 300` in the route file caps each SSE connection at 5 min — EventSource auto-reconnects, so this is fine.
- **One Alpaca WS slot** is shared via `globalThis.__bolsaAlpacaStream`. Don't construct a second `AlpacaStream` anywhere else.
- **`next-env.d.ts` is gitignored** by Next 16's default — that's intentional, regenerated on every build.

---

## Decision point when you come back

> "Should I just merge `feat/v1-scaffold` to main, or keep stacking on the branch?"

Recommendation: **merge it**. The branch represents V1 — clean cut. New work goes on fresh branches off `main`. Step 1 above does this in two commands.
