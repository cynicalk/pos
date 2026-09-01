"use client";

/**
 * Recommender experiment assignment — the honest way to know whether the
 * recommender's smarts actually help.
 *
 * A stable slice of tables (by their analytics session id) is held OUT of the
 * operator's featured lever and the learned acceptance prior: they get the plain
 * hand-tuned model. Comparing that control against the treatment on acceptance,
 * conversion and AOV is the only way to say "featuring/learning lifted X" rather
 * than assuming it. The split is deterministic per session, so a table stays in
 * one arm for its whole visit and the buckets are stable across reloads.
 *
 * Exploration (ε-greedy): a small share of treatment sessions get one exploration
 * slot, where an eligible dish that the ranking wouldn't have surfaced is shown
 * instead. Without it the learned prior is a rich-get-richer loop — boosted dishes
 * are shown, get adds, get boosted — and a good dish that's never shown can never
 * earn its place. Exploration keeps the long tail getting looked at.
 */

const HOLDOUT_PCT = 20;   // share of sessions in the control arm
const EXPLORE_PCT = 15;   // share of TREATMENT sessions that get an exploration slot

function sessionSeed(): number {
  let id = "ssr";
  try {
    id = sessionStorage.getItem("cooklyt-analytics-session") || "anon";
  } catch {
    id = "no-storage";
  }
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export type Variant = "control" | "treatment";

export function sessionVariant(): Variant {
  return sessionSeed() % 100 < HOLDOUT_PCT ? "control" : "treatment";
}

/** Whether this session gets an exploration slot (treatment only). Uses a second,
 *  independent slice of the same stable seed so it doesn't correlate with arm. */
export function sessionExplores(): boolean {
  if (sessionVariant() === "control") return false;
  return Math.floor(sessionSeed() / 100) % 100 < EXPLORE_PCT;
}
