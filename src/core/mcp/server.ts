// Bolsa MCP server construction. Builds an `McpServer` with every Bolsa
// trading tool registered. Each tool is a thin wrapper over `src/core/*` —
// the MCP layer is transport + tool surface only, no business logic.
//
// Every tool dispatch is wrapped with `withAudit` so it records
// `tool_call` + `tool_result` (or `error`) rows in `agent_events` when
// an agent session is active. Manual smoke tests without a session are
// silently un-logged.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { alpaca } from "@/lib/server";
import {
  routedAccount,
  routedCancelOrder,
  routedListOrders,
  routedPlaceOrder,
  routedPortfolio,
  routedPositions,
  routedRecentTrades,
} from "@/core/execution-context";
import {
  getBars,
  getLatestQuote,
  getSnapshots,
} from "@/core/quotes";
import { searchAssets } from "@/core/assets";
import {
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist,
} from "@/core/watchlist";
import { getMarketClock } from "@/core/clock";
import {
  endSession,
  getAgentState,
  recordEvent,
  registerSession,
  shouldStop,
  withAudit,
} from "@/core/agent-events";
import {
  advanceBar,
  endBacktest,
  getBacktestContext,
  isBacktestActive,
  startBacktest,
} from "@/core/backtest-engine";

// Wrap any JSON-serialisable value in the MCP "text" content shape.
function asText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

// Symbol shape used across many tools — Alpaca tickers are 1–10 uppercase
// alphanumeric; we accept lowercase and let downstream `.toUpperCase()` deal.
const symbolShape = z
  .string()
  .min(1)
  .max(10)
  .describe("Stock or ETF ticker symbol, e.g. AAPL, VOO, NVDA");

const timeframeEnum = z.enum([
  "1Min",
  "5Min",
  "15Min",
  "1H",
  "1D",
  "1W",
  "1M",
  "3M",
  "1Y",
]);

// Protocol that Claude Code sees on `initialize`. Tells it how to behave
// when the human says something like "using bolsa, buy 10 TSLA" — wrap
// every multi-step interaction in a session, log reasoning before
// actions, never hit the dangerous reset endpoint.
const BOLSA_AGENT_INSTRUCTIONS = `
Bolsa is a paper-trading platform. Trading happens against Alpaca's paper
account — no real money. A human spectates every action you take through
the Bolsa web UI, which subscribes via Supabase realtime to a log of your
tool calls and reasoning.

PROTOCOL — follow this whenever the user asks you to do anything with
Bolsa beyond a single read-only lookup:

1. At the START of the interaction, call \`register_session\` with a
   short, descriptive name (e.g. "buy-tsla", "rebalance-2026-05-20").
   This sets the active session, clears any stale STOP flag, and turns
   the AGENT ACTIVE indicator on in the human's browser. Do this even
   for single-shot tasks — it's how the human knows you're working.

2. BEFORE every action that changes account state (place_order,
   cancel_order, add_to_watchlist, remove_from_watchlist), call
   \`log_thought\` with ONE plain-English paragraph explaining what you
   are about to do and why. The human reads these in real time.

3. For read-only lookups (get_account, get_portfolio, get_positions,
   get_quote, get_snapshot, get_clock, etc.), you can call them
   directly without a preceding thought — but DO log a thought if your
   read is part of a multi-step plan.

4. If you're running in a loop (e.g. monitoring the market), call
   \`check_should_stop\` between iterations. Halt immediately if it
   returns { stop: true }.

5. NEVER call any reset or flatten operation. The human controls those
   from the UI. If they ask you to "close all positions" or "reset the
   account," refuse and tell them to use the UI's :reset command.

6. At the END of the interaction, call \`end_session\`. This turns the
   indicator off and gives the human a clean state.

INTERPRETING THE USER:

- "buy 10 TSLA" / "buy 10 stocks on Tesla" → place_order symbol=TSLA
  qty=10 side=buy type=market. If the market is closed (check with
  get_clock first), use a limit order at the current ask or explain
  that the market order will queue.
- "buy TSLA at 200" → place_order symbol=TSLA qty=<reasonable, ask
  user if unclear> side=buy type=limit limitPrice=200. TIF defaults
  to GTC for limits.
- "what do I have?" / "show me positions" → get_portfolio (covers
  positions + cash + P&L in one call).
- "is X a good buy right now?" → get_snapshot for X, optionally
  get_bars for context; log a thought with your reasoning; offer to
  place the order but don't act without explicit user confirmation
  beyond the initial request.
- Unspecified quantity → ask the user. Don't guess sizing.

REASONING:

Be specific in your thoughts. "Checking AAPL" is useless; "AAPL is up
2.3% on volume — looking at the 5-minute bars to see if the momentum
is fading before adding" is what the spectator wants to read.
`.trim();

