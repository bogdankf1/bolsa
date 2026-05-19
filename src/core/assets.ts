// Asset cache + symbol search. Lazy-loads the full Alpaca asset list
// (~10K active US equities) on first call and refreshes every 24h.
// Searching is in-memory: symbol prefix > symbol substring > name substring.

import { alpaca } from "@/lib/server";
import type { Asset } from "./types";

const TTL_MS = 24 * 60 * 60 * 1000;

let cache: Asset[] | null = null;
let cachedAt = 0;
let loading: Promise<Asset[]> | null = null;

async function loadAssets(): Promise<Asset[]> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  if (loading) return loading;

  loading = (async () => {
    const raw = await alpaca.assets({ status: "active", assetClass: "us_equity" });
    const mapped: Asset[] = raw
      .filter((a) => a.tradable)
      .map((a) => ({
        symbol: a.symbol,
        name: a.name,
        exchange: a.exchange,
        tradable: a.tradable,
      }));
    cache = mapped;
    cachedAt = Date.now();
    return mapped;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function searchAssets(query: string, limit = 8): Promise<Asset[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const assets = await loadAssets();

  const symbolPrefix: Asset[] = [];
  const symbolSubstr: Asset[] = [];
  const nameSubstr: Asset[] = [];

  for (const a of assets) {
    if (a.symbol.startsWith(q)) {
      symbolPrefix.push(a);
    } else if (a.symbol.includes(q)) {
      symbolSubstr.push(a);
    } else if (a.name.toUpperCase().includes(q)) {
      nameSubstr.push(a);
    }
  }

  return [...symbolPrefix, ...symbolSubstr, ...nameSubstr].slice(0, limit);
}
