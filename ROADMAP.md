# Bolsa Roadmap — Three-Phase Plan to Demo-Ready

This roadmap closes the gaps between today's Bolsa and a version that demos well to future employers as evidence of both trading-domain understanding and engineering craft. The differentiated story is **a human spectating a Claude agent trade live**, with reasoning, tool calls, and fills streaming through a CRT-styled terminal UI. To make that story land, three gaps need to close:

1. **Agent visibility is too passive.** Today the agent's actions stream into one sidebar tab. A spectator has to choose to look at it. The demo should *drive the screen* — when the agent buys, Positions lights up; when it pulls a quote, the chart switches symbols.
2. **There are no real performance metrics.** Realized P&L is computed only for CSV export. There's no Sharpe, win rate, drawdown, or per-session attribution. An interviewer's first question — "how did your agent do?" — has no good answer yet.
3. **There's no way to validate a strategy before running it live.** Strategies compile straight to a `/loop` prompt that hits Alpaca paper. A backtest mode lets you say "I ran this against 30 days of historical bars and it returned X with drawdown Y" — the signal that separates a trading UI from trading engineering.

**Order is fixed: Visibility → Analytics → Backtest.** Visibility is the lowest-effort highest-impact win and produces the per-session attribution data analytics needs. Analytics reuses `computeRealizedPnl` and defines the metrics view backtest results render into. Backtest is the heaviest lift and benefits from both prior phases.

Each phase is implemented under its own implementation plan. No phase begins until the previous one is merged.

---

## Current-State Map

Critical facts the roadmap is built on (from codebase exploration):

- **App shell** — single Next.js page at `src/app/page.tsx`. Tab state is a plain React `useState` (`"watchlist" | "positions" | "agent"`). Hotkeys live in `src/lib/hotkeys.ts` (priority-based global registry).
- **Agent visibility pipeline** — `agent_events` table (Supabase) has `kind` ∈ {`thought`, `tool_call`, `tool_result`, `error`, `session_start`, `session_end`}. Realtime enabled. `useAgentEvents` in `src/lib/hooks.ts` already subscribes and dispatches `invalidateForTool` to refresh positions/orders SWR cache on every `tool_result`.
- **MCP server** — `src/core/mcp/server.ts`, every tool wrapped in `withAudit` (`src/core/agent-events.ts`). Call + result are already recorded; no instrumentation work needed for visibility.
- **P&L** — `src/core/pnl.ts` has `computeRealizedPnl(orders)` doing FIFO matching, currently only consumed by CSV export. Day-P&L from Alpaca's account endpoint. No Sharpe, drawdown, win rate, or per-session attribution yet.
- **Charts** — `src/components/terminal/ChartPanel.tsx`, custom SVG. Already overlays previous-close line and open-order levels via `xFor`/`yFor` helpers. Adding trade-fill markers is small.
- **Bars** — `getBars()` in `src/core/quotes.ts` calls Alpaca live, 1Min through 1Y, up to 10,000 bars per call, no cache. Sufficient for backtest without a new cache layer.
- **Strategy/trader-agent skills** — `.claude/skills/strategy/SKILL.md` compiles to `/loop` prompts. The prompt is execution-target-agnostic; live vs simulated is a routing concern, not a prompt rewrite.
- **No existing backtest/replay code.** Greenfield.
- **Styling** — Tailwind v4, phosphor-green CRT theme, design tokens in `src/app/globals.css`. New views match (no rounded corners, monospace, glow utilities).

---

## Phase 1 — Agent Visibility & Screen Choreography

**Goal:** The screen reacts to the agent in real time. A spectator can leave the room, come back, and instantly see what the agent just did at a glance.

### Scope

1. **Auto-tab-switching on tool events.** Consume `useAgentEvents` and map `tool_result.tool` → tab:
   - `place_order` / `cancel_order` / `list_orders` / `get_positions` / `get_portfolio` → **Positions**.
   - `add_to_watchlist` / `remove_from_watchlist` / `list_watchlist` → **Watchlist**.
   - `get_quote` / `get_snapshot` / `get_bars` → keep current tab, switch the **chart symbol** to the one queried.
   - Sustained `log_thought` activity → **Agent**.
   - Debounce: don't thrash if the agent fires several calls in quick succession.
