// Singleton-friendly Alpaca market-data WebSocket client.
// Wraps multiple app-level subscribers into a single upstream WS connection
// (Alpaca free tier allows only one concurrent WS per account).

import type { StreamEvent } from "../types";

export interface AlpacaStreamConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

interface ListenerEntry {
  symbols: Set<string>;
  handler: (event: StreamEvent) => void;
}

export class AlpacaStream {
  private ws: WebSocket | null = null;
  private listeners = new Set<ListenerEntry>();
  /** Ref-count per symbol — drives subscribe / unsubscribe upstream. */
  private refCount = new Map<string, number>();
  /** Symbols currently subscribed at Alpaca. */
  private subscribed = new Set<string>();
  private authenticated = false;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private config: AlpacaStreamConfig) {}

  /** Subscribe to live ticks for the given symbols. Returns an unsubscribe fn. */
  async subscribe(
    symbols: string[],
    handler: (event: StreamEvent) => void,
  ): Promise<() => void> {
    const normalized = new Set(
      symbols.map((s) => s.toUpperCase()).filter(Boolean),
    );
    const entry: ListenerEntry = { symbols: normalized, handler };
    this.listeners.add(entry);

    const toAdd: string[] = [];
    for (const sym of normalized) {
      const prev = this.refCount.get(sym) ?? 0;
      this.refCount.set(sym, prev + 1);
      if (prev === 0 && !this.subscribed.has(sym)) toAdd.push(sym);
    }

    try {
      await this.ensureConnected();
      if (toAdd.length > 0) this.sendSubscribe(toAdd);
      handler({
        type: "status",
        data: { connected: true, subscribed: Array.from(normalized) },
      });
    } catch (e) {
      // Roll back ref counts on failure
      for (const sym of normalized) {
        const prev = this.refCount.get(sym) ?? 0;
        if (prev <= 1) this.refCount.delete(sym);
        else this.refCount.set(sym, prev - 1);
      }
      this.listeners.delete(entry);
      throw e;
    }

    return () => this.unsubscribeEntry(entry);
  }

  private unsubscribeEntry(entry: ListenerEntry) {
    if (!this.listeners.has(entry)) return;
    this.listeners.delete(entry);

    const toRemove: string[] = [];
    for (const sym of entry.symbols) {
      const prev = this.refCount.get(sym) ?? 0;
      if (prev <= 1) {
        this.refCount.delete(sym);
        if (this.subscribed.has(sym)) {
          this.subscribed.delete(sym);
          toRemove.push(sym);
        }
      } else {
        this.refCount.set(sym, prev - 1);
      }
    }

    if (toRemove.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: "unsubscribe",
          quotes: toRemove,
          trades: toRemove,
        }),
      );
    }

    // Close upstream when there are no more app-level subscribers
    if (this.listeners.size === 0) this.close();
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        if (err) reject(err);
        else resolve();
      };

      const ws = new WebSocket(this.config.url);
      this.ws = ws;
      this.authenticated = false;

      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            action: "auth",
            key: this.config.apiKey,
            secret: this.config.apiSecret,
          }),
        );
      });

      ws.addEventListener("message", (ev) => {
        let messages: unknown;
        try {
          messages = JSON.parse(
            typeof ev.data === "string" ? ev.data : ev.data.toString(),
          );
        } catch {
          return;
        }
        if (!Array.isArray(messages)) return;
        for (const m of messages) this.handleMessage(m, finish);
      });

      ws.addEventListener("error", (ev) => {
        console.error("Alpaca WS error:", ev);
        if (!settled) finish(new Error("WebSocket error"));
      });

      ws.addEventListener("close", () => {
        this.ws = null;
        this.authenticated = false;
        this.subscribed.clear();
        if (this.listeners.size > 0) this.scheduleReconnect();
      });
    });

    return this.connecting;
  }

  private handleMessage(m: unknown, finish: (err?: Error) => void) {
    if (typeof m !== "object" || m === null || !("T" in m)) return;
    const msg = m as Record<string, unknown>;
    const T = msg.T;

    if (T === "success" && msg.msg === "authenticated") {
      this.authenticated = true;
      finish();
      // Re-subscribe to all currently-needed symbols on (re)connect
      const all = Array.from(this.refCount.keys());
      if (all.length > 0) this.sendSubscribe(all);
      return;
    }

    if (T === "error") {
      console.error("Alpaca WS error msg:", msg);
      finish(new Error(String(msg.msg ?? "alpaca stream error")));
      return;
    }

    if (T === "q") {
      const tick = {
        symbol: String(msg.S),
        bidPrice: Number(msg.bp),
        askPrice: Number(msg.ap),
        timestamp: String(msg.t),
      };
      this.broadcast(tick.symbol, { type: "quote", data: tick });
      return;
    }

    if (T === "t") {
      const tick = {
        symbol: String(msg.S),
        price: Number(msg.p),
        size: Number(msg.s),
        timestamp: String(msg.t),
      };
      this.broadcast(tick.symbol, { type: "trade", data: tick });
      return;
    }

    if (T === "subscription") {
      const quotes = Array.isArray(msg.quotes) ? (msg.quotes as string[]) : [];
      const trades = Array.isArray(msg.trades) ? (msg.trades as string[]) : [];
      for (const s of quotes) this.subscribed.add(s);
      for (const s of trades) this.subscribed.add(s);
    }
  }

  private sendSubscribe(symbols: string[]) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        action: "subscribe",
        quotes: symbols,
        trades: symbols,
      }),
    );
  }

  private broadcast(symbol: string, event: StreamEvent) {
    for (const l of this.listeners) {
      if (!l.symbols.has(symbol)) continue;
      try {
        l.handler(event);
      } catch (e) {
        console.error("stream listener error", e);
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size === 0) return;
      this.ensureConnected().catch((e) =>
        console.error("Alpaca WS reconnect failed:", e),
      );
    }, 2_000);
  }

  private close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.authenticated = false;
    this.subscribed.clear();
  }
}
