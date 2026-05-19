"use client";

import { useMemo, useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtVolume } from "@/lib/format";
import { generateCandles, type Symbol } from "@/lib/mock";

const TIMEFRAMES = ["1D", "1W", "1M", "3M", "1Y"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

type Props = { symbol: Symbol };

export function ChartPanel({ symbol }: Props) {
  const [tf, setTf] = useState<Timeframe>("1D");

  const candles = useMemo(
    () => generateCandles(symbol.price, 90),
    [symbol.price],
  );

  const { lo, hi } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    return { lo, hi };
  }, [candles]);

  const W = 800;
  const H = 280;
  const padX = 24;
  const padY = 12;
  const cw = (W - padX * 2) / candles.length;
  const yFor = (v: number) =>
    padY + ((hi - v) / (hi - lo)) * (H - padY * 2);

  // grid lines (5 horizontal)
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
      title={`Chart — ${symbol.ticker} — ${tf}`}
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
              {t}
            </button>
          ))}
        </div>
      }
      className="flex-1"
    >
      <div className="flex h-full flex-col">
        <div className="relative flex-1 p-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            {/* grid */}
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
            {/* candles */}
            {candles.map((c, i) => {
              const x = padX + i * cw + cw / 2;
              const up = c.c >= c.o;
              const color = up ? "#00FF41" : "#FF3333";
              const bodyTop = yFor(Math.max(c.o, c.c));
              const bodyBot = yFor(Math.min(c.o, c.c));
              const bodyH = Math.max(1, bodyBot - bodyTop);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    x2={x}
                    y1={yFor(c.h)}
                    y2={yFor(c.l)}
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
        </div>
        <div className="grid grid-cols-5 gap-2 border-t border-[var(--color-phosphor-dark)] px-3 py-2 font-display text-base tabular-nums">
          <Stat label="LAST" value={fmtPrice(symbol.price)} accent />
          <Stat label="BID" value={fmtPrice(symbol.bid)} />
          <Stat label="ASK" value={fmtPrice(symbol.ask)} />
          <Stat label="VOL" value={fmtVolume(symbol.volume)} />
          <Stat
            label="DAY RANGE"
            value={`${fmtPrice(symbol.dayLow)}–${fmtPrice(symbol.dayHigh)}`}
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