2. **Active-symbol indicator** — when the agent's last tool call referenced a symbol, highlight that symbol everywhere it appears (watchlist row, positions row, chart header) with the amber accent.
3. **"Current action" status line** — single line in the Header showing the agent's most recent thought, truncated. Persists ~5s after the latest event, then fades to the session name.
4. **Manual override** — pressing any tab hotkey (W/P/A) suspends choreography for 30s so the operator can investigate without being yanked back.
5. **Choreography mute** — `:focus` command-palette command (and matching settings toggle) disables auto-switching for users who want a static layout. Default ON.

### Files

- `src/app/page.tsx` — thread choreography hook.
- `src/lib/hooks.ts` — new `useAgentChoreography()` consuming `useAgentEvents`, emitting `setTab` / `setActiveSymbol`.
- `src/components/terminal/Header.tsx` — current-action line.
- `src/components/terminal/Watchlist.tsx`, `Positions.tsx`, `ChartPanel.tsx` — accept `activeAgentSymbol` prop, apply highlight class.
- `src/components/terminal/CommandPalette.tsx` — register `focus` command.
- `src/lib/hotkeys.ts` — capture manual tab switches to suspend choreography.

### Acceptance

- Agent buys TSLA, queries QQQ, adds AAPL to watchlist in sequence. Without keyboard input: Positions flashes on fill, chart switches to QQQ, Watchlist flashes when AAPL is added.
- Press `W` mid-sequence; choreography pauses 30s; manual tab stays put.
- Toggle `:focus` off; subsequent agent actions don't move the screen.

### Out of scope this phase

Multi-agent split-pane view, replay timeline scrubber, audio cues per event kind.

---

## Phase 2 — P&L Analytics Dashboard

**Goal:** Answer "how did the agent do?" with real metrics, broken down per session and per symbol.

### Scope

1. **New top-level tab: `Analytics`** (hotkey TBD during impl — `n` for numbers or `l` for ledger).
2. **Metric cards** at the top:
   - Realized P&L (today / 7d / 30d / all-time).
   - Win rate (% of closed positions profitable).
   - Average win, average loss, profit factor.
   - Max drawdown (peak-to-trough on equity curve).
   - Sharpe ratio (annualized, from daily realized returns; assumption noted in a tooltip).
   - Trade count.
3. **Equity curve** — SVG sparkline using existing chart primitives, cumulative realized P&L over time.
4. **Per-symbol table** — ranked by absolute P&L: symbol, trades, win rate, realized P&L. Sortable via `j`/`k` like existing tables.
5. **Per-session attribution** — the killer feature for the demo. Join `agent_events` (session_id, session_start, session_end) with Alpaca orders (by `created_at` window) to attribute each fill to a session. Display: session name, duration, trades, realized P&L, win rate. Manually-placed orders land in a synthetic "manual" bucket.
6. **CSV export** — extend the existing trade export to include the analytics breakdown.

### Files

- `src/components/terminal/Analytics.tsx` (new).
- `src/app/page.tsx` — extend tab union to `"analytics"`, conditional render, hotkey.
- `src/core/pnl.ts` — extend with `computeWinRate`, `computeMaxDrawdown`, `computeSharpe`, `computeEquityCurve` (pure, testable).
- `src/core/sessions.ts` (new) — `attributeTradesToSessions(orders, agentEvents)` → `Map<sessionId, SessionPerformance>`.
- `src/lib/hooks.ts` — `useAnalytics()` composing the above on existing orders/events SWR + realtime.
- `src/components/terminal/CommandPalette.tsx` — register `:analytics` shortcut.

### Acceptance

- Run two agent sessions back-to-back trading different symbols; the session table shows two distinct rows with correct P&L split.
- Manually-placed orders appear under the "manual" bucket.
- Numbers reconcile with Alpaca's account endpoint daily P&L within rounding.
- Equity curve renders without flicker on realtime updates (RAF-batched like existing quote stream).

