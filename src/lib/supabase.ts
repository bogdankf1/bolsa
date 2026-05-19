// Server-only Supabase client. Lazy-initialized so importing this module
// doesn't crash when env vars are missing (e.g. early dev before the
// Vercel Marketplace integration is installed). The first call to
// supabase() will throw with a clear message if env is unset.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `Install Supabase via the Vercel Marketplace and run \`vercel env pull .env.local\`.`,
    );
  }
  return v;
}

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  return client;
}
