"use client";

import type { AnalyticsEvent } from "./analytics";

/**
 * PostHog sink — full posthog-js (autocapture, session replay, batching +
 * retries). Enabled only when NEXT_PUBLIC_POSTHOG_KEY is set.
 *
 * posthog-js is loaded via dynamic import so it lands in its own async chunk:
 * the default (no-key) build never ships it. posthog-js owns transport
 * (batching/retries/keepalive) and a *persistent* anonymous `distinct_id`
 * across sessions — a strict upgrade over our per-session id for churn (Q3).
 * Our `sessionId` still rides along as `cooklyt_session` for correlation.
 *
 * Session replay must also be enabled in the PostHog project settings; the
 * client config here opts in on our side.
 */

type PostHog = typeof import("posthog-js").default;

let phPromise: Promise<PostHog> | null = null;

export function createPostHogSink(): ((event: AnalyticsEvent) => void) | null {
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  const host = (
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
  ).replace(/\/$/, "");

  // Load posthog-js only when configured, then init once.
  if (!phPromise) {
    phPromise = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: false,
        persistence: "localStorage+cookie",
      });
      return posthog;
    });
  }

  return (event) => {
    // Events queue behind the load; each also lands in the local buffer
    // synchronously in track(), so nothing is lost during the async init.
    phPromise
      ?.then((posthog) => {
        try {
          posthog.capture(event.event, {
            ...event.props,
            seq: event.seq,
            cooklyt_session: event.sessionId,
            $lib: "cooklyt-web",
          });
        } catch {
          /* telemetry must never throw into the app */
        }
      })
      .catch(() => {});
  };
}