### Out of scope this phase

Tax-lot reporting, unrealized P&L curve, benchmark comparison vs SPY.

---

## Phase 3 — Backtest Mode

**Goal:** Run an existing strategy against historical bars without touching Alpaca, see simulated P&L on the same analytics dashboard, and overlay simulated fills on the chart.

### Scope

1. **Execution-context layer** — `src/core/execution-context.ts` exposing `currentMode(): "live" | "backtest"` and a `placeOrder` that dispatches to real Alpaca or the simulated engine. All MCP order tools route through this.
2. **Backtest engine** — `src/core/backtest-engine.ts`:
   - Loads bars via existing `getBars()`.
   - In-memory state: cash, positions, fills, equity curve, current bar pointer.
   - Fills at next bar's open (or current close, configurable) — documented slippage assumption.
   - Emits the same `agent_events` shape so the Agent feed and Analytics work unchanged.
3. **Backtest MCP tools** (only callable in backtest mode):
   - `start_backtest(symbol, timeframe, start, end, initialCash)` — initialize engine, set mode.
   - `advance_bar()` — move the pointer forward one bar. The `/loop` prompt calls this each iteration instead of `sleep`.
   - `get_backtest_context()` — current bar OHLCV, simulated portfolio, fills so far. Replaces `get_snapshot` / `recent_trades` in backtest mode.
   - `end_backtest()` — flush results to Supabase, return final metrics, restore live mode.
4. **Schema** — `supabase/migrations/0003_backtest.sql`:
   - `backtest_runs`: id, session_id, symbol, timeframe, start/end, initial_cash, final_equity, sharpe, max_drawdown, win_rate, trade_count, created_at.
   - `backtest_fills`: run_id, ts, symbol, side, qty, price, simulated_pnl.
   - Add `backtest_run_id` column to `agent_events`.
5. **UI — Backtest tab** (or pane within Analytics — decide during impl):
   - Form: symbol, timeframe, date range, initial cash, strategy selector (lists prompt templates from the strategy skill).
   - Run button → triggers a `/loop`-style invocation against backtest tools.
   - Results: same metric cards as Phase 2 plus per-bar equity curve.
   - Chart overlay: render fill markers (▲ buy / ▼ sell with price label) at fill timestamps on the historical chart.
6. **Strategy-skill update** — `.claude/skills/strategy/SKILL.md` gains a "backtest harness" template variant using the backtest tools instead of live ones.

### Files

- `src/core/execution-context.ts` (new).
- `src/core/backtest-engine.ts` (new).
- `src/core/mcp/server.ts` — register the four new backtest tools.
- `src/core/orders.ts` — wrap `placeOrder` in execution context.
- `supabase/migrations/0003_backtest.sql` (new).
- `src/components/terminal/Backtest.tsx` (new).
- `src/components/terminal/ChartPanel.tsx` — add fill-marker overlay (gated on `markers?: TradeMarker[]`).
- `src/lib/hooks.ts` — `useBacktestRun(runId)`.
- `.claude/skills/strategy/SKILL.md` — add backtest template.

### Acceptance

- Run a published strategy ("buy on 2% dip, sell on 2% rise, max 20 trades") against 30 days of TSLA 5-minute bars from the Backtest tab.
- Backtest completes in under 30 seconds.
- Result page shows final P&L, Sharpe, drawdown, trade count, equity curve.
- Chart for the same symbol+range shows entry/exit markers at the correct bars.
- Analytics includes the backtest run under a "backtests" section, segregated from live trades.
- During backtest, Alpaca is never called (verifiable via network log).

### Out of scope this phase

Multi-symbol backtests, walk-forward optimization, parameter sweeps, transaction-cost modeling beyond a single configurable slippage parameter.

---

## Non-goals across all phases

Explicitly NOT in this roadmap:

- Bracket / OCO / trailing-stop orders.
- Trade journal with annotations.
- Options / Greeks.
- Sector heatmap / market breadth / earnings calendar.
- Multi-user auth.

If any of these come up later, they'll be a separate roadmap entry.
