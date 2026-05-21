---
name: strategy
description: Compile a one-line trading-strategy description into a robust Claude Code /loop prompt for the Bolsa MCP server. Use whenever the user asks to set up, create, or run an automated paper-trading strategy/agent, or describes any buy/sell rule with conditions, quantities, intervals, or trade-count goals. Triggers — "create a strategy", "set up an agent that…", "buy X when Y", "scalp …", "ladder into …", "DCA …", "rebalance at …", "trade until 20 fills".
---

# Bolsa strategy compiler

You convert a natural-language paper-trading strategy into a Claude Code `/loop` command the user can paste to run reliably against the **bolsa** MCP server.

## Why this skill exists

Naive prompts ("buy QQQ at −1, sell at +1, 20 trades") fail because Claude tries to maintain state across many tool calls inside a single turn, hallucinates trade counts, or burns its context window polling. The pattern that works:

- **One action per loop iteration** — no chaining.
- **State derived from order history** — never from in-context memory.
- **Cheap polling** — most iterations just confirm "order still pending? then exit."
- **Hard exit condition** — count fills strictly after a fixed `STRATEGY_START_TS`, halt the loop when the target is hit.

Your job: take the user's idea and emit a prompt that follows this pattern.

## Prerequisite — an active agent must exist

A strategy always runs **under a named agent session**. Before generating the loop prompt, this skill MUST ensure one is active:

1. Call the bolsa MCP tool `get_session_state`. It returns `{ activeSessionId, shouldStop }`.
2. If `activeSessionId` is **set** to some name: good. The strategy will run under that agent. Note the name in your summary (e.g. *"Running under agent `jane`."*).
3. If `activeSessionId` is **null**: no agent is active yet. Pick a sensible default name derived from the strategy (e.g. `qqq-scalper`, `dca-bot`, `nvda-momentum`) and confirm with the user in one sentence:
   > "No agent is active yet — I'll set one up called `<default>` to run this strategy under. OK, or pick another name?"
   On approval, invoke the `trader-agent` skill with that name (or call `register_session` + a brief `log_thought` directly via the bolsa MCP). Once the session is active, proceed.

**The generated `/loop` prompt does NOT register a session itself** — the agent is already running before the loop starts. This is a change from the older skeleton; see the Output section below.

## Required input

You need enough information to fill in every variable in the template below. If anything material is missing, ask ONE concise clarifying question — never invent values for the four trading-outcome fields (symbol, quantity, triggers, exit). You **may** default the loop interval to `30s` if unspecified.

| Field | What it controls | Example |
|---|---|---|
| `<INTERVAL>` | How often the loop wakes | `30s` (default), `60s` for slower markets, `10s` for fast scalps |
| `<SYMBOL-LIST>` | Tickers the strategy trades | `QQQ`, or `AAPL, MSFT, NVDA` |
| `<STRATEGY-NAME>` | Short human label for the session | `qqq-scalp`, `nvda-momentum` |
| `<QTY>` | Shares per order | `1`, `5` — warn the user if they request `> 10` |
| `<EXIT-CONDITION>` | Plain-English stop criterion | `20 total fills`, `until P&L ≥ $50`, `until 16:00 ET` |
| `<EXIT-CHECK>` | How step 4 decides "done" | `count >= 20`, `unrealized_pl >= 50`, `clock.timestamp >= 16:00 ET` |
| `<DECISION-TREE>` | Step 5 logic — strategy-specific (see templates below) |

## Output skeleton

Render this verbatim, with the placeholders filled in. Wrap it in a fenced code block so the user can copy it cleanly.

```
/loop <INTERVAL> Continue the <STRATEGY-NAME> strategy via bolsa. Goal: <EXIT-CONDITION>. STRATEGY_START_TS=<ISO-TIMESTAMP-OF-AGENT-START>. One action per iteration, derive state from order history rather than memory.

On each iteration:

1. Call get_session_state. If activeSessionId is null, the agent has ended — log nothing, do nothing, exit. (User has stopped the agent; let the loop drain.)

2. Call check_should_stop. If stop=true, log a thought, call end_session, and exit.

3. Call list_orders status=open limit=20. If any open order matches <SYMBOL-LIST>, log "waiting on <id> @ <limitPrice>" and exit. Don't place a new order while one is pending for this strategy.

4. Call recent_trades limit=50. Filter to fills (status=filled or partially_filled) submitted after STRATEGY_START_TS for symbols in <SYMBOL-LIST>. Count them. If <EXIT-CHECK>, log "strategy complete — <details>", call end_session, exit.

5. Decide the next action from history:
<DECISION-TREE>

Rules:
- Always log_thought before any place_order or end_session call.
- Use limit orders unless the strategy explicitly requires market. TIF defaults to GTC for limits.
- Qty per order: <QTY> exactly. Never more.
- Round prices to 2 decimals.
- One action per iteration — do not chain multiple place_orders.
- Never call register_session — the agent was already created by trader-agent before this loop started.
- Never call reset_paper_account.
```

