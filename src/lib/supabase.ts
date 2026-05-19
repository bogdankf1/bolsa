// Server-only Supabase client. Lazy-initialized so importing this module
// doesn't crash when env vars are missing.
//
// V1 uses the publishable (anon) key with permissive RLS policies on the
// watchlists table — functionally equivalent to no RLS for single-user.
// The deployment is login-protected on Vercel, so the anon role is only
// reachable by the authenticated dashboard user.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `See .env.example or pull from Vercel: \`vercel env pull .env.local\`.`,
    );
  }
  return v;
}

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
  return client;
}
