// Provider-agnostic error capture for the guest app, isomorphic (server render,
// route handlers, and the browser). Dependency-free: always logs one line of
// structured JSON so an error is visible in server logs / the browser console,
// and forwards to a webhook when configured. Never throws into the flow —
// reporting is best-effort, matching lib/analytics.ts.
//
// Server webhook: ERROR_WEBHOOK_URL. Browser webhook: NEXT_PUBLIC_ERROR_WEBHOOK_URL
// (only the NEXT_PUBLIC_ one is readable client-side).

export interface ErrorContext {
  source?: string;
  [key: string]: unknown;
}

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "NonError", message: typeof error === "string" ? error : JSON.stringify(error) };
}

export function captureError(error: unknown, context: ErrorContext = {}): void {
  const isBrowser = typeof window !== "undefined";
  const payload = {
    level: "error" as const,
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "development",
    app: "cooklyt-guest",
    side: isBrowser ? "client" : "server",
    error: serializeError(error),
    ...context,
  };

  try {
    console.error(`[capture] ${JSON.stringify(payload)}`);
  } catch {
    console.error("[capture] failed to serialize error payload");
  }

  const url = isBrowser
    ? process.env.NEXT_PUBLIC_ERROR_WEBHOOK_URL
    : process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: isBrowser, // let it flush even as the page unloads
  }).catch(() => {});
}
