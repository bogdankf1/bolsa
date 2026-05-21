"use client";

import { useMemo } from "react";
import { Panel } from "./Panel";
import { fmtUsd, fmtPct } from "@/lib/format";
import {
  useAgentSessions,
  useBacktestRuns,
  useOrders,
  type BacktestRunSummary,
} from "@/lib/hooks";
import {
  useBacktestSelection,
  type BacktestRunDetail,
} from "@/lib/backtest-selection";
import { usePersistedState } from "@/lib/persisted";
import {
  aggregateMetrics,
  computeRealizedPnl,
  countFills,
  extractClosedTrades,
  rangeBounds,
  type AggregatedMetrics,
  type EquityPoint,
  type TimeRange,
} from "@/core/pnl";
import {
  attributeTradesToSessions,
  type SessionAttribution,
  type SessionWindow,
} from "@/core/sessions";

type Props = {
  active: boolean;
  /** Suppress the inner Panel header — page.tsx provides the tab bar. */
  headless?: boolean;
};

const RANGES: TimeRange[] = ["today", "7d", "30d", "all"];
const RANGE_LABELS: Record<TimeRange, string> = {
  today: "TODAY",
  "7d": "7D",
  "30d": "30D",
  all: "ALL",
};
const isRange = (v: string): v is TimeRange =>
  (RANGES as readonly string[]).includes(v);

const ANALYTICS_ORDER_LIMIT = 500;

