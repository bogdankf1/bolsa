# Bolsa

**A paper-trading terminal where you watch an AI agent trade in real time.**

Bolsa is a 1980s Bloomberg-style terminal UI built around Alpaca's paper account. It does three things:

1. **Manual trading** — keyboard-driven watchlist, positions, charts, order entry. No mouse required.
2. **AI agent spectating** — Claude Code (or any MCP client) connects via the embedded **Model Context Protocol (MCP)** server and trades. Every thought, tool call, and fill is streamed live into the UI through Supabase realtime so a human can watch the agent work without touching the keyboard.
3. **Strategy backtesting** — the same MCP tools have a backtest mode. A natural-language strategy compiles to a Claude `/loop` that simulates against historical bars, with results rendered alongside live performance in the analytics tab.

The differentiator: most trading UIs are dashboards humans drive. Bolsa is a dashboard that *follows* the agent — when the agent buys, the Positions tab auto-flashes; when it pulls a quote, the chart switches symbols; when it speaks a thought, the header strip shows it. The screen narrates what the agent is doing in real time.

> Paper trading only. Bolsa never touches real money — every order goes to Alpaca's paper endpoint.

---

## Three modes, one MCP surface

| Mode | Driver | Order routing | Audit |
| --- | --- | --- | --- |
| **Manual** | The human, via keyboard / UI | Direct → Alpaca paper | none |
| **Agent** | Claude (or any MCP client) | Direct → Alpaca paper | every tool call → `agent_events` (Supabase realtime) |
| **Backtest** | Claude inside a one-shot prompt | Simulated against historical bars (in-memory engine) | tool calls → `agent_events`; final metrics → `backtest_runs` |

The MCP tool surface (`place_order`, `get_positions`, `get_portfolio`, `recent_trades`, …) is **mode-agnostic**. The same strategy prompt that runs live can be reused unchanged for backtest — the execution-context layer (`src/core/execution-context.ts`) routes each call to live Alpaca or the simulated engine based on whether a backtest is active.

---

## Demo flow

```
1. Open localhost:3000 — terminal boots with watchlist, positions, agent feed, chart.

2. In a separate Claude Code session:
   /trader-agent jane             # registers a session named "jane"
   /strategy buy 1 QQQ when down 1 point, sell when up 1 point, 20 trades total

   → Claude generates a /loop prompt; you paste it.
   → /loop iterates every 30s, calling place_order against Alpaca paper.

3. Back in the browser — without touching the keyboard:
   - Header strip shows "› evaluating QQQ bar, anchor 712.55..."
   - Chart switches to QQQ
   - Positions tab flashes when each fill lands
   - Trade log streams every order
   - Analytics tab attributes the P&L to session "jane"

4. /strategy backtest TSLA 1D for April 2026, $100k, buy and hold
   → one-shot backtest prompt; Claude iterates bar-by-bar inside a single turn.
   → Result row appears in Analytics → BACKTESTS. Click to expand:
     equity curve, fills table, ▲ buy / ▼ sell markers on the chart.
```

---

## Architecture

```
        ┌────────────────────┐         ┌──────────────────────┐
Claude  │  Claude Code (CLI) │ ◀────── │   Bolsa MCP server   │ ◀──── Alpaca paper
Code    │  + strategy skill  │   MCP   │   /api/mcp           │       (orders + bars)
        └────────────────────┘  HTTP   │                      │
                                       │  • execution context │
                                       │  • backtest engine   │
                                       │  • audit log writer  │
                                       └──────────┬───────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │      Supabase        │
                                       │  agent_events,       │
                                       │  agent_state,        │
                                       │  backtest_runs,      │
                                       │  watchlists          │
                                       └──────────┬───────────┘
                                                  │ realtime
                                                  ▼
                                       ┌──────────────────────┐
                                       │   Next.js terminal   │
                                       │   (browser)          │
                                       └──────────────────────┘
```

**Stack** — Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Supabase (Postgres + realtime + RLS) · Alpaca paper-trading API · [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) · Zod for input validation · SWR for client cache.