export function buildBolsaMcpServer(): McpServer {
  const server = new McpServer(
    { name: "bolsa", version: "0.3.0" },
    { instructions: BOLSA_AGENT_INSTRUCTIONS },
  );

  // ---------- Session lifecycle (bridge to spectator UI) ----------

  server.registerTool(
    "register_session",
    {
      description:
        "Start an agent session. Sets this session as the active one, " +
        "clears any prior STOP flag, and records a session_start event. " +
        "Every subsequent tool call is audit-logged under this session, " +
        "and the spectator UI in Bolsa subscribes to those events. " +
        "Call this exactly once at the start of an agent run.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe(
            "Human-readable session name (e.g. 'momentum-2026-05-20'). " +
              "If omitted, a timestamp is used.",
          ),
      },
    },
    async ({ name }) => asText(await registerSession(name)),
  );

  server.registerTool(
    "end_session",
    {
      description:
        "End the current agent session. Clears the active-session " +
        "pointer and records a session_end event. Call this when the " +
        "agent loop is finishing or when handing off.",
    },
    async () => asText(await endSession()),
  );

  server.registerTool(
    "log_thought",
    {
      description:
        "Record the agent's reasoning. Streamed to the spectator UI " +
        "alongside tool calls. Call this BEFORE every action you take " +
        "to explain what you're about to do and why. The skill prompt " +
        "should enforce this — without thoughts, the human can't follow " +
        "your decisions in real time.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(4000)
          .describe("One paragraph of plain-English reasoning"),
      },
    },
    async ({ text }) => {
      await recordEvent({ kind: "thought", data: { text } });
      return asText({ logged: true });
    },
  );

  server.registerTool(
    "check_should_stop",
    {
      description:
        "Returns { stop: true } if the human has hit the STOP AGENT " +
        "button in the Bolsa UI, otherwise { stop: false }. Call this " +
        "between every iteration of your agent loop and halt immediately " +
        "if it returns true.",
    },
    async () => asText({ stop: await shouldStop() }),
  );

  server.registerTool(
    "get_session_state",
    {
      description:
        "Returns { activeSessionId, shouldStop }. Use this to check " +
        "whether an agent session is already active before calling " +
        "register_session — orchestration skills check this so they " +
        "don't overwrite an existing agent. shouldStop mirrors the " +
        "value returned by check_should_stop.",
    },
    async () => asText(await getAgentState()),
  );

  // ---------- Account & portfolio ----------

  server.registerTool(
    "get_account",
    {
      description:
        "Returns the current Alpaca paper-trading account: cash, equity, " +
        "buying power, day-trade count, and status. Use this to inspect " +
        "available capital before placing orders.",
    },
    withAudit("get_account", async () => asText(await routedAccount(alpaca))),
  );

  server.registerTool(
    "get_portfolio",
    {
      description:
        "Returns the full portfolio summary: cash, portfolio value, equity, " +
        "buying power, total unrealized P&L, day P&L, and every open position " +
        "with its qty / avg cost / current value / unrealized P&L.",
    },
    withAudit("get_portfolio", async () =>
      asText(await routedPortfolio(alpaca)),
    ),
  );

  server.registerTool(
    "get_positions",
    {
      description:
        "Returns the array of currently open positions. Each position " +
        "includes symbol, qty (positive = long, negative = short), " +
        "avgEntryPrice, currentPrice, marketValue, unrealizedPl, and " +
        "changeToday (percent).",
    },
    withAudit("get_positions", async () =>
      asText(await routedPositions(alpaca)),
    ),
  );

  // ---------- Orders ----------

  server.registerTool(
    "list_orders",
    {
      description:
        "Returns up to `limit` recent orders, optionally filtered by status. " +
        '`status="open"` returns only resting orders (new, accepted, ' +
        'partially_filled); `status="closed"` returns terminal orders; ' +
        '`status="all"` (default) returns everything.',
      inputSchema: {
        status: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Order status filter (default 'all')"),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max orders to return (default 100, max 500)"),
      },
    },
    withAudit("list_orders", async ({ status, limit }) =>
      asText(await routedListOrders(alpaca, { status, limit })),
    ),
  );

  server.registerTool(
    "place_order",
    {
      description:
        "Place an order on the paper account. Market orders execute " +
        "immediately during market hours. Limit/stop orders default to " +
        "GTC (good-til-canceled) so they persist across sessions. Returns " +
        "the created order with its id and status.",
      inputSchema: {
        symbol: symbolShape,
        qty: z
          .number()
          .int()
          .positive()
          .describe("Number of shares (whole number)"),
        side: z.enum(["buy", "sell"]),
        type: z.enum(["market", "limit", "stop", "stop_limit"]),
        timeInForce: z
          .enum(["day", "gtc", "ioc", "fok"])
          .optional()
          .describe(
            "Time-in-force. Defaults to GTC for limit/stop orders, DAY for market.",
          ),
        limitPrice: z
          .number()
          .positive()
          .optional()
          .describe("Required for limit and stop_limit orders"),
        stopPrice: z
          .number()
          .positive()
          .optional()
          .describe("Required for stop and stop_limit orders"),
      },
    },
    withAudit("place_order", async (input) =>
      asText(await routedPlaceOrder(alpaca, input)),
    ),
  );

  server.registerTool(
    "cancel_order",
    {
      description: "Cancel an open order by its id. Returns nothing on success.",
      inputSchema: {
        id: z.string().describe("Order id from list_orders or place_order"),
      },
    },
    withAudit("cancel_order", async ({ id }) => {
      await routedCancelOrder(alpaca, id);
      return asText({ id, canceled: true });
    }),
  );

  server.registerTool(
    "recent_trades",
    {
      description:
        "Returns recent filled trades (closed orders with status filled or " +
        "partially_filled). Useful for reviewing what's actually been " +
        "executed vs what's still resting.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max trades to return (default 100, max 500)"),
      },
    },
    withAudit("recent_trades", async ({ limit }) =>
      asText(await routedRecentTrades(alpaca, limit)),
    ),
  );

  // ---------- Market data ----------

  server.registerTool(
    "get_quote",
    {
      description:
        "Returns the latest bid/ask quote for a single symbol from the " +
        "Alpaca IEX feed. Includes bidPrice, bidSize, askPrice, askSize, " +
        "and timestamp.",
      inputSchema: { symbol: symbolShape },
    },
    withAudit("get_quote", async ({ symbol }) =>
      asText(await getLatestQuote(alpaca, symbol)),
    ),
  );

  server.registerTool(
    "get_snapshot",
    {
      description:
        "Returns a market snapshot for one or more symbols: last price, " +
        "bid/ask, day open/high/low/close/volume, previous close, and the " +
        "intraday change (absolute + percent). The fastest way to assess " +
        "a watchlist.",
      inputSchema: {
        symbols: z
          .array(symbolShape)
          .min(1)
          .max(50)
          .describe("Up to 50 tickers"),
      },
    },
    withAudit("get_snapshot", async ({ symbols }) =>
      asText(await getSnapshots(alpaca, symbols)),
    ),
  );

  server.registerTool(
    "get_bars",
    {
      description:
        "Returns historical OHLCV bars for a symbol. Use intraday " +
        "timeframes (1Min, 5Min, 15Min, 1H) for short windows, daily/weekly " +
        "(1D, 1W) for medium, and 1M/3M/1Y for longer trend analysis " +
        "(these use daily bars under the hood with appropriate lookback).",
      inputSchema: {
        symbol: symbolShape,
        timeframe: timeframeEnum,
        limit: z
          .number()
          .int()
          .positive()
          .max(10000)
          .optional()
          .describe(
            "Max bars to return. Defaults to a sensible per-timeframe value.",
          ),
      },
    },
    withAudit("get_bars", async ({ symbol, timeframe, limit }) =>
      asText(await getBars(alpaca, symbol, timeframe, limit)),
    ),
  );

  server.registerTool(
    "search_assets",
    {
      description:
        "Symbol typeahead. Returns up to `limit` tradable US equities " +
        "matching `query`. Ranks symbol prefix > symbol substring > company " +
        "name substring. Use this before adding to the watchlist or placing " +
        "an order on an unfamiliar ticker.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Partial symbol or company name, case-insensitive"),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    withAudit("search_assets", async ({ query, limit }) =>
      asText(await searchAssets(query, limit)),
    ),
  );

  server.registerTool(
    "get_clock",
    {
      description:
        "Returns the current market clock: isOpen, current server " +
        "timestamp, and ISO timestamps of the next open and next close. " +
        "Check this before placing market orders or scheduling agent loops.",
    },
    withAudit("get_clock", async () => asText(await getMarketClock(alpaca))),
  );

  // ---------- Backtest (V3 preview) ----------

  server.registerTool(
    "start_backtest",
    {
      description:
        "Begin a historical backtest. Loads bars for [start, end) and " +
        "puts the MCP server into backtest mode — subsequent place_order, " +
        "get_positions, get_portfolio, get_account, list_orders, and " +
        "recent_trades return simulated state against the loaded bars " +
        "instead of hitting Alpaca. Drive the simulation by alternating " +
        "advance_bar / get_backtest_context / place_order, then call " +
        "end_backtest to persist the result. Only one backtest can be " +
        "active at a time.",
      inputSchema: {
        symbol: symbolShape,
        timeframe: timeframeEnum,
        start: z
          .string()
          .describe("ISO date or timestamp, inclusive (e.g. 2026-04-01)"),
        end: z
          .string()
          .describe("ISO date or timestamp, exclusive (e.g. 2026-05-01)"),
        initialCash: z
          .number()
          .positive()
          .describe("Starting cash for the simulation, e.g. 100000"),
      },
    },
    withAudit("start_backtest", async ({ symbol, timeframe, start, end, initialCash }) =>
      asText(
        await startBacktest({ symbol, timeframe, start, end, initialCash }),
      ),
    ),
  );

  server.registerTool(
    "advance_bar",
    {
      description:
        "Move the backtest cursor forward one bar. Returns the new bar " +
        "(OHLCV + timestamp), current cursor index, total bar count, and " +
        "whether the run is done (cursor at last bar). The loop should " +
        "stop calling advance_bar once done=true and proceed to end_backtest.",
    },
    withAudit("advance_bar", async () => asText(advanceBar())),
  );

  server.registerTool(
    "get_backtest_context",
    {
      description:
        "Read the current backtest state: cursor / total bars, the current " +
        "bar (OHLCV), simulated cash, equity (mark-to-market), realized " +
        "P&L so far, open simulated positions, and the full fill history. " +
        "Use this in place of get_snapshot/recent_trades inside a backtest " +
        "loop — it returns the same data shape the strategy needs to decide.",
    },
    withAudit("get_backtest_context", async () => asText(getBacktestContext())),
  );

  server.registerTool(
    "end_backtest",
    {
      description:
        "Finalize the active backtest, persist results to the " +
        "backtest_runs table, and return summary metrics " +
        "(final equity, realized P&L, win rate, Sharpe, max drawdown, " +
        "trade counts). The MCP server returns to live mode after this " +
        "call. Always call this at the end — without it the run sits in " +
        "status='running' and the in-memory state leaks until the server " +
        "restarts.",
    },
    withAudit("end_backtest", async () => asText(await endBacktest())),
  );

  server.registerTool(
    "get_backtest_status",
    {
      description:
        "Returns { active: boolean } indicating whether a backtest is " +
        "currently running. Useful for orchestration skills that need to " +
        "check before starting a new run.",
    },
    async () => asText({ active: isBacktestActive() }),
  );

  // ---------- Watchlist ----------

  server.registerTool(
    "list_watchlist",
    {
      description:
        "Returns the symbols currently on the Bolsa watchlist (the same " +
        "list shown in the terminal UI's left panel).",
    },
    withAudit("list_watchlist", async () =>
      asText({ symbols: await listWatchlist() }),
    ),
  );

  server.registerTool(
    "add_to_watchlist",
    {
      description:
        "Add a symbol to the Bolsa watchlist. The UI will pick it up via " +
        "polling within a few seconds. Idempotent — adding an existing " +
        "symbol is a no-op. Returns the full updated watchlist.",
      inputSchema: { symbol: symbolShape },
    },
    withAudit("add_to_watchlist", async ({ symbol }) =>
      asText({ symbols: await addToWatchlist(symbol) }),
    ),
  );

  server.registerTool(
    "remove_from_watchlist",
    {
      description:
        "Remove a symbol from the Bolsa watchlist. Returns the full updated " +
        "watchlist.",
      inputSchema: { symbol: symbolShape },
    },
    withAudit("remove_from_watchlist", async ({ symbol }) =>
      asText({ symbols: await removeFromWatchlist(symbol) }),
    ),
  );

  return server;
}
