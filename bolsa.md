# Bolsa

> A paper trading platform for stocks and ETFs with a retro CRT terminal aesthetic.
> Inspired by 1980s Wall Street trading terminals — the era when trading was still done on paper.

---

## Concept

Modern trading apps look the same — glassmorphism, gradients, rounded corners.
Bolsa is different. It looks like the terminals that ran Wall Street before everything went digital.

The irony is intentional: a paper trading platform that looks like it belongs to the era of paper trading.

---

## Visual Identity

### Aesthetic
- **CRT phosphor green on black** — the definitive Wall Street terminal look
- Monospace typography throughout — no exceptions
- Scanline overlay effect across the entire UI
- Subtle CRT screen curvature at edges
- Blinking cursor on active inputs
- Dot matrix style price displays
- Pixelated panel borders and dividers
- ASCII-style decorative elements where appropriate

### Color Palette
```
Background:     #0A0A0A  (near black)
Primary text:   #00FF41  (phosphor green)
Dim text:       #00AA2A  (darker green)
Accent:         #00FF41  (same green, higher opacity)
Negative/loss:  #FF3333  (red — only non-green color)
Positive/gain:  #00FF41  (green — same as primary)
Border:         #1A3A1A  (very dark green)
```

### Typography
- **Primary:** IBM Plex Mono
- **Secondary:** Courier New (fallback)
- All numbers: tabular figures, monospace
- Price displays: dot matrix style rendering

### Effects
- Scanline CSS overlay (repeating linear gradient)
- Subtle screen flicker on load
- Phosphor glow on active elements (`text-shadow: 0 0 8px #00FF41`)
- CRT barrel distortion at screen edges (subtle CSS transform)

---

## Target Users

- Developers and traders who want to practice without real money
- Personal use first — designed for one user initially
- Potentially shared with friends later

---

## Data Provider: Alpaca

[Alpaca](https://alpaca.markets/) is chosen as the primary data and execution provider.

**Why Alpaca:**
- Free paper trading API with real execution simulation
- Real-time US stocks and ETF quotes included
- Single API for both market data and order execution
- No subscription required for paper trading tier
- WebSocket support for live price streaming

**Assets supported in V1:**
- US Stocks (NYSE, NASDAQ)
- US ETFs (VOO, QQQ, SPY, etc.)

---

## V1 Features

### Watchlist
- Add / remove symbols
- Real-time price updates via WebSocket
- Price change % with green/red coloring
- Keyboard navigation between symbols
- Terminal-style search: type symbol, press Enter

### Charts
- Candlestick chart — primary view
- Line chart — toggle option
- Timeframes: 1D, 1W, 1M, 3M, 1Y
- Minimal chart chrome — data first
- Green/red candles consistent with terminal palette
- No fancy tooltips — crosshair with raw data readout

### Live Quotes
- Real-time bid/ask spread
- Last price, volume, day high/low
- WebSocket connection — updates without refresh
- Visual "tick" animation on price change

### Trade Execution (Paper)
- Market orders
- Limit orders
- Basic order confirmation screen
- Position sizing input
- All via Alpaca paper trading API

### Trade History
- Chronological list of all executed trades
- Symbol, side (BUY/SELL), qty, price, timestamp
- P&L per trade
- Exportable as CSV

### Portfolio Overview
- Current positions with avg cost and current value
- Unrealized P&L per position and total
- Cash balance remaining
- Total portfolio value
- Simple allocation breakdown

---

## Architecture

### API-First Design

Bolsa is built API-first from day one. All business logic lives in the API layer — the UI is just a consumer. This enables future MCP server integration and the 3D Trading Game to reuse the same core.

```
┌─────────────────────────────────────────┐
│           Bolsa API (Next.js)           │
│                                         │
│  /api/portfolio    - positions, P&L     │
│  /api/orders       - place, cancel      │
│  /api/trades       - history            │
│  /api/watchlist    - manage symbols     │
│  /api/quotes/:sym  - real-time data     │
│                                         │
│  WebSocket /ws/quotes - live streaming  │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼───┐      ┌──────▼──────┐
│ Bolsa │      │  Future     │
│  UI   │      │  Consumers  │
│       │      │  (3D Game,  │
│       │      │   MCP, etc) │
└───────┘      └─────────────┘
             │
    ┌────────▼────────┐
    │  Alpaca API     │
    │  Paper Trading  │
    └─────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + custom CRT effects |
| Charts | TradingView Lightweight Charts |
| Real-time | WebSocket (Alpaca stream) |
| Database | Supabase (session, watchlist, history) |
| Auth | Supabase Auth |
| Data / Execution | Alpaca Paper Trading API |
| Deployment | Vercel |

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  BOLSA TERMINAL v1.0          [PAPER] [CONNECTED]   │
├──────────────┬──────────────────────────────────────┤
│  WATCHLIST   │  CHART — AAPL — 1D                   │
│              │                                      │
│  AAPL +1.2%  │  ┌────────────────────────────────┐  │
│  VOO  +0.4%  │  │                                │  │
│  QQQ  -0.1%  │  │   [candlestick chart area]     │  │
│  TSLA +3.1%  │  │                                │  │
│  SPY  +0.3%  │  └────────────────────────────────┘  │
│              │  BID: 182.44  ASK: 182.46  VOL: 42M  │
│  > _         ├──────────────────────────────────────┤
│              │  ORDER ENTRY                         │
│              │  SYM: [AAPL] QTY: [10] [MARKET▼]    │
│              │  [BUY]  [SELL]                       │
├──────────────┴──────────────────────────────────────┤
│  PORTFOLIO: $102,847.22  P&L: +$2,847.22 (+2.85%)  │
├─────────────────────────────────────────────────────┤
│  TRADE LOG                                          │
│  09:42:31  BUY   AAPL  10  @182.45  FILLED         │
│  09:38:12  SELL  VOO    5  @441.20  FILLED         │
└─────────────────────────────────────────────────────┘
```

---

## V1 Scope

**In scope:**
- Watchlist with real-time quotes
- Candlestick and line charts
- Market and limit orders (paper)
- Trade history log
- Portfolio overview with P&L
- CRT terminal visual design
- Alpaca API integration

**Out of scope for V1:**
- Backtesting
- Multiple portfolios
- Options / crypto / forex
- Alerts / notifications
- Mobile responsive layout
- MCP server (V2)
- 3D Trading Game integration (separate project)

---

## Future Roadmap

| Version | Feature |
|---|---|
| V1 | Core trading UI, watchlist, charts, paper execution |
| V2 | MCP server, API exposed for external consumers |
| V3 | Backtesting engine with historical data |
| V4 | Algorithm integration (Kelly Criterion / custom) |
| V5 | 3D Trading Game consumes Bolsa API |

---

## Connection to Ecosystem

Bolsa is the **core trading engine** of the broader ecosystem:

```
Custom Algorithm
      ↓
Bolsa API (core engine)
      ↓
┌─────┴──────┐
│            │
Bolsa UI   3D Trading Game
(terminal)  (future project)
```

The retro terminal UI is one interface to Bolsa.
The 3D game will be another.
The algorithm will power both.

---

## Why "Bolsa"

*Bolsa* means stock exchange in Spanish and Portuguese.
Simple, international, precise — and a nod to the languages being learned.