**Key files** —
- `src/core/mcp/server.ts` — MCP tool surface (account, orders, portfolio, quotes, watchlist, backtest, session lifecycle).
- `src/core/execution-context.ts` — routes order/account/portfolio calls between live Alpaca and the simulated engine.
- `src/core/backtest-engine.ts` — in-memory simulation: bar cursor, cash/positions/fills, mark-to-market equity curve, FIFO realized P&L.
- `src/core/agent-events.ts` — append-only audit log; `withAudit()` wrapper records every MCP tool call + result.
- `src/core/pnl.ts` — FIFO realized P&L, win rate, profit factor, max drawdown, Sharpe (annualized from daily P&L).
- `src/core/sessions.ts` — attributes Alpaca fills to the agent session that was active when the fill happened.
- `src/lib/choreography.tsx` — screen-follow-agent state: tab auto-switching, active-symbol highlighting, latest-thought ticker.
- `src/components/terminal/Analytics.tsx` — performance dashboard: metrics, equity curve, per-symbol, per-session, backtest results.
- `supabase/migrations/` — schema (`watchlists`, `agent_events`, `agent_state`, `backtest_runs`).

---

## Non-obvious design decisions

A few choices that aren't visible from the code but shape how it behaves:

- **Manual UI never goes through the execution-context.** Only the MCP path is mode-aware. A human clicking BUY in the UI always hits live Alpaca, even mid-backtest — the simulated state belongs to the agent.
- **FIFO realized P&L is computed over the *full* order history, then sliced by time window.** Slicing first and computing FIFO would lose cost basis from BUYs that happened before the window — a BUY in March followed by a SELL in April would otherwise have no cost basis.
- **Abandoned agent sessions are healed by the next session's start time.** `register_session` overwrites `agent_state.active_session_id` without forcing the previous session to call `end_session`, leaving rows with `endedAt: null`. The `/api/agent/sessions` endpoint detects these (any non-active session lacking a recorded end) and caps them at the moment they were displaced — otherwise an abandoned session's window would extend to infinity and swallow every later trade.
- **The choreography hook reacts to `tool_result`, not `tool_call`.** Tab-switching waits for confirmation that the action succeeded; the chart-symbol indicator updates on `tool_call` for instant feedback. Manual W/P/A keypresses pause choreography for 30s so the operator can inspect without being yanked back.
- **Backtest engine state lives in memory.** Only the final result is persisted. A serverless cold start would lose an in-flight run; the list endpoint marks rows older than 10 min in `status='running'` as `aborted` on the way out so the table self-heals.
- **SSE quote ticks are RAF-batched.** A liquid ticker firing 50 trades/sec collapses into ~60 setState calls/sec. Without this, market-hours bursts caused render storms that froze the page.

---

## Running locally

```bash
git clone <your-fork>
cd bolsa
npm install
vercel env pull .env.local        # or copy env vars from .env.example
npm run dev                       # http://localhost:3000
```

Required environment:

| Var | Source |
| --- | --- |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | [alpaca.markets](https://alpaca.markets/) → paper account |
| `ALPACA_BASE_URL` | `https://paper-api.alpaca.markets/v2` |
| `ALPACA_DATA_URL` | `https://data.alpaca.markets/v2` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Your Supabase project |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same (exposed to the browser for realtime) |
| `BOLSA_MCP_TOKEN` | Any secret string — bearer auth for `/api/mcp` |

Apply Supabase migrations from `supabase/migrations/` (the project uses the Supabase MCP for development, but `psql -f` works too).

Connect Claude Code to the MCP server (in `~/.claude/mcp.json` or via the CLI):

```json
{
  "mcpServers": {
    "bolsa": {
      "transport": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer <BOLSA_MCP_TOKEN>" }
    }
  }
}
```

The `.claude/skills/strategy/` and `.claude/skills/trader-agent/` skills are checked in — restart Claude Code and they'll be discoverable.

---

## Keyboard reference

- `[W]` watchlist · `[P]` positions · `[A]` agent · `[N]` P&L (analytics)
- `j` / `k` · arrows — navigate inside the active tab
- `/` — focus the watchlist add-symbol input
- `b` / `s` / `x` — buy / sell / close from the order entry panel
- `f` — flatten the highlighted position (with `y`/`n` confirm)
- `c` — cancel highlighted order in the trade log
- `S` — stop the running agent (sets the kill switch)
- `:` — command palette (`:reset`, `:normal`/`:crt`, `:mute`/`:unmute`, `:focus`/`:unfocus`, `:analytics`)
