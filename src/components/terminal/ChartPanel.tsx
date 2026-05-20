"use client";

import { useMemo, useRef, useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtVolume } from "@/lib/format";
import { useBars, useOrders, useSnapshots } from "@/lib/hooks";
import { usePersistedState } from "@/lib/persisted";
import type { Bar, Order, Timeframe } from "@/core/types";

const TIMEFRAMES: Timeframe[] = [
  "1Min",
  "15Min",
  "1H",
  "1D",
  "1W",
  "1M",
  "3M",
  "1Y",
];

const TF_LABEL: Record<Timeframe, string> = {
  "1Min": "1m",
  "5Min": "5m",
  "15Min": "15m",
  "1H": "1H",
  "1D": "1D",
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "1Y": "1Y",
};

const isTimeframe = (v: string): v is Timeframe =>
  (TIMEFRAMES as readonly string[]).includes(v);

type ChartKind = "candle" | "line";
const isChartKind = (v: string): v is ChartKind =>
  v === "candle" || v === "line";

type Props = { symbol: string | null };

export function ChartPanel({ symbol }: Props) {
  const [tf, setTf] = usePersistedState<Timeframe>(
    "bolsa.chart.tf",
    "1D",
    isTimeframe,
  );
  const [kind, setKind] = usePersistedState<ChartKind>(
    "bolsa.chart.kind",
    "candle",
    isChartKind,
  );
  const { data: barsData, isLoading } = useBars(symbol, tf);
  const { data: snapData } = useSnapshots(symbol ? [symbol] : []);
  const { data: openOrders } = useOrders("open");
  const snap = symbol ? snapData?.snapshots[symbol] : undefined;

  const candles = barsData?.bars ?? [];

  const symbolOpenOrders = useMemo<Order[]>(() => {
    if (!symbol || !openOrders) return [];
    return openOrders.filter(
      (o) => o.symbol === symbol && o.limitPrice != null,
    );
  }, [symbol, openOrders]);

  const { lo, hi } = useMemo(() => {
    if (candles.length === 0) return { lo: 0, hi: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    // Pull in open-order lines and prev close into the visible range so they don't clip
    for (const o of symbolOpenOrders) {
      if (o.limitPrice != null) {
        if (o.limitPrice < lo) lo = o.limitPrice;
        if (o.limitPrice > hi) hi = o.limitPrice;
      }
    }
    if (snap?.prevClose && snap.prevClose > 0) {
      if (snap.prevClose < lo) lo = snap.prevClose;
      if (snap.prevClose > hi) hi = snap.prevClose;
    }
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    // Small visual padding
    const pad = (hi - lo) * 0.04;
    return { lo: lo - pad, hi: hi + pad };
  }, [candles, symbolOpenOrders, snap?.prevClose]);

  const W = 800;
  const H = 280;
  const padX = 24;
  const padY = 12;
  const cw = candles.length > 0 ? (W - padX * 2) / candles.length : 0;
  const yFor = (v: number) =>
    padY + ((hi - v) / (hi - lo)) * (H - padY * 2);
  const xFor = (i: number) => padX + i * cw + cw / 2;

  const gridLines = useMemo(() => {
    const out: { y: number; v: number }[] = [];
    for (let i = 0; i <= 5; i++) {
      const v = lo + ((hi - lo) * i) / 5;
      out.push({ v, y: yFor(v) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  // Crosshair
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{
    i: number;
    bar: Bar;
    x: number;
    y: number;
    price: number;
  } | null>(null);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || candles.length === 0) return;
    const rect = svg.getBoundingClientRect();
    // Map screen position into the viewBox coordinate system
    const xVB = ((e.clientX - rect.left) / rect.width) * W;
    const yVB = ((e.clientY - rect.top) / rect.height) * H;
    const i = Math.max(
      0,
      Math.min(candles.length - 1, Math.floor((xVB - padX) / cw)),
    );
    const bar = candles[i];
    if (!bar) return;
    const price = lo + ((H - padY - yVB) / (H - padY * 2)) * (hi - lo);
    setHover({ i, bar, x: xFor(i), y: yVB, price });
  }

  function onLeave() {
    setHover(null);
  }

  const linePath = useMemo(() => {
    if (kind !== "line" || candles.length === 0) return "";
    return candles
      .map((c, i) => {
        const x = xFor(i);
        const y = yFor(c.close);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, candles, lo, hi]);

  return (
    <Panel
      title={`Chart — ${symbol ?? "—"} — ${TF_LABEL[tf]}`}
      rightSlot={
        <div className="flex items-center gap-2 text-[10px]">
          <div className="flex">
            <button
              onClick={() => setKind("candle")}
              className={`px-[6px] py-[1px] ${
                kind === "candle"
                  ? "bg-[var(--color-phosphor)] text-[var(--color-bg)] [text-shadow:none]"
                  : "border border-[var(--color-phosphor-dark)] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)]"
              }`}
              title="candlestick"
            >
              CDL
            </button>
            <button
              onClick={() => setKind("line")}
              className={`px-[6px] py-[1px] ${
                kind === "line"
                  ? "bg-[var(--color-phosphor)] text-[var(--color-bg)] [text-shadow:none]"
                  : "border border-[var(--color-phosphor-dark)] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)]"
              }`}
              title="line"
            >
              LINE
            </button>
          </div>
          <div className="flex gap-1">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`px-[6px] py-[1px] ${
                  t === tf
                    ? "bg-[var(--color-phosphor)] text-[var(--color-bg)] [text-shadow:none]"
                    : "border border-[var(--color-phosphor-dark)] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)]"
                }`}
              >
                {TF_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      }
      className="flex-1"
    >
      <div className="flex h-full flex-col">
        <div className="relative flex-1 p-2">
          {isLoading && candles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--color-phosphor-dim)] cursor-blink">
              LOADING BARS
            </div>
          ) : candles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--color-phosphor-dim)]">
              NO DATA
            </div>
          ) : (
            <div className="relative h-full w-full">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
              >
                {gridLines.map((g, i) => (
                  <line
                    key={i}
                    x1={padX}
                    x2={W - padX}
                    y1={g.y}
                    y2={g.y}
                    stroke="#1a3a1a"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                  />
                ))}

                {/* Previous close — solid dim horizontal line */}
                {snap?.prevClose ? (
                  <line
                    x1={padX}
                    x2={W - padX}
                    y1={yFor(snap.prevClose)}
                    y2={yFor(snap.prevClose)}
                    stroke="#00aa2a"
                    strokeDasharray="1 3"
                    strokeWidth={1}
                  />
                ) : null}

                {/* Open orders — amber dashed horizontal lines at limit price */}
                {symbolOpenOrders.map((o) => (
                  <line
                    key={o.id}
                    x1={padX}
                    x2={W - padX}
                    y1={yFor(o.limitPrice!)}
                    y2={yFor(o.limitPrice!)}
                    stroke="#ffb000"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                ))}

                {kind === "candle"
                  ? candles.map((c, i) => {
                      const x = xFor(i);
                      const up = c.close >= c.open;
                      const color = up ? "#00FF41" : "#FF3333";
                      const bodyTop = yFor(Math.max(c.open, c.close));
                      const bodyBot = yFor(Math.min(c.open, c.close));
                      const bodyH = Math.max(1, bodyBot - bodyTop);
                      return (
                        <g key={i}>
                          <line
                            x1={x}
                            x2={x}
                            y1={yFor(c.high)}
                            y2={yFor(c.low)}
                            stroke={color}
                            strokeWidth={1}
                          />
                          <rect
                            x={x - Math.max(1, cw * 0.35)}
                            y={bodyTop}
                            width={Math.max(2, cw * 0.7)}
                            height={bodyH}
                            fill={up ? color : "#0a0a0a"}
                            stroke={color}
                            strokeWidth={1}
                          />
                        </g>
                      );
                    })
                  : (
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#00FF41"
                        strokeWidth={1.5}
                      />
                    )}

                {/* Crosshair lines */}
                {hover && (
                  <g>
                    <line
                      x1={hover.x}
                      x2={hover.x}
                      y1={padY}
                      y2={H - padY}
                      stroke="#00FF41"
                      strokeOpacity={0.35}
                      strokeDasharray="2 2"
                      strokeWidth={1}
                    />
                    <line
                      x1={padX}
                      x2={W - padX}
                      y1={hover.y}
                      y2={hover.y}
                      stroke="#00FF41"
                      strokeOpacity={0.35}
                      strokeDasharray="2 2"
                      strokeWidth={1}
                    />
                  </g>
                )}
              </svg>

              {/* HTML label overlay — text stays at CSS pixel size regardless
                  of how the non-uniformly-stretched SVG scales. */}
              <div className="pointer-events-none absolute inset-0 font-mono text-[10px] tabular-nums">
                {/* Right-axis price ticks */}
                {gridLines.map((g, i) => (
                  <span
                    key={i}
                    className="absolute pr-0.5 text-[var(--color-phosphor-dim)]"
                    style={{
                      right: 0,
                      top: `calc(${(g.y / H) * 100}% - 7px)`,
                    }}
                  >
                    {fmtPrice(g.v)}
                  </span>
                ))}

                {/* Prev close label — anchored to the right axis with a
                    background chip so it doesn't collide with the leftmost
                    candle. */}
                {snap?.prevClose ? (
                  <span
                    className="absolute border border-[var(--color-phosphor-dim)] bg-[var(--color-bg)] px-1 text-[var(--color-phosphor-dim)]"
                    style={{
                      right: 56,
                      top: `calc(${(yFor(snap.prevClose) / H) * 100}% - 8px)`,
                    }}
                  >
                    PC {fmtPrice(snap.prevClose)}
                  </span>
                ) : null}

                {/* Open-order labels — same right-axis treatment. */}
                {symbolOpenOrders.map((o) => (
                  <span
                    key={o.id}
                    className="absolute border border-[var(--color-amber)] bg-[var(--color-bg)] px-1 text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
                    style={{
                      right: 56,
                      top: `calc(${(yFor(o.limitPrice!) / H) * 100}% - 8px)`,
                    }}
                  >
                    {o.side === "buy" ? "▲" : "▼"} {o.side.toUpperCase()} {o.qty} @ {fmtPrice(o.limitPrice!)}
                  </span>
                ))}

                {/* Crosshair price chip on right axis */}
                {hover && (
                  <span
                    className="absolute border border-[var(--color-phosphor)] bg-[var(--color-bg)] px-1 text-[var(--color-phosphor)] glow"
                    style={{
                      right: 0,
                      top: `calc(${(hover.y / H) * 100}% - 8px)`,
                    }}
                  >
                    {fmtPrice(hover.price)}
                  </span>
                )}
              </div>
            </div>
          )}

          {hover && (
            <div className="pointer-events-none absolute left-2 top-2 border border-[var(--color-phosphor-dark)] bg-[var(--color-bg)] px-2 py-1 text-[10px] tabular-nums text-[var(--color-phosphor-dim)] font-mono">
              <span className="mr-2 text-[var(--color-phosphor)]">
                O {fmtPrice(hover.bar.open)}
              </span>
              <span className="mr-2">H {fmtPrice(hover.bar.high)}</span>
              <span className="mr-2">L {fmtPrice(hover.bar.low)}</span>
              <span className="mr-2 text-[var(--color-phosphor)]">
                C {fmtPrice(hover.bar.close)}
              </span>
              <span>V {fmtVolume(hover.bar.volume)}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2 border-t border-[var(--color-phosphor-dark)] px-3 py-1.5 font-display text-base tabular-nums">
          <Stat label="LAST" value={snap ? fmtPrice(snap.lastPrice) : "—"} accent />
          <Stat label="BID" value={snap ? fmtPrice(snap.bidPrice) : "—"} />
          <Stat label="ASK" value={snap ? fmtPrice(snap.askPrice) : "—"} />
          <Stat label="VOL" value={snap ? fmtVolume(snap.dayVolume) : "—"} />
          <Stat
            label="DAY RANGE"
            value={
              snap
                ? `${fmtPrice(snap.dayLow)}–${fmtPrice(snap.dayHigh)}`
                : "—"
            }
          />
        </div>
      </div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-phosphor-dim)] [text-shadow:none]">
        {label}
      </span>
      <span className={accent ? "glow-strong" : "glow"}>{value}</span>
    </div>
  );
}
