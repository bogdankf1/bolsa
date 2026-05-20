"use client";

// Browser-side Supabase client for realtime subscriptions on
// `agent_events` and `agent_state`. Separate from `src/lib/supabase.ts`
// which is `server-only` — that one runs in API routes / MCP tools,
// this one runs in React components.
//
// Both use the same publishable anon key. With V1 permissive RLS the
// browser gets full read access to the agent tables; tightening to
// per-user policies arrives with V3 auth.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Run `vercel env pull .env.local` and restart the dev server.",
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
