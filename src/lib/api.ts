// Standard API response envelope + error handler for route handlers.

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AlpacaError } from "@/core/alpaca/errors";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function err(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): NextResponse<ApiErr> {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

/** Wrap a handler with uniform error → JSON conversion. */
export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ZodError) {
        return err("validation_error", "Invalid input", 400, e.issues);
      }
      if (e instanceof AlpacaError) {
        const status = e.status >= 400 && e.status < 600 ? e.status : 502;
        return err(e.code, e.message, status, e.details);
      }
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("API error:", e);
      return err("internal_error", message, 500);
    }
  };
}
