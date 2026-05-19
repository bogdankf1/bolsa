export class AlpacaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(opts: {
    message: string;
    code: string;
    status: number;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "AlpacaError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

// Map common Alpaca-side error shapes to a stable internal code.
export function mapAlpacaError(
  status: number,
  body: unknown,
  fallback = "alpaca_error",
): AlpacaError {
  const message =
    (body && typeof body === "object" && "message" in body
      ? String((body as { message: unknown }).message)
      : undefined) ?? `Alpaca request failed (HTTP ${status})`;

  let code = fallback;
  if (status === 401 || status === 403) code = "unauthorized";
  else if (status === 404) code = "not_found";
  else if (status === 422) code = "validation_error";
  else if (status === 429) code = "rate_limited";
  else if (status >= 500) code = "upstream_error";

  return new AlpacaError({ message, code, status, details: body });
}