**Important:** `STRATEGY_START_TS` is baked into the loop prompt itself as a constant — your job in the strategy skill is to set it to the current ISO timestamp at the moment you generate the prompt. This removes the "first iteration sets up TS, then exits" handshake from the old skeleton, since the agent already exists.

## Filling in the decision tree

Step 5 is the strategy-specific brain. Pick the template that fits the user's pattern, or compose one from these primitives. Every branch must be expressed in terms of **the most recent relevant fill** (or its absence), not Claude's memory.

### Template A — alternating scalping (±N around anchor)

For "buy 1 X when down N, sell 1 X when up N, alternate".

```
   - If count == 0 (no strategy fills yet): call get_snapshot for <SYMBOL>. Set anchor = lastPrice. Place a BUY LIMIT <QTY> <SYMBOL> at (anchor − <OFFSET>). Log "trade 1/<TOTAL>: anchor=<x>, buying at <x−OFFSET>". Exit.
   - If the most-recent strategy fill was a BUY: anchor = its filledAvgPrice. Place SELL LIMIT <QTY> <SYMBOL> at (anchor + <OFFSET>). Log "trade <n+1>/<TOTAL>: anchor=<x>, selling at <x+OFFSET>". Exit.
   - If the most-recent strategy fill was a SELL: anchor = its filledAvgPrice. Place BUY LIMIT <QTY> <SYMBOL> at (anchor − <OFFSET>). Log "trade <n+1>/<TOTAL>: anchor=<x>, buying at <x−OFFSET>". Exit.
```

### Template B — one-directional limit ladder (DCA down)

For "keep buying X every N points it drops".

```
   - If count == 0: call get_snapshot for <SYMBOL>. Place a BUY LIMIT <QTY> <SYMBOL> at (lastPrice − <STEP>). Log "rung 1: anchor=<x>, buying at <x−STEP>". Exit.
   - Otherwise: the most-recent strategy fill is a BUY. Place the next BUY LIMIT <QTY> <SYMBOL> at (its filledAvgPrice − <STEP>). Log "rung <n+1>: anchor=<x>, buying at <x−STEP>". Exit.
```

### Template C — momentum entry + protected exit

For "buy X when up N% on the day, sell when up M% from entry or down K% from entry".

```
   - If no position in <SYMBOL>: call get_snapshot. If changeToday >= <ENTRY-PCT>, market BUY <QTY> <SYMBOL>. Log "entry: <SYMBOL> up <pct>% today, entering at market". Exit.
   - If position held: call get_portfolio, find <SYMBOL>'s unrealizedPlPct. If >= <TAKE-PROFIT-PCT>, market SELL the full position. Log "take-profit". Exit. Else if <= <STOP-LOSS-PCT>, market SELL the full position. Log "stop-loss". Exit. Else log "holding, plPct=<x>%" and exit.
```

### Template D — time-based rebalance

For "every N minutes, rebalance positions toward target weights".

```
   - Call get_portfolio. Compute current weights. Compare to target weights {<SYMBOL>: <WEIGHT>, …}. For the single symbol furthest from target, place a market order in the corrective direction sized to close half the gap. Log "rebalance: <SYMBOL> at <current>% vs target <target>%, placing <side> <qty>". Exit. (One symbol per iteration.)
```

### Unfamiliar pattern

If none of A–D fits, write the decision tree from scratch using the same rules:
- Every branch keyed off either `count`, the last fill's side/price/symbol, or a single market snapshot fetched THIS iteration.
- Never reference state that wasn't read this iteration.
- One `place_order` per branch maximum.

## Workflow when invoked

1. Read the user's strategy description.
2. Identify which template (A–D) best matches, or note that you'll write a custom decision tree.
3. If essential fields are missing (especially exit condition or symbol), ask ONE clarifying question.
4. Produce, in this order:
   - A **one-line summary** of the strategy as you understood it.
   - The **fenced `/loop` block** with all placeholders filled.
   - A brief **"what to watch"** note pointing the user at the Bolsa UI elements they'll see updating (Agent tab events, trade log rows, chart open-order lines, status bar P&L).
   - **Stop instructions**: "Hit `S` in the browser, or `Ctrl+C` in this terminal."
5. Ask: "Run it now, or want to tweak first?" Don't auto-invoke `/loop` — the user pastes when ready.

## Worked example

User: *"buy 1 QQQ when down 1 point, sell 1 QQQ when up 1 point, do 20 trades total"*

