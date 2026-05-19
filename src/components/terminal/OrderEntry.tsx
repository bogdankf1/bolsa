"use client";

import { useEffect, useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { placeOrder, useSnapshots } from "@/lib/hooks";

type OrderType = "market" | "limit";
type Side = "buy" | "sell";

type Props = { symbol: string | null };

export function OrderEntry({ symbol }: Props) {
  const [qty, setQty] = useState<number>(1);
  const [type, setType] = useState<OrderType>("market");
  const [limitPx, setLimitPx] = useState<number | null>(null);
  const [pending, setPending] = useState<{ side: Side } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    side: Side;
    id: string;
  } | null>(null);

  const { data: snapData } = useSnapshots(symbol ? [symbol] : []);
  const snap = symbol ? snapData?.snapshots[symbol] : undefined;

  // Default limit price to current ask when snapshot first arrives
  useEffect(() => {
    if (type === "limit" && limitPx == null && snap) {
      setLimitPx(snap.askPrice || snap.lastPrice || 0);
    }
  }, [type, limitPx, snap]);

  const refPx =
    type === "market"
      ? (snap?.lastPrice ?? snap?.askPrice ?? 0)
      : (limitPx ?? 0);
  const estimate = refPx * qty;

  function review(side: Side) {
    if (!symbol) return;
    setError(null);
    setConfirmed(null);
    setPending({ side });
  }

  async function confirm() {
    if (!pending || !symbol) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await placeOrder({
        symbol,
        qty,
        side: pending.side,
        type,
        ...(type === "limit" && limitPx != null
          ? { limitPrice: limitPx }
          : {}),
      });
      setConfirmed({ side: pending.side, id: order.id });
      setPending(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Order failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setPending(null);
    setError(null);
  }

  // Keyboard hotkeys: b / s to BUY / SELL (when not in input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (pending) {
        if (e.key === "Enter") {
          e.preventDefault();
          void confirm();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        return;
      }
      if (e.key === "b") {
        e.preventDefault();
        review("buy");
      } else if (e.key === "s") {
        e.preventDefault();
        review("sell");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, symbol, qty, type, limitPx]);

  return (
    <Panel title="Order Entry" rightSlot={symbol ?? "—"}>
      {pending ? (
        <div className="p-3 text-sm">
          <div className="mb-2 text-[var(--color-phosphor-dim)] uppercase tracking-[0.15em] text-[11px]">
            Confirm Order
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-display text-base">
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">SIDE</span>
            <span
              className={
                pending.side === "buy"
                  ? "glow"
                  : "glow-loss text-[var(--color-loss)]"
              }
            >
              {pending.side.toUpperCase()}
            </span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">SYMBOL</span>
            <span className="glow">{symbol}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">QTY</span>
            <span className="glow">{qty}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">TYPE</span>
            <span className="glow">{type.toUpperCase()}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">PRICE</span>
            <span className="glow">
              {type === "market" ? "MKT" : fmtPrice(limitPx ?? 0)}
            </span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">EST. TOTAL</span>
            <span className="glow-strong">{fmtUsd(estimate)}</span>
          </div>
          {error && (
            <div className="mt-3 border border-[var(--color-loss)] px-2 py-1 text-xs text-[var(--color-loss)] glow-loss">
              ERROR: {error}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={confirm}
              disabled={submitting}
              className="flex-1 border border-[var(--color-phosphor)] bg-[color-mix(in_srgb,var(--color-phosphor)_18%,transparent)] py-2 font-semibold tracking-[0.2em] glow hover:bg-[color-mix(in_srgb,var(--color-phosphor)_28%,transparent)] disabled:opacity-50"
            >
              {submitting ? "SUBMITTING…" : "[ENTER] CONFIRM"}
            </button>
            <button
              onClick={cancel}
              disabled={submitting}
              className="flex-1 border border-[var(--color-phosphor-dark)] py-2 tracking-[0.2em] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)] disabled:opacity-50"
            >
              [ESC] CANCEL
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => e.preventDefault()}
          className="grid grid-cols-[auto_1fr_auto_1fr_auto_1fr] items-center gap-x-2 gap-y-2 p-3 text-sm"
        >
          <label className="text-[var(--color-phosphor-dim)] [text-shadow:none]">SYM</label>
          <input
            readOnly
            value={symbol ?? ""}
            placeholder="—"
            className="crt-input uppercase"
          />
          <label className="text-[var(--color-phosphor-dim)] [text-shadow:none]">QTY</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 0))}
            className="crt-input tabular-nums"
          />
          <label className="text-[var(--color-phosphor-dim)] [text-shadow:none]">TYPE</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OrderType)}
            className="crt-input bg-[var(--color-bg)]"
          >
            <option value="market">MARKET</option>
            <option value="limit">LIMIT</option>
          </select>

          {type === "limit" ? (
            <>
              <label className="text-[var(--color-phosphor-dim)] [text-shadow:none]">PRICE</label>
              <input
                type="number"
                step={0.01}
                value={limitPx ?? ""}
                onChange={(e) =>
                  setLimitPx(e.target.value === "" ? null : Number(e.target.value))
                }
                className="crt-input col-span-5 tabular-nums"
              />
            </>
          ) : null}

          <div className="col-span-6 mt-1 flex items-center justify-between text-xs">
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">
              EST. TOTAL
            </span>
            <span className="font-display text-base glow">
              {snap ? fmtUsd(estimate) : "—"}
            </span>
          </div>

          {confirmed && (
            <div className="col-span-6 mt-1 border border-[var(--color-phosphor)] px-2 py-1 text-xs glow">
              ✓ {confirmed.side.toUpperCase()} order submitted ({confirmed.id.slice(0, 8)}…)
            </div>
          )}
          {error && !pending && (
            <div className="col-span-6 mt-1 border border-[var(--color-loss)] px-2 py-1 text-xs text-[var(--color-loss)] glow-loss">
              ERROR: {error}
            </div>
          )}

          <div className="col-span-6 mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => review("buy")}
              disabled={!symbol}
              className="border border-[var(--color-phosphor)] bg-[color-mix(in_srgb,var(--color-phosphor)_10%,transparent)] py-2 font-semibold tracking-[0.2em] glow hover:bg-[color-mix(in_srgb,var(--color-phosphor)_22%,transparent)] disabled:opacity-30"
            >
              [B] BUY
            </button>
            <button
              type="button"
              onClick={() => review("sell")}
              disabled={!symbol}
              className="border border-[var(--color-loss)] bg-[color-mix(in_srgb,var(--color-loss)_10%,transparent)] py-2 font-semibold tracking-[0.2em] text-[var(--color-loss)] glow-loss hover:bg-[color-mix(in_srgb,var(--color-loss)_22%,transparent)] disabled:opacity-30"
            >
              [S] SELL
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