export function Analytics({ headless }: Props) {
  const { data: orders, isLoading } = useOrders("all", ANALYTICS_ORDER_LIMIT);
  const { data: sessions } = useAgentSessions();
  const { data: backtests } = useBacktestRuns();
  const [range, setRange] = usePersistedState<TimeRange>(
    "bolsa.analytics.range",
    "7d",
    isRange,
  );

  const all = useMemo(() => orders ?? [], [orders]);

  // FIFO realized P&L computed over the full order list so cost basis
  // carries across window boundaries.
  const metrics = useMemo<AggregatedMetrics>(() => {
    const bounds = rangeBounds(range);
    const realized = computeRealizedPnl(all);
    const closed = extractClosedTrades(all, realized).filter(
      (t) => t.ts >= bounds.start && t.ts < bounds.end,
    );
    return aggregateMetrics(closed, countFills(all, bounds));
  }, [all, range]);

  const sessionWindows = useMemo<SessionWindow[]>(() => {
    return (sessions ?? []).map((s) => ({
      sessionId: s.sessionId,
      startedAt: Date.parse(s.startedAt),
      endedAt: s.endedAt ? Date.parse(s.endedAt) : null,
    }));
  }, [sessions]);

  // Session attribution always spans full history — windowing per-range
  // makes the table noisy (sessions that started before "today" would
  // vanish). Show every session; per-range stays in the cards above.
  const sessionAttribution = useMemo<SessionAttribution[]>(
    () => attributeTradesToSessions(all, sessionWindows),
    [all, sessionWindows],
  );

  function handleCsvExport() {
    const header = [
      "bucket",
      "started",
      "ended",
      "trades",
      "closed",
      "realizedPnl",
      "winRate",
      "sharpe",
      "maxDrawdown",
      "profitFactor",
    ].join(",");
    const rows = sessionAttribution.map((a) =>
      [
        a.label,
        a.windowStartedAt ? new Date(a.windowStartedAt).toISOString() : "",
        a.windowEndedAt ? new Date(a.windowEndedAt).toISOString() : "",
        a.metrics.trades,
        a.metrics.closedTrades,
        a.metrics.realizedPnl.toFixed(4),
        a.metrics.winRate.toFixed(4),
        a.metrics.sharpe.toFixed(4),
        a.metrics.maxDrawdown.toFixed(4),
        a.metrics.profitFactor === Number.POSITIVE_INFINITY
          ? "inf"
          : a.metrics.profitFactor.toFixed(4),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `bolsa-analytics-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      title={headless ? undefined : "Analytics"}
      className={headless ? "border-0" : ""}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-phosphor-dark)] px-3 py-1.5">
          <div className="flex gap-1 text-[10px]">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-1.5 py-[1px] ${
                  r === range
                    ? "bg-[var(--color-phosphor)] text-[var(--color-bg)] [text-shadow:none]"
                    : "border border-[var(--color-phosphor-dark)] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)]"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCsvExport}
            disabled={sessionAttribution.length === 0}
            className="border border-[var(--color-phosphor-dark)] px-1.5 py-[1px] text-[10px] tracking-[0.15em] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)] disabled:opacity-30"
            title="Export per-session analytics breakdown as CSV"
          >
            CSV
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-px bg-[var(--color-phosphor-faint)]">
            <MetricCard
              label="REALIZED"
              value={
                metrics.closedTrades === 0
                  ? "—"
                  : fmtUsd(metrics.realizedPnl, { sign: true })
              }
              tone={
                metrics.closedTrades === 0
                  ? undefined
                  : metrics.realizedPnl >= 0
                    ? "gain"
                    : "loss"
              }
            />
            <MetricCard
              label="WIN RATE"
              value={
                metrics.closedTrades === 0
                  ? "—"
                  : fmtPct(metrics.winRate * 100)
              }
              sub={
                metrics.closedTrades === 0
                  ? undefined
                  : `${metrics.winCount}/${metrics.closedTrades}`
              }
            />
            <MetricCard
              label="SHARPE"
              value={
                metrics.sharpe === 0 ? "—" : metrics.sharpe.toFixed(2)
              }
              tooltip="annualized from daily realized P&L (rf=0); needs ≥2 trading days"
            />
            <MetricCard
              label="MAX DD"
              value={
                metrics.maxDrawdown === 0
                  ? "—"
                  : fmtUsd(-metrics.maxDrawdown)
              }
              tone={metrics.maxDrawdown > 0 ? "loss" : undefined}
              tooltip="peak-to-trough drop on the equity curve"
            />
            <MetricCard
              label="AVG WIN"
              value={
                metrics.winCount === 0 ? "—" : fmtUsd(metrics.avgWin)
              }
              tone={metrics.winCount > 0 ? "gain-dim" : undefined}
            />
            <MetricCard
              label="AVG LOSS"
              value={
                metrics.lossCount === 0 ? "—" : fmtUsd(metrics.avgLoss)
              }
              tone={metrics.lossCount > 0 ? "loss-dim" : undefined}
            />
            <MetricCard
              label="PROFIT FACTOR"
              value={
                metrics.profitFactor === Number.POSITIVE_INFINITY
                  ? "∞"
                  : metrics.profitFactor === 0
                    ? "—"
                    : metrics.profitFactor.toFixed(2)
              }
              tooltip="gross wins / |gross losses|"
            />
            <MetricCard
              label="TRADES"
              value={metrics.trades === 0 ? "—" : String(metrics.trades)}
              sub={
                metrics.trades === 0
                  ? undefined
                  : `${metrics.buyCount} buy · ${metrics.sellCount} sell`
              }
            />
          </div>

          <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-2">
            <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
              <span>EQUITY ({RANGE_LABELS[range]})</span>
              <span className="tabular-nums">
                {metrics.equityCurve.length > 0
                  ? fmtUsd(
                      metrics.equityCurve[metrics.equityCurve.length - 1]
                        .equity,
                      { sign: true },
                    )
                  : "—"}
              </span>
            </div>
            <EquityCurve curve={metrics.equityCurve} />
          </div>

          <div className="border-t border-[var(--color-phosphor-dark)]">
            <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
              BY SYMBOL ({RANGE_LABELS[range]})
            </div>
            {metrics.perSymbol.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[var(--color-phosphor-dim)]">
                no closed trades
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-phosphor-faint)]">
                <li className="grid grid-cols-[2fr_0.7fr_1fr_1.5fr] gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-[2px] text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
                  <span>SYM</span>
                  <span className="text-right">N</span>
                  <span className="text-right">WIN%</span>
                  <span className="text-right">P&amp;L</span>
                </li>
                {metrics.perSymbol.map((s) => {
                  const up = s.realizedPnl >= 0;
                  return (
                    <li
                      key={s.symbol}
                      className="grid grid-cols-[2fr_0.7fr_1fr_1.5fr] gap-2 px-3 py-[4px] text-xs tabular-nums"
                    >
                      <span className="font-medium">{s.symbol}</span>
                      <span className="text-right">{s.closedTrades}</span>
                      <span className="text-right text-[var(--color-phosphor-dim)]">
                        {fmtPct(s.winRate * 100)}
                      </span>
                      <span
                        className={
                          up
                            ? "text-right text-[var(--color-gain)]"
                            : "text-right text-[var(--color-loss)] glow-loss"
                        }
                      >
                        {fmtUsd(s.realizedPnl, { sign: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--color-phosphor-dark)]">
            <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
              BACKTESTS
            </div>
            {!backtests || backtests.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[var(--color-phosphor-dim)]">
                no backtests run yet
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-phosphor-faint)]">
                {backtests.map((bt) => (
                  <BacktestRow key={bt.id} run={bt} />
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--color-phosphor-dark)]">
            <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
              BY SESSION (ALL TIME)
            </div>
            {sessionAttribution.length === 0 ||
            (sessionAttribution.length === 1 &&
              sessionAttribution[0].isManual &&
              sessionAttribution[0].metrics.trades === 0) ? (
              <div className="px-3 py-2 text-center text-xs text-[var(--color-phosphor-dim)]">
                no sessions yet
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-phosphor-faint)]">
                {sessionAttribution.map((a) => (
                  <SessionRow key={a.bucket} attr={a} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] text-[var(--color-phosphor-dim)]">
          {isLoading
            ? "loading…"
            : `${all.length} orders · sharpe rf=0`}
        </div>
      </div>
    </Panel>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "gain-dim" | "loss-dim";
  tooltip?: string;
}) {
  const valueCls =
    tone === "gain"
      ? "text-[var(--color-gain)] glow"
      : tone === "loss"
        ? "text-[var(--color-loss)] glow-loss"
        : tone === "gain-dim"
          ? "text-[var(--color-gain)]"
          : tone === "loss-dim"
            ? "text-[var(--color-loss)]"
            : "text-[var(--color-phosphor)] glow";
  return (
    <div className="bg-[var(--color-bg)] px-2 py-1.5" title={tooltip}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
        {label}
      </div>
      <div className={`font-display text-base tabular-nums ${valueCls}`}>
        {value}
      </div>
      {sub ? (
        <div className="text-[9px] text-[var(--color-phosphor-dim)]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function EquityCurve({ curve }: { curve: EquityPoint[] }) {
  const W = 260;
  const H = 50;
  const padX = 4;
  const padY = 4;

  if (curve.length === 0) {
    return (
      <div className="flex h-[50px] items-center justify-center text-[10px] text-[var(--color-phosphor-dim)]">
        no data
      </div>
    );
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const p of curve) {
    if (p.equity < lo) lo = p.equity;
    if (p.equity > hi) hi = p.equity;
  }
  // Anchor on zero so the sign of cumulative P&L reads at a glance.
  if (lo > 0) lo = 0;
  if (hi < 0) hi = 0;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }

  const xFor = (i: number) =>
    padX + (i / Math.max(1, curve.length - 1)) * (W - padX * 2);
  const yFor = (v: number) =>
    padY + ((hi - v) / (hi - lo)) * (H - padY * 2);

  const path = curve
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.equity).toFixed(1)}`,
    )
    .join(" ");

  const finalEquity = curve[curve.length - 1].equity;
  const positive = finalEquity >= 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-1 h-[50px] w-full"
    >
      <line
        x1={padX}
        x2={W - padX}
        y1={yFor(0)}
        y2={yFor(0)}
        stroke="#1a3a1a"
        strokeDasharray="2 4"
        strokeWidth={1}
      />
      <path
        d={path}
        fill="none"
        stroke={positive ? "#00FF41" : "#FF3333"}
        strokeWidth={1.5}
      />
    </svg>
  );
}

function fmtDuration(ms: number): string {
  if (ms < 0) return "0s";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const mr = min % 60;
  return mr ? `${hr}h${mr}m` : `${hr}h`;
}

function fmtRangeShort(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    } catch {
      return iso.slice(5, 10);
    }
  };
  return `${fmt(startIso)}–${fmt(endIso)}`;
}

