// In-memory watchlist store. Process-scoped — fine for V1 single-user.
// Will be replaced with Supabase persistence in a later step.

const DEFAULT_SYMBOLS = ["AAPL", "VOO", "QQQ", "SPY", "TSLA"];

let symbols: string[] = [...DEFAULT_SYMBOLS];

export function listWatchlist(): string[] {
  return [...symbols];
}

export function addToWatchlist(symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!s) return symbols;
  if (!symbols.includes(s)) symbols = [...symbols, s];
  return [...symbols];
}

export function removeFromWatchlist(symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  symbols = symbols.filter((x) => x !== s);
  return [...symbols];
}

export function resetWatchlist(): string[] {
  symbols = [...DEFAULT_SYMBOLS];
  return [...symbols];
}
