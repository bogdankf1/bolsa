// Supabase-backed watchlist. Single-user V1 — symbols persist across
// Vercel function recycles. Seeds the default 5 on first read.

import { supabase } from "@/lib/supabase";

const DEFAULT_SYMBOLS = ["AAPL", "VOO", "QQQ", "SPY", "TSLA"];

export async function listWatchlist(): Promise<string[]> {
  const { data, error } = await supabase()
    .from("watchlists")
    .select("symbol")
    .order("created_at", { ascending: true });
  if (error) throw error;

  if (data.length === 0) {
    const { error: insertError } = await supabase()
      .from("watchlists")
      .insert(DEFAULT_SYMBOLS.map((symbol) => ({ symbol })));
    if (insertError) throw insertError;
    return [...DEFAULT_SYMBOLS];
  }

  return data.map((r) => r.symbol as string);
}

export async function addToWatchlist(symbol: string): Promise<string[]> {
  const s = symbol.trim().toUpperCase();
  if (!s) return listWatchlist();
  const { error } = await supabase()
    .from("watchlists")
    .upsert({ symbol: s }, { onConflict: "symbol" });
  if (error) throw error;
  return listWatchlist();
}

export async function removeFromWatchlist(symbol: string): Promise<string[]> {
  const s = symbol.trim().toUpperCase();
  const { error } = await supabase().from("watchlists").delete().eq("symbol", s);
  if (error) throw error;
  return listWatchlist();
}

export async function resetWatchlist(): Promise<string[]> {
  const { error: delError } = await supabase()
    .from("watchlists")
    .delete()
    .neq("symbol", "");
  if (delError) throw delError;
  return listWatchlist();
}
