// SWR fetcher that unwraps the { ok, data } envelope and throws typed errors.

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(opts: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body || typeof body !== "object" || !("ok" in body)) {
    throw new ApiError({
      code: "network_error",
      message: `Request failed: ${res.status}`,
      status: res.status,
      details: body,
    });
  }

  const env = body as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } };

  if (!env.ok) {
    throw new ApiError({
      code: env.error.code,
      message: env.error.message,
      status: res.status,
      details: env.error.details,
    });
  }

  return env.data;
}

export async function postJson<T, B = unknown>(
  url: string,
  body: B,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let env: unknown;
  try {
    env = await res.json();
  } catch {
    env = null;
  }
  if (!res.ok || !env || typeof env !== "object" || !("ok" in env)) {
    throw new ApiError({
      code: "network_error",
      message: `Request failed: ${res.status}`,
      status: res.status,
      details: env,
    });
  }
  const e = env as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } };
  if (!e.ok) {
    throw new ApiError({
      code: e.error.code,
      message: e.error.message,
      status: res.status,
      details: e.error.details,
    });
  }
  return e.data;
}
