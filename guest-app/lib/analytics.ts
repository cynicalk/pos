"use client";

import type { CartSource } from "@/types";
import { createPostHogSink } from "./posthog-sink";
import { createCooklytSink } from "./cooklyt-sink";

/**
 * Lightweight, dependency-free event layer.
 *
 * Every event is (a) appended to a capped localStorage buffer you can inspect
 * during QA and (b) handed to an optional sink you register with
 * `setAnalyticsSink` — that's where PostHog / Segment / an HTTP endpoint plugs
 * in later. Nothing here may ever throw into the product flow: analytics is
 * best-effort and fails silent.
 *
 * Metrics this unlocks:
 *   - AI acceptance   → dish_added.from === "reco" ÷ all dish_added
 *   - Onboarding drop → funnel_step counts, step-over-step
 *   - AI rejection    → reco_rejected (reason: "refine" | "capped")
 */

export type AnalyticsEventName =
  | "funnel_step"
  | "recommendations_shown"
  | "dish_added"
  | "dish_removed"
  | "reco_rejected"
  | "order_placed"
  | "order_failed";

export interface AnalyticsEvent {
  event: AnalyticsEventName;
  props: Record<string, unknown>;
  /** epoch ms */
  ts: number;
  /** stable per browser session — the natural join key once auth ships */
  sessionId: string;
  /** monotonic across page loads within a buffer */
  seq: number;
}

type Sink = (event: AnalyticsEvent) => void;

const SESSION_KEY = "cooklyt-analytics-session";
const BUFFER_KEY = "cooklyt-events";
const MAX_BUFFER = 500;

let sink: Sink | null = null;
let lastStepFire: { step: string; ts: number } | null = null;

/** Point events at a real destination (PostHog/Segment/etc.). Pass null to detach. */
export function setAnalyticsSink(fn: Sink | null) {
  sink = fn;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function readBuffer(): AnalyticsEvent[] {
  try {
    return JSON.parse(localStorage.getItem(BUFFER_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeBuffer(events: AnalyticsEvent[]) {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(events.slice(-MAX_BUFFER)));
  } catch {
    /* quota / private mode — never break the app over telemetry */
  }
}

export function track(
  event: AnalyticsEventName,
  props: Record<string, unknown> = {}
) {
  if (typeof window === "undefined") return; // no-op during SSR
  const buffer = readBuffer();
  const e: AnalyticsEvent = {
    event,
    props,
    ts: Date.now(),
    sessionId: getSessionId(),
    seq: (buffer[buffer.length - 1]?.seq ?? -1) + 1,
  };
  buffer.push(e);
  writeBuffer(buffer);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, props);
  }
  try {
    sink?.(e);
  } catch {
    /* a broken sink must not break the flow */
  }
}

/**
 * Funnel step, de-duped against rapid re-fires (React strict-mode double
 * effects, incidental re-renders) so one page view = one step event.
 */
export function trackFunnelStep(step: string, label: string, route: string) {
  const now = Date.now();
  if (lastStepFire?.step === step && now - lastStepFire.ts < 1500) return;
  lastStepFire = { step, ts: now };
  track("funnel_step", { step, label, route });
}

/** Handy in the browser console during QA. */
export function getEvents(): AnalyticsEvent[] {
  return typeof window === "undefined" ? [] : readBuffer();
}

export function clearEvents() {
  if (typeof window !== "undefined") localStorage.removeItem(BUFFER_KEY);
}

// Auto-wire the configured sinks at module init (this module is imported by the
// flow store, high in the tree) so they are live before the first event fires.
// Two may run at once — PostHog (when NEXT_PUBLIC_POSTHOG_KEY is set) and the
// CookLyt backend log (when NEXT_PUBLIC_COOKLYT_API is set) — so fan out to
// whichever attached. Each is best-effort and isolated: one throwing or being
// absent never affects the other or the buffer/console path.
if (typeof window !== "undefined") {
  const sinks = [createPostHogSink(), createCooklytSink()].filter(
    (s): s is Sink => s !== null
  );
  if (sinks.length === 1) setAnalyticsSink(sinks[0]);
  else if (sinks.length > 1) {
    setAnalyticsSink((event) => {
      for (const s of sinks) {
        try {
          s(event);
        } catch {
          /* one broken sink must not starve the others */
        }
      }
    });
  }
}

// Expose a tiny inspector in dev so you can eyeball funnels without a backend.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { cooklytAnalytics?: unknown }).cooklytAnalytics = {
    getEvents,
    clearEvents,
  };
}

export type { CartSource };
