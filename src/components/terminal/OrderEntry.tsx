"use client";

import { useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtUsd } from "@/lib/format";
import type { Symbol } from "@/lib/mock";

type OrderType = "MARKET" | "LIMIT";
type Side = "BUY" | "SELL";

type Props = { symbol: Symbol };

export function OrderEntry({ symbol }: Props) {
  const [qty, setQty] = useState<number>(10);
  const [type, setType] = useState<OrderType>("MARKET");
  const [limitPx, setLimitPx] = useState<number>(symbol.price);
  const [pending, setPending] = useState<{ side: Side } | null>(null);

  const px = type === "MARKET" ? symbol.ask : limitPx;
  const estimate = px * qty;

  function submit(side: Side) {
    setPending({ side });
  }
  function confirm() {
    if (!pending) return;
    console.log("submit order", { side: pending.side, ticker: symbol.ticker, qty, type, px });
    setPending(null);
  }
  function cancel() {
    setPending(null);
  }

  return (
    <Panel title="Order Entry" rightSlot={symbol.ticker}>
      {pending ? (
        <div className="p-3 text-sm">
          <div className="mb-2 text-[var(--color-phosphor-dim)] uppercase tracking-[0.15em] text-[11px]">
            Confirm Order
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-display text-base">
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">SIDE</span>
            <span className={pending.side === "BUY" ? "glow" : "glow-loss text-[var(--color-loss)]"}>
              {pending.side}
            </span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">SYMBOL</span>
            <span className="glow">{symbol.ticker}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">QTY</span>
            <span className="glow">{qty}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">TYPE</span>
            <span className="glow">{type}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">PRICE</span>
            <span className="glow">{type === "MARKET" ? "MKT" : fmtPrice(limitPx)}</span>
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">EST. TOTAL</span>
            <span className="glow-strong">{fmtUsd(estimate)}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={confirm}
              className="flex-1 border border-[var(--color-phosphor)] bg-[color-mix(in_srgb,var(--color-phosphor)_18%,transparent)] py-2 font-semibold tracking-[0.2em] glow hover:bg-[color-mix(in_srgb,var(--color-phosphor)_28%,transparent)]"
            >
              [ENTER] CONFIRM
            </button>
            <button
              onClick={cancel}
              className="flex-1 border border-[var(--color-phosphor-dark)] py-2 tracking-[0.2em] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)]"
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
            value={symbol.ticker}
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
            <option value="MARKET">MARKET</option>
            <option value="LIMIT">LIMIT</option>
          </select>

          {type === "LIMIT" ? (
            <>
              <label className="text-[var(--color-phosphor-dim)] [text-shadow:none]">PRICE</label>
              <input
                type="number"
                step={0.01}
                value={limitPx}
                onChange={(e) => setLimitPx(Number(e.target.value) || 0)}
                className="crt-input col-span-5 tabular-nums"
              />
            </>
          ) : null}

          <div className="col-span-6 mt-1 flex items-center justify-between text-xs">
            <span className="text-[var(--color-phosphor-dim)] [text-shadow:none]">
              EST. TOTAL
            </span>
            <span className="font-display text-base glow">{fmtUsd(estimate)}</span>
          </div>

          <div className="col-span-6 mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => submit("BUY")}
              className="border border-[var(--color-phosphor)] bg-[color-mix(in_srgb,var(--color-phosphor)_10%,transparent)] py-2 font-semibold tracking-[0.2em] glow hover:bg-[color-mix(in_srgb,var(--color-phosphor)_22%,transparent)]"
            >
              [B] BUY
            </button>
            <button
              type="button"
              onClick={() => submit("SELL")}
              className="border border-[var(--color-loss)] bg-[color-mix(in_srgb,var(--color-loss)_10%,transparent)] py-2 font-semibold tracking-[0.2em] text-[var(--color-loss)] glow-loss hover:bg-[color-mix(in_srgb,var(--color-loss)_22%,transparent)]"
            >
              [S] SELL
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
