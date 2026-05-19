import { NextRequest } from "next/server";
import { alpacaStream } from "@/lib/server";
import type { StreamEvent } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SSE endpoint: GET /api/stream/quotes?symbols=AAPL,VOO
// Emits SSE events `quote`, `trade`, `status`, `error` plus comment heartbeats.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols");
  const symbols = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return new Response("missing symbols", { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller closed; ignore
        }
      };

      send("ready", { symbols });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          // ignore
        }
      }, 15_000);

      const onEvent = (e: StreamEvent) => {
        send(e.type, e.data);
      };

      try {
        unsubscribe = await alpacaStream.subscribe(symbols, onEvent);
      } catch (e) {
        const message = e instanceof Error ? e.message : "stream error";
        send("error", { message });
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // ignore
        }
        return;
      }

      req.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