function BacktestRow({ run }: { run: BacktestRunSummary }) {
  const { selectedRunId, selectedRun, isLoading, toggle } =
    useBacktestSelection();
  const isSelected = selectedRunId === run.id;
  const pnl = run.realizedPnl ?? 0;
  const up = pnl >= 0;
  const isRunning = run.status === "running";
  const statusCls =
    run.status === "completed"
      ? ""
      : run.status === "running"
        ? "text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
        : "text-[var(--color-loss)]";
  return (
    <li>
      <button
        type="button"
        onClick={() => toggle(run.id)}
        className={`block w-full px-3 py-[6px] text-left ${
          isSelected
            ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
            : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_6%,transparent)]"
        }`}
      >
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className={`truncate font-medium ${statusCls}`}>
            {isSelected ? "▾ " : "▸ "}
            {run.symbol} · {run.timeframe} ·{" "}
            {fmtRangeShort(run.rangeStart, run.rangeEnd)}
          </span>
          <span
            className={`tabular-nums ${
              isRunning || run.closedCount === 0
                ? "text-[var(--color-phosphor-dim)]"
                : up
                  ? "text-[var(--color-gain)]"
                  : "text-[var(--color-loss)] glow-loss"
            }`}
          >
            {isRunning
              ? "RUNNING"
              : run.finalEquity == null
                ? "—"
                : fmtUsd(pnl, { sign: true })}
          </span>
        </div>
        <div className="flex justify-between text-[9px] text-[var(--color-phosphor-dim)]">
          <span>
            {run.barCount} bars · {run.buyCount} buy · {run.sellCount} sell
          </span>
          <span>
            {run.sharpe != null
              ? `SR ${run.sharpe.toFixed(2)} · DD ${
                  run.maxDrawdown != null ? fmtUsd(-run.maxDrawdown) : "—"
                }`
              : run.status === "aborted"
                ? "aborted"
                : ""}
          </span>
        </div>
      </button>
      {isSelected ? (
        isLoading || !selectedRun ? (
          <div className="border-t border-[var(--color-phosphor-faint)] px-3 py-2 text-[10px] text-[var(--color-phosphor-dim)] cursor-blink">
            LOADING DETAIL
          </div>
        ) : (
          <BacktestDetail run={selectedRun} />
        )
      ) : null}
    </li>
  );
}

