// Server-only singleton wiring: reads env once, exposes a configured Alpaca client.
// Do NOT import this from client components.

import "server-only";
import { createAlpacaClient } from "@/core/alpaca/client";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const alpaca = createAlpacaClient({
  apiKey: required("ALPACA_API_KEY"),
  apiSecret: required("ALPACA_API_SECRET"),
  baseUrl: required("ALPACA_BASE_URL"),
  dataUrl: required("ALPACA_DATA_URL"),
  feed: "iex",
});

export const ALPACA_STREAM_URL = required("ALPACA_STREAM_URL");
export const ALPACA_API_KEY = required("ALPACA_API_KEY");
export const ALPACA_API_SECRET = required("ALPACA_API_SECRET");
