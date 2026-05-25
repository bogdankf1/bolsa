# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Next.js dev server on http://localhost:3000 (Turbopack)
npm run build    # Production build
npm run start    # Serve the production build
```

No lint or test scripts are wired up. Type-checking happens through `next build` (or via the editor against `tsconfig.json`).

Env vars live in `.env.local` (gitignored). See `.env.example` for the full list. Required to run anything: `ALPACA_API_KEY`/`SECRET`, `ALPACA_BASE_URL`/`DATA_URL`/`STREAM_URL`, `SUPABASE_URL`/`ANON_KEY` (and the `NEXT_PUBLIC_` mirror, needed for browser realtime), `BOLSA_MCP_TOKEN`.

Supabase migrations live in `supabase/migrations/`. Apply via the Supabase MCP (configured in `.mcp.json`) or `psql -f`.

## Architecture

This is **not** a typical Next.js app — Next is just the HTTP shell. The real product is the `src/core/` engine plus the MCP server it exposes.

```
src/
  core/                      ← pure-TS engine (no Next imports). Three concerns mixed here:
    alpaca/                  ← REST client + WS multiplexer (singleton, one Alpaca slot per process)
    mcp/server.ts            ← MCP tool surface (place_order, get_*, log_thought, register_session, …)
    execution-context.ts     ← routes order/account/portfolio calls between live Alpaca and the in-memory backtest engine
    backtest-engine.ts       ← in-memory sim: bar cursor, cash/positions/fills, equity curve, FIFO P&L
    agent-events.ts          ← append-only Supabase audit log; withAudit() wraps every MCP tool call
    sessions.ts              ← attributes Alpaca fills to whichever agent session was active at fill time
    pnl.ts                   ← FIFO realized P&L, win rate, profit factor, max DD, Sharpe
    account.ts portfolio.ts orders.ts trades.ts quotes.ts watchlist.ts assets.ts clock.ts reset.ts

  app/api/                   ← thin HTTP wrappers (~10-line routes) returning { ok, data }
    mcp/                     ← /api/mcp — the MCP HTTP transport, bearer-auth'd with BOLSA_MCP_TOKEN
    stream/quotes/           ← SSE endpoint, multiplexed onto the single Alpaca WS

  lib/
    server.ts                ← server-only Alpaca client + stream singletons
    hooks.ts                 ← SWR hooks + useQuoteStream (SSE consumer)
    choreography.tsx         ← "screen follows the agent": auto-tab-switch, active-symbol highlight, thought ticker

  components/terminal/       ← CRT-styled UI (Watchlist, ChartPanel, OrderEntry, TradeLog, Analytics, …)
```

### Three modes, one MCP surface

| Mode | Driver | Order routing | Audit |
| --- | --- | --- | --- |
| **Manual** | Human via UI | Direct → Alpaca paper | none |
| **Agent** | Claude via MCP | Direct → Alpaca paper | every tool call → `agent_events` |
| **Backtest** | Claude in a one-shot prompt | Simulated against historical bars | tool calls → `agent_events`; final metrics → `backtest_runs` |

The same MCP tools work in all three modes. `execution-context.ts` dispatches each call to live Alpaca or the simulated engine depending on whether a backtest is active. The Supabase tables `agent_events`, `agent_state`, `backtest_runs`, `watchlists` are streamed into the browser via Supabase realtime so the UI follows the agent live.

### Non-obvious design decisions

These shape behavior in ways the code alone won't tell you:

- **The manual UI bypasses `execution-context`.** Only the MCP path is mode-aware. A human clicking BUY mid-backtest still hits live Alpaca — simulated state belongs to the agent.
- **FIFO realized P&L is computed over the *full* order history, then sliced by time window.** Slicing first would lose cost basis for SELLs whose matching BUY happened earlier.
- **Abandoned agent sessions self-heal.** `register_session` overwrites `agent_state.active_session_id` without forcing the previous session to call `end_session`. `/api/agent/sessions` detects non-active sessions lacking an `endedAt` and caps them at the moment they were displaced — otherwise the window would extend forever and swallow later trades.
- **Choreography reacts to `tool_result`, not `tool_call`** for tab-switching (waits for success), but to `tool_call` for the chart-symbol indicator (instant feedback). Manual W/P/A keypresses pause choreography for 30s.
- **Backtest engine state lives in memory.** Only the final result is persisted. The list endpoint marks `status='running'` rows older than 10min as `aborted` on read so the table self-heals after cold starts.
- **SSE quote ticks are RAF-batched.** Without this, market-hours bursts on liquid tickers caused render storms.
- **One Alpaca WS slot per process,** shared via `globalThis.__bolsaAlpacaStream`. Never construct a second `AlpacaStream`.
- **Business logic stays in `src/core/`** — API routes are ~10-line wrappers; UI components are SWR-only and never call Alpaca directly. This is what makes the same code reusable from MCP, REST, and (future) other consumers.

### MCP integration

`.mcp.json` registers the Supabase MCP for schema/migrations work. The Bolsa MCP server is the app's own `/api/mcp` route — Claude Code connects to it as a client (see README for the `~/.claude/mcp.json` snippet). Two project skills under `.claude/skills/` (`trader-agent`, `strategy`) are checked in and discoverable when Claude Code starts in this repo.

The MCP protocol the agent follows when trading is defined in the server's `instructions` field (see `src/core/mcp/server.ts`): `register_session` → `log_thought` before any state-changing action → `check_should_stop` in loops → `end_session` at the end. Read/lookup tools don't require a preceding thought. Never call reset/flatten operations from the agent path — those are UI-only.

## Skills

Always use the superpowers skills when applicable. Match the task to the appropriate skill and invoke it rather than reimplementing its behavior ad-hoc.