function BacktestDetail({ run }: { run: BacktestRunDetail }) {
  const equityPoints = run.equityCurve.map((p) => ({
    ts: Date.parse(p.ts),
    equity: p.equity - run.initialCash,
  }));

  return (
    <div className="border-t border-[var(--color-phosphor-faint)] bg-[color-mix(in_srgb,var(--color-phosphor)_3%,transparent)] px-3 py-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.15em] text-[var(--color-phosphor-dim)]">
        <span>EQUITY (Δ FROM START)</span>
        <span className="tabular-nums">
          {run.finalEquity != null
            ? fmtUsd(run.finalEquity - run.initialCash, { sign: true })
            : "—"}
        </span>
      </div>
      <EquityCurve curve={equityPoints} />

      <div className="mt-2 grid grid-cols-2 gap-x-3 text-[10px] text-[var(--color-phosphor-dim)]">
        <span>Initial: {fmtUsd(run.initialCash)}</span>
        <span>
          Final: {run.finalEquity != null ? fmtUsd(run.finalEquity) : "—"}
        </span>
        <span>
          Sharpe: {run.sharpe != null ? run.sharpe.toFixed(2) : "—"}
        </span>
        <span>
          Drawdown:{" "}
          {run.maxDrawdown != null ? fmtUsd(-run.maxDrawdown) : "—"}
        </span>
        <span>
          Win rate:{" "}
          {run.winRate != null && run.closedCount > 0
            ? `${fmtPct(run.winRate * 100)} (${run.winCount}/${run.closedCount})`
            : "—"}
        </span>
        <span>
          Bars: {run.barCount}
        </span>
      </div>

      <div className="mt-2 text-[10px] uppercase tracking-[0.15em] text-[var(--color-phosphor-dim)]">
        FILLS ({run.fills.length})
      </div>
      {run.fills.length === 0 ? (
        <div className="px-2 py-1 text-[10px] text-[var(--color-phosphor-dim)]">
          no fills
        </div>
      ) : (
        <ul className="max-h-32 overflow-auto">
          <li className="grid grid-cols-[1.5fr_0.6fr_0.5fr_1fr_1fr] gap-1 border-b border-[var(--color-phosphor-faint)] py-[2px] text-[9px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
            <span>TIME</span>
            <span>SIDE</span>
            <span className="text-right">QTY</span>
            <span className="text-right">PRICE</span>
            <span className="text-right">P&amp;L</span>
          </li>
          {run.fills.map((f, i) => {
            const t = new Date(f.ts);
            const date = `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
            const sideCls =
              f.side === "buy"
                ? "text-[var(--color-gain)]"
                : "text-[var(--color-loss)] glow-loss";
            const pnlCls =
              f.pnl == null
                ? "text-[var(--color-phosphor-dim)]"
                : f.pnl >= 0
                  ? "text-[var(--color-gain)]"
                  : "text-[var(--color-loss)] glow-loss";
            return (
              <li
                key={i}
                className="grid grid-cols-[1.5fr_0.6fr_0.5fr_1fr_1fr] gap-1 py-[2px] text-[10px] tabular-nums"
              >
                <span className="text-[var(--color-phosphor-dim)]">{date}</span>
                <span className={sideCls}>{f.side.toUpperCase()}</span>
                <span className="text-right">{f.qty}</span>
                <span className="text-right">${f.price.toFixed(2)}</span>
                <span className={`text-right ${pnlCls}`}>
                  {f.pnl == null ? "—" : fmtUsd(f.pnl, { sign: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SessionRow({ attr }: { attr: SessionAttribution }) {
  const m = attr.metrics;
  const up = m.realizedPnl >= 0;
  const duration =
    attr.windowStartedAt && attr.windowEndedAt
      ? fmtDuration(attr.windowEndedAt - attr.windowStartedAt)
      : attr.isLive
        ? "LIVE"
        : "—";
  const label = attr.isManual ? "MANUAL" : attr.label;
  return (
    <li className="px-3 py-[6px]">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span
          className={`truncate font-medium ${
            attr.isLive
              ? "text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
              : ""
          }`}
        >
          {label}
        </span>
        <span
          className={`tabular-nums ${
            m.closedTrades === 0
              ? "text-[var(--color-phosphor-dim)]"
              : up
                ? "text-[var(--color-gain)]"
                : "text-[var(--color-loss)] glow-loss"
          }`}
        >
          {m.closedTrades === 0
            ? "—"
            : fmtUsd(m.realizedPnl, { sign: true })}
        </span>
      </div>
      <div className="flex justify-between text-[9px] text-[var(--color-phosphor-dim)]">
        <span>{duration}</span>
        <span>
          {m.buyCount} buy · {m.sellCount} sell
          {m.closedTrades > 0 ? ` · ${fmtPct(m.winRate * 100)} WR` : ""}
        </span>
      </div>
    </li>
  );
}
