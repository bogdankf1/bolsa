"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { placeOrder, usePortfolio, useSnapshots } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { useAudio } from "@/lib/audio";

type OrderType = "market" | "limit";
type Side = "buy" | "sell";

type Pending =
  | { kind: "trade"; side: Side }
  | { kind: "close"; side: Side; qty: number };

type Props = { symbol: string | null };

export function OrderEntry({ symbol }: Props) {
  const [qty, setQty] = useState<number>(1);
  const [type, setType] = useState<OrderType>("market");
  const [limitPx, setLimitPx] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    side: Side;
    id: string;
  } | null>(null);

  const { play } = useAudio();
  const { data: snapData } = useSnapshots(symbol ? [symbol] : []);
  const snap = symbol ? snapData?.snapshots[symbol] : undefined;
  const { data: portfolio } = usePortfolio();
  const position = symbol
    ? portfolio?.positions.find((p) => p.symbol === symbol)
    : undefined;

  // Clear stale per-symbol state when the focused ticker changes — otherwise
  // a stale limit price or "order submitted" toast persists across symbols.
  useEffect(() => {
    setLimitPx(null);
    setConfirmed(null);
    setError(null);
    setPending(null);
  }, [symbol]);

  // Auto-dismiss the success toast so it doesn't linger indefinitely.
  useEffect(() => {
    if (!confirmed) return;
    const id = setTimeout(() => setConfirmed(null), 4000);
    return () => clearTimeout(id);
  }, [confirmed]);

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
    setPending({ kind: "trade", side });
  }

  function reviewClose() {
    if (!position || !symbol) return;
    setError(null);
    setConfirmed(null);
    setPending({
      kind: "close",
      side: position.side === "long" ? "sell" : "buy",
      qty: Math.abs(position.qty),
    });
  }

  const confirm = useCallback(async () => {
    if (!pending || !symbol) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await (pending.kind === "close"
        ? placeOrder({
            symbol,
            qty: pending.qty,
            side: pending.side,
            type: "market",
          })
        : placeOrder({
            symbol,
            qty,
            side: pending.side,
            type,
            ...(type === "limit" && limitPx != null
              ? { limitPrice: limitPx }
              : {}),
          }));
      setConfirmed({ side: pending.side, id: order.id });
      setPending(null);
      play("fill");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Order failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [pending, symbol, qty, type, limitPx, play]);

  function cancel() {
    setPending(null);
    setError(null);
  }

  const onBuy = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      review("buy");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol],
  );
  const onSell = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      review("sell");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol],
  );
  const onEnter = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      void confirm();
    },
    [confirm],
  );
  const onEscape = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    cancel();
  }, []);
  const onClose = useCallback(
    (e: KeyboardEvent) => {
      if (!position) return;
      e.preventDefault();
      reviewClose();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position],
  );

  useHotkey("b", onBuy, { enabled: !pending });
  useHotkey("s", onSell, { enabled: !pending });
  useHotkey("Enter", onEnter, { enabled: !!pending });
  useHotkey("Escape", onEscape, { enabled: !!pending });
  useHotkey("x", onClose, { enabled: !pending && !!position });

  // For trade confirm: project the qty change. For close confirm: target is 0.
  const afterQty =
    position && pending
      ? pending.kind === "close"
        ? 0
        : pending.side === "buy"
          ? position.qty + qty
          : position.qty - qty
      : qty;

  const confirmTitle =
    pending?.kind === "close" ? "Flatten Position" : "Confirm Order";

  // For the confirm screen, normalize qty/type/price across both kinds.
  const confirmQty = pending?.kind === "close" ? pending.qty : qty;
  const confirmType: OrderType = pending?.kind === "close" ? "market" : type;
  const confirmEstimate =
    pending?.kind === "close"
      ? (snap?.lastPrice ?? snap?.askPrice ?? 0) * pending.qty
      : estimate;

  return (
    <Panel
      title="Order Entry"
      rightSlot={
        position ? (
          <span className="text-[10px]">
            POS{" "}
            <span className="glow">{position.qty}</span>{" "}
            <span className="text-[var(--color-phosphor-dim)]">
              @ {fmtPrice(position.avgEntryPrice)}
            </span>
          </span>
        ) : (
          (symbol ?? "—")
        )
      }
    >
      {pending ? (
        <div className="p-3 text-sm">
          <div
            className={`mb-2 uppercase tracking-[0.15em] text-[11px] ${
              pending.kind === "close"
                ? "text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
                : "text-[var(--color-phosphor-dim)]"
            }`}
          >
            {confirmTitle}
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
            <span className="glow">{confirmQty}</span>
            {position && (
              <>
                <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">
                  POSITION
                </span>
                <span className="glow">
                  {position.qty} → {afterQty}
                </span>
              </>
            )}
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">TYPE</span>
            <span className="glow">
              {confirmType.toUpperCase()}
              <span className="ml-2 text-[10px] text-[var(--color-phosphor-dim)]">
                {confirmType === "limit" ? "TIF: GTC" : "TIF: DAY"}
              </span>
            </span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">PRICE</span>
            <span className="glow">
              {confirmType === "market" ? "MKT" : fmtPrice(limitPx ?? 0)}
            </span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">EST. TOTAL</span>
            <span className="glow-strong">{fmtUsd(confirmEstimate)}</span>
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
              className={`flex-1 border py-2 font-semibold tracking-[0.2em] disabled:opacity-50 ${
                pending.kind === "close"
                  ? "border-[var(--color-amber)] bg-[color-mix(in_srgb,var(--color-amber)_18%,transparent)] text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)] hover:bg-[color-mix(in_srgb,var(--color-amber)_28%,transparent)]"
                  : "border-[var(--color-phosphor)] bg-[color-mix(in_srgb,var(--color-phosphor)_18%,transparent)] glow hover:bg-[color-mix(in_srgb,var(--color-phosphor)_28%,transparent)]"
              }`}
            >
              {submitting
                ? "SUBMITTING…"
                : pending.kind === "close"
                  ? "[ENTER] FLATTEN"
                  : "[ENTER] CONFIRM"}
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
          className="grid grid-cols-[auto_1fr_auto_1fr_auto_1fr] items-center gap-x-2 gap-y-1 p-2 text-sm"
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

          <div className="col-span-6 flex items-center justify-between text-[11px]">
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">
              EST. TOTAL{" "}
              {type === "limit" && (
                <span className="ml-1 text-[10px]">TIF: GTC</span>
              )}
            </span>
            <span className="font-display text-base glow">
              {snap ? fmtUsd(estimate) : "—"}
            </span>
          </div>

          {confirmed && (
            <div className="col-span-6 border border-[var(--color-phosphor)] px-2 py-[2px] text-[11px] glow">
              ✓ {confirmed.side.toUpperCase()} order submitted ({confirmed.id.slice(0, 8)}…)
            </div>
          )}
          {error && !pending && (
            <div className="col-span-6 border border-[var(--color-loss)] px-2 py-[2px] text-[11px] text-[var(--color-loss)] glow-loss">
              ERROR: {error}
            </div>
          )}

          <div className="col-span-6 mt-1 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => review("buy")}
              disabled={!symbol}
              className="border border-[var(--color-phosphor)] bg-[color-mix(in_srgb,var(--color-phosphor)_10%,transparent)] py-1.5 font-semibold tracking-[0.2em] glow hover:bg-[color-mix(in_srgb,var(--color-phosphor)_22%,transparent)] disabled:opacity-30"
            >
              [B] BUY
            </button>
            <button
              type="button"
              onClick={() => review("sell")}
              disabled={!symbol}
              className="border border-[var(--color-loss)] bg-[color-mix(in_srgb,var(--color-loss)_10%,transparent)] py-1.5 font-semibold tracking-[0.2em] text-[var(--color-loss)] glow-loss hover:bg-[color-mix(in_srgb,var(--color-loss)_22%,transparent)] disabled:opacity-30"
            >
              [S] SELL
            </button>
            <button
              type="button"
              onClick={() => reviewClose()}
              disabled={!position || submitting}
              title={position ? "close entire position at market" : "no position to close"}
              className="border border-[var(--color-amber)] py-1.5 tracking-[0.2em] text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)] hover:bg-[color-mix(in_srgb,var(--color-amber)_15%,transparent)] disabled:opacity-30 disabled:[text-shadow:none]"
            >
              [X] CLOSE
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
