// Server-only singletons: reads env once, exposes configured clients.
// Do NOT import this from client components.

import "server-only";
import { createAlpacaClient } from "@/core/alpaca/client";
import { AlpacaStream } from "@/core/alpaca/stream";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const apiKey = required("ALPACA_API_KEY");
const apiSecret = required("ALPACA_API_SECRET");

export const alpaca = createAlpacaClient({
  apiKey,
  apiSecret,
  baseUrl: required("ALPACA_BASE_URL"),
  dataUrl: required("ALPACA_DATA_URL"),
  feed: "iex",
});

// Reused across SSE connections so we only hold one Alpaca WS slot
// (free tier limits us to 1 concurrent stream).
declare global {
  // eslint-disable-next-line no-var
  var __bolsaAlpacaStream: AlpacaStream | undefined;
}

export const alpacaStream: AlpacaStream =
  globalThis.__bolsaAlpacaStream ??
  (globalThis.__bolsaAlpacaStream = new AlpacaStream({
    url: required("ALPACA_STREAM_URL"),
    apiKey,
    apiSecret,
  }));
