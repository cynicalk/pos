"use client";

import type { AnalyticsEvent } from "./analytics";

/**
 * CookLyt backend sink — forwards analytics events to the operator backend's
 * Phase 0 recsys log (`POST /api/guest/events`), so the operator's
 * Recommendation Performance page can measure the funnel the guest app drives.
 *
 * This is telemetry plumbing only — it changes nothing a guest sees. Events are
 * already buffered synchronously in track(); this sink batches them and posts
 * best-effort:
 *   - a short debounce coalesces a burst of events into one request,
 *   - pagehide/visibilitychange flush via sendBeacon so a closing tab isn't lost,
 *   - a failed post re-queues; the backend keys on (session, seq) so a retry
 *     inserts each event exactly once. Nothing here may throw into the flow.
 *
 * Enabled whenever NEXT_PUBLIC_COOKLYT_API is configured (it always is in a
 * real deployment); with no backend it simply never attaches.
 */

const FLUSH_DEBOUNCE_MS = 2000;
const MAX_BATCH = 50;
// Telemetry is best-effort: if the backend is down for a long time, drop the
// oldest events rather than growing the in-memory queue without bound. The
// synchronous localStorage buffer (capped at 500 in analytics.ts) is the record
// of record for QA; this queue only exists to batch network sends.
const MAX_QUEUE = 500;

function endpoint(): string | null {
  const base = process.env.NEXT_PUBLIC_COOKLYT_API;
  if (!base) return null;
  const outlet = process.env.NEXT_PUBLIC_COOKLYT_OUTLET ?? "";
  const q = outlet ? `?outlet=${encodeURIComponent(outlet)}` : "";
  return `${base.replace(/\/$/, "")}/api/guest/events${q}`;
}

export function createCooklytSink(): ((event: AnalyticsEvent) => void) | null {
  if (typeof window === "undefined") return null;
  const url = endpoint();
  if (!url) return null;

  let queue: AnalyticsEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const post = async (batch: AnalyticsEvent[], useBeacon: boolean) => {
    if (batch.length === 0) return;
    const body = JSON.stringify({ events: batch });
    try {
      // On unload, sendBeacon is the only transport that reliably survives.
      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const ok = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        if (!ok) queue.unshift(...batch); // put them back for the next flush
        return;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
      if (!res.ok) queue.unshift(...batch);
    } catch {
      // Network down / backend absent — re-queue; the (session, seq) key makes
      // the eventual re-send idempotent, so duplicates never double-count.
      queue.unshift(...batch);
      if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    }
  };

  const flush = (useBeacon = false) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length === 0) return;
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    void post(batch, useBeacon);
    // A burst can leave a tail past MAX_BATCH; re-arm so it drains on its own
    // instead of waiting for the next event or an unload beacon.
    if (queue.length > 0 && !timer && !useBeacon) {
      timer = setTimeout(() => flush(), FLUSH_DEBOUNCE_MS);
    }
  };

  if (typeof document !== "undefined") {
    // A tab going away is the moment most likely to lose the tail of a funnel.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
    window.addEventListener("pagehide", () => flush(true));
  }

  return (event) => {
    queue.push(event);
    // Bound the queue: on a persistently unreachable backend, keep the newest.
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
    if (queue.length >= MAX_BATCH) {
      flush();
      return;
    }
    if (!timer) timer = setTimeout(() => flush(), FLUSH_DEBOUNCE_MS);
  };
}
