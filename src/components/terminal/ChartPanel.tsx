"use client";

import { useMemo, useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtVolume } from "@/lib/format";
import { useBars, useSnapshots } from "@/lib/hooks";
import type { Timeframe } from "@/core/types";

const TIMEFRAMES: Timeframe[] = ["1Min", "15Min", "1H", "1D", "1W"];

const TF_LABEL: Record<Timeframe, string> = {
  "1Min": "1m",
  "5Min": "5m",
  "15Min": "15m",
  "1H": "1H",
  "1D": "1D",
  "1W": "1W",
};

type Props = { symbol: string | null };

export function ChartPanel({ symbol }: Props) {
  const [tf, setTf] = useState<Timeframe>("1D");
  const { data: barsData, isLoading } = useBars(symbol, tf);
  const { data: snapData } = useSnapshots(symbol ? [symbol] : []);
  const snap = symbol ? snapData?.snapshots[symbol] : undefined;

  const candles = barsData?.bars ?? [];

  const { lo, hi } = useMemo(() => {
    if (candles.length === 0) return { lo: 0, hi: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    return { lo, hi };
  }, [candles]);

  const W = 800;
  const H = 280;
  const padX = 24;
  const padY = 12;
  const cw = candles.length > 0 ? (W - padX * 2) / candles.length : 0;
  const yFor = (v: number) =>
    padY + ((hi - v) / (hi - lo)) * (H - padY * 2);

  const gridLines = useMemo(() => {
    const out: { y: number; v: number }[] = [];
    for (let i = 0; i <= 5; i++) {
      const v = lo + ((hi - lo) * i) / 5;
      out.push({ v, y: yFor(v) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  return (
    <Panel
      title={`Chart — ${symbol ?? "—"} — ${TF_LABEL[tf]}`}
      rightSlot={
        <div className="flex gap-1 text-[10px]">
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
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              {gridLines.map((g, i) => (
                <g key={i}>
                  <line
                    x1={padX}
                    x2={W - padX}
                    y1={g.y}
                    y2={g.y}
                    stroke="#1a3a1a"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                  />
                  <text
                    x={W - padX + 4}
                    y={g.y + 3}
                    fontSize={9}
                    fill="#00aa2a"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtPrice(g.v)}
                  </text>
                </g>
              ))}
              {candles.map((c, i) => {
                const x = padX + i * cw + cw / 2;
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
              })}
            </svg>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2 border-t border-[var(--color-phosphor-dark)] px-3 py-2 font-display text-base tabular-nums">
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