Your response (after calling `get_session_state` and confirming or creating an agent — assume the user approved an agent called `qqq-scalper`):

> **Agent:** `qqq-scalper` (just activated).
> **Strategy:** alternating ±1 scalp of 1 share QQQ, target 20 total fills.
>
> ```
> /loop 30s Continue the qqq-scalp strategy via bolsa. Goal: 20 total QQQ fills. STRATEGY_START_TS=2026-05-20T18:50:00Z. One action per iteration, derive state from order history rather than memory.
>
> On each iteration:
>
> 1. Call get_session_state. If activeSessionId is null, the agent has ended — exit.
>
> 2. Call check_should_stop. If stop=true, log a thought, call end_session, and exit.
>
> 3. Call list_orders status=open limit=20. If any open order has symbol QQQ, log "waiting on <id> @ <limitPrice>" and exit.
>
> 4. Call recent_trades limit=50. Filter to QQQ fills submitted after STRATEGY_START_TS. Count them. If count >= 20, log "strategy complete — 20 fills", call end_session, exit.
>
> 5. Decide the next action from history:
>    - If count == 0: call get_snapshot for QQQ. Set anchor = lastPrice. Place BUY LIMIT 1 QQQ at (anchor − 1.00). Log "trade 1/20: anchor=<x>, buying at <x−1>". Exit.
>    - If last QQQ fill was BUY: anchor = its filledAvgPrice. Place SELL LIMIT 1 QQQ at (anchor + 1.00). Log "trade <n+1>/20: anchor=<x>, selling at <x+1>". Exit.
>    - If last QQQ fill was SELL: anchor = its filledAvgPrice. Place BUY LIMIT 1 QQQ at (anchor − 1.00). Log "trade <n+1>/20: anchor=<x>, buying at <x−1>". Exit.
>
> Rules: <standard rules block>
> ```
>
> **What to watch:** Agent tab events tick in every 30s; trade log fills as orders execute; chart shows the next pending limit as an amber dashed line.
>
> **Stop:** press `S` in the browser or `Ctrl+C` here.
>
> Run it now, or want to tweak first?

## Backtest mode

If the user wants to **backtest** a strategy against historical bars instead of running it live (triggers: "backtest", "simulate against history", "test on last month's data", "dry-run on 5-min bars from April"), the workflow changes substantially.

Key differences vs live:

- **No `/loop`.** The backtest iterates bar-by-bar inside a single Claude turn. `get_backtest_context` returns deterministic state, so there's no memory-drift risk and `/loop`'s interval would only slow things down (1 bar = 1 iteration, a 200-bar run at /loop's minimum interval is hours).
- **No "wait on open order" pattern.** Backtest V1 fills orders at the current bar's close (market) or against [low, high] (limit) immediately. There are no resting orders to poll.
- **The driver is `advance_bar`**, not `sleep` or a real-time clock.
- **All state reads route through `get_backtest_context`** — don't call `get_snapshot`, `recent_trades`, `get_quote`, `get_clock`, or `get_bars` inside the loop. The context already has the current bar, simulated fills, positions, cash, and equity.
- **An agent session is still required** (`trader-agent` first). It's how the human sees the backtest happening in the UI and how the run is attributed in Analytics.

### Required input (backtest)

In addition to the live fields, you need:

| Field | What it controls | Example |
|---|---|---|
| `<BT-SYMBOL>` | Single symbol the backtest trades | `TSLA` |
| `<BT-TIMEFRAME>` | Bar resolution | `5Min`, `15Min`, `1H`, `1D` |
| `<BT-START>` | ISO date/time, inclusive | `2026-04-01` |
| `<BT-END>` | ISO date/time, exclusive | `2026-05-01` |
| `<BT-INITIAL-CASH>` | Starting cash | `100000` |

V1 backtest is single-symbol. If the user lists multiple, ask which one.

### Output skeleton (backtest)

Render verbatim, fenced. This is **not** a `/loop` — it's a one-shot prompt the user pastes; Claude iterates inside one turn.

```
Run the <STRATEGY-NAME> backtest via bolsa.

Setup:
1. Call get_backtest_status. If active=true, refuse and tell the user to call end_backtest first.
2. Call start_backtest symbol=<BT-SYMBOL> timeframe=<BT-TIMEFRAME> start=<BT-START> end=<BT-END> initialCash=<BT-INITIAL-CASH>. log_thought "backtest started: <BT-SYMBOL> <BT-TIMEFRAME> <BT-START>..<BT-END>, $<BT-INITIAL-CASH> initial".

Iterate (loop entirely inside this turn — do NOT pause between iterations):

1. Call check_should_stop. If stop=true, call end_backtest, log_thought "aborted by user", break.

2. Call get_backtest_context. If done=true, break.

3. Decide the next action from context (at most one place_order per iteration):
<DECISION-TREE-BACKTEST>

4. Call advance_bar.

After the loop:
- Call end_backtest. log_thought with a one-line summary: "backtest finished — equity $<finalEquity>, realized $<realizedPnl>, <closed> closed, WR <winRate*100>%, Sharpe <sharpe>, MaxDD $<maxDrawdown>".

Rules:
- Always log_thought before each place_order and at major decision points.
- Every branch reads only from get_backtest_context — never from memory of earlier iterations.
- Qty per order: <QTY>. Never more.
- Limit and market orders only — stop / stop_limit aren't supported in backtest V1.
- Single symbol only — never trade anything other than <BT-SYMBOL>.
- Don't call get_snapshot, recent_trades, get_quote, get_clock, or get_bars inside the loop.
```

### Decision-tree primitives (backtest)

Rewrite the live primitives in terms of `context = get_backtest_context()`:

- `count` (strategy fills) → `context.fills.length`
- last fill → `context.fills[context.fills.length - 1]`
- current price → `context.bar.close`
- current position qty → `context.positions[0]?.qty ?? 0`

#### Template A-BT — alternating scalping (backtest variant of A)

```
   - If context.fills.length == 0: Place BUY LIMIT <QTY> <BT-SYMBOL> at (context.bar.close − <OFFSET>). log_thought "trade 1: anchor=<close>, buying at <close−OFFSET>".
   - Else if last fill was BUY: anchor = its price. Place SELL LIMIT <QTY> <BT-SYMBOL> at (anchor + <OFFSET>). log_thought "trade <n+1>: anchor=<anchor>, selling at <anchor+OFFSET>".
   - Else (last fill was SELL): anchor = its price. Place BUY LIMIT <QTY> <BT-SYMBOL> at (anchor − <OFFSET>). log_thought "trade <n+1>: anchor=<anchor>, buying at <anchor−OFFSET>".
```

#### Template B-BT — DCA-down ladder
```
   - If context.fills.length == 0: Place BUY LIMIT <QTY> <BT-SYMBOL> at (context.bar.close − <STEP>). log_thought "rung 1, buying at <close−STEP>".
   - Else: anchor = last fill's price. Place BUY LIMIT <QTY> <BT-SYMBOL> at (anchor − <STEP>). log_thought "rung <n+1>, buying at <anchor−STEP>".
```

#### Template C-BT — momentum entry + protected exit
```
   - If context.positions.length == 0: If <ENTRY-CONDITION-FROM-BAR>, market BUY <QTY> <BT-SYMBOL>. log_thought "entry: <reason>".
   - Else: pos = context.positions[0]. plPct = ((context.bar.close − pos.avgCost) / pos.avgCost) * 100. If plPct >= <TAKE-PROFIT-PCT>, market SELL pos.qty. log_thought "take-profit at <plPct>%". Else if plPct <= <STOP-LOSS-PCT>, market SELL pos.qty. log_thought "stop-loss at <plPct>%". Else log_thought "holding, plPct=<plPct>%".
```

### Workflow when invoked for a backtest

Same as live, except:

1. Trader-agent session is still required (so the human sees the run streaming).
2. Confirm the five backtest params before generating — never invent symbol, dates, or initial cash.
3. Emit the **backtest output skeleton** instead of the `/loop` one.
4. Watch note: "Agent tab streams every advance_bar and place_order; Analytics → BACKTESTS section lists the row as RUNNING then COMPLETED."
5. Stop instructions: "Press `S` in the browser to abort — the loop will call end_backtest before exiting."

## Safety hard rules

- ALWAYS ensure an agent session is active before generating the prompt (`get_session_state` → invoke `trader-agent` if null).
- ALWAYS include `get_session_state` as step 1 (graceful exit if agent was killed).
- ALWAYS include `check_should_stop` as step 2.
- ALWAYS include `end_session` in both the should_stop branch AND the exit-condition branch.
- NEVER include `register_session` in the generated loop — that's `trader-agent`'s job.
- NEVER generate a prompt that calls `reset_paper_account` or otherwise closes positions wholesale.
- If the user asks for "flatten everything", "close all positions", or "reset", refuse and tell them to use the UI's `:reset` palette command directly.
- If the user requests `qty > 10` or omits an exit condition, surface a warning in your reply before showing the prompt and confirm before generating.
- Don't include markdown styling INSIDE the `/loop` body — Claude Code's loop input is plain text.
- In backtest mode: NEVER call live trading tools mid-backtest. start_backtest puts the MCP server into a mode where place_order / get_positions / get_portfolio / get_account return simulated state. Calling end_backtest restores live mode; calling end_session does NOT.
