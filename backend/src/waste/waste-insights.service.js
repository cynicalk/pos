const repo = require('./waste-insights.repository');
const settingsRepo = require('../settings/settings.repository');
const weather = require('../shared/weather.client');
const llm = require('../ai/llm.client');

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIOD_DAYS = 28;

// Statistical honesty knobs:
const MIN_CORR_N      = 10;    // need at least this many aligned points to correlate at all
const PERM_BASE_ITERS = 1000;  // floor on permutation-test shuffles
const PERM_MAX_ITERS  = 50000; // cap on shuffles (perf guard for very large test families)
const PERM_MARGIN     = 10;    // keep the permutation resolution 1/(K+1) this far below ALPHA/m
const ALPHA           = 0.05;  // family-wise / false-discovery-rate level
const MIN_WEEKDAY_OBS = 3;     // weeks of data before a "worst weekday" can be a signal

// ── date helpers (date-string math, tz-aware "today") ────────────────────────
function todayInTz(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function enumerateDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
function weekdayOf(dateStr) { return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); }

// ── pure stats ───────────────────────────────────────────────────────────────
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

// Fractional (average-rank) ranking — correct for the many tied zero-waste days.
function rank(arr) {
  const order = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank of the tie group
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

// Spearman rank correlation — outlier-robust and catches monotonic-but-curved
// relationships. (Pearson on the ranks of both series.)
function spearman(xs, ys) {
  if (xs.length !== ys.length) return null;
  return pearson(rank(xs), rank(ys));
}

function shuffled(arr) {
  const r = arr.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// How many permutation shuffles to run for a family of `m` simultaneous tests.
// The smallest p a K-shuffle test can ever report is 1/(K+1). The strictest
// multiple-comparison threshold (Bonferroni, or BH's rank-1 comparison) for m tests
// is ALPHA/m. If 1/(K+1) ≥ ALPHA/m, NO test can reach significance however strong the
// real signal — it silently looks like "no signal found". So scale K with m to keep
// 1/(K+1) a PERM_MARGIN-fold below ALPHA/m: K+1 ≥ PERM_MARGIN·m/ALPHA.
//   m=2  → 1000 (floor; tons of headroom)   m=50 → 10000   m≥250 → 50000 (cap)
function permIterations(m) {
  const need = Math.ceil((PERM_MARGIN * Math.max(1, m)) / ALPHA);
  return Math.min(PERM_MAX_ITERS, Math.max(PERM_BASE_ITERS, need));
}

// Benjamini–Hochberg step-up. Given the family's p-values (nulls = test not run),
// returns a boolean[] of which are significant at false-discovery-rate ALPHA. BH
// controls the expected *fraction* of false discoveries rather than the chance of
// *any* (Bonferroni), so it keeps real power when many ingredients are tested.
// NOTE: BH's strictest comparison is p_(1) ≤ ALPHA/m — identical to Bonferroni — so
// BH does NOT lift the permutation resolution floor; that's handled by permIterations.
function benjaminiHochberg(pvals, alpha = ALPHA) {
  const present = pvals.map((p, i) => ({ p, i })).filter((x) => x.p != null);
  const m = present.length;
  const sig = new Array(pvals.length).fill(false);
  if (!m) return sig;
  present.sort((a, b) => a.p - b.p);
  let kMax = -1;
  for (let k = 0; k < m; k++) if (present[k].p <= ((k + 1) / m) * alpha) kMax = k;
  for (let k = 0; k <= kMax; k++) sig[present[k].i] = true;
  return sig;
}

// Spearman correlation with a permutation significance test. Returns
// { r, p, n } — r is null below MIN_CORR_N or for degenerate (zero-variance)
// input. p is the fraction of random shufflings whose |rho| ≥ |observed|.
function correlate(xs, ys, iterations = PERM_BASE_ITERS) {
  const n = xs.length;
  if (n < MIN_CORR_N) return { r: null, p: null, n };
  const rx = rank(xs), ry = rank(ys);
  const observed = pearson(rx, ry);
  if (observed == null) return { r: null, p: null, n };
  let extreme = 0;
  for (let it = 0; it < iterations; it++) {
    const r = pearson(rx, shuffled(ry)); // permuting ranks == permuting raw then ranking
    if (r != null && Math.abs(r) >= Math.abs(observed)) extreme++;
  }
  const p = (extreme + 1) / (iterations + 1); // +1 smoothing → never 0, never overconfident
  return { r: round2(observed), p: Math.round(p * 1000) / 1000, n };
}

function parseLlmJson(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── correlation assembly (pure, given raw rows) ──────────────────────────────
function buildCorrelations({ from, to, dailyWaste, weatherDays, topItems, reasons }) {
  const costByDay = Object.fromEntries(dailyWaste.map((r) => [r.day, parseFloat(r.cost) || 0]));
  const days = enumerateDays(from, to);
  const series = days.map((d) => ({ day: d, cost: costByDay[d] || 0 }));

  // weekday distribution — mean AND spread, so "Thursday is worst" can be judged
  const byDow = DOW.map(() => ([]));
  for (const s of series) byDow[weekdayOf(s.day)].push(s.cost);
  const weekday = byDow.map((vals, i) => {
    const n = vals.length;
    const mean = n ? vals.reduce((a, c) => a + c, 0) / n : 0;
    const variance = n ? vals.reduce((a, c) => a + (c - mean) ** 2, 0) / n : 0;
    return { weekday: DOW[i], avg_cost: round2(mean), sd: round2(Math.sqrt(variance)), days: n };
  });

  // Only promote a "worst weekday" when it's a finding, not a single bad week:
  // enough observations per day AND the top day's mean clears the runner-up by
  // more than the spread of the two. This is a deliberately conservative HEURISTIC,
  // not a hypothesis test: each weekday's sd rests on only ~4 observations over 28
  // days, and 0.5·(sd_top + sd_runnerUp) is an ad-hoc effect-size separation (the
  // sum of sds, not a pooled sd) comparing only top vs runner-up. It is meant to
  // suppress noisy promotions, not to assert statistical significance.
  const ranked = [...weekday].filter((w) => w.days > 0).sort((a, b) => b.avg_cost - a.avg_cost);
  let worst_weekday = null;
  if (ranked.length >= 2 && ranked[0].days >= MIN_WEEKDAY_OBS) {
    const [a, b] = ranked;
    if (a.avg_cost - b.avg_cost > 0.5 * (a.sd + b.sd) && a.avg_cost > 0) {
      worst_weekday = { weekday: a.weekday, avg_cost: a.avg_cost, sd: a.sd, days: a.days };
    }
  }

  // weather correlation: Spearman + permutation significance, with the false-discovery
  // rate controlled by Benjamini–Hochberg across the tests actually run (rain, temp;
  // more as this grows per-ingredient). The permutation shuffle count is scaled to the
  // family size so the resolution floor 1/(K+1) always sits below the BH threshold.
  let weatherStats = null;
  if (Array.isArray(weatherDays) && weatherDays.length) {
    const wByDay = Object.fromEntries(weatherDays.map((w) => [w.date, w]));
    const rain = [], temp = [], costR = [], costT = [];
    for (const s of series) {
      const w = wByDay[s.day];
      if (!w) continue;
      if (w.rain != null) { rain.push(w.rain); costR.push(s.cost); }
      if (w.temp != null) { temp.push(w.temp); costT.push(s.cost); }
    }
    // Size the family (and thus K) by the tests that can actually run (enough points).
    const family = (rain.length >= MIN_CORR_N ? 1 : 0) + (temp.length >= MIN_CORR_N ? 1 : 0);
    const iterations = permIterations(family);
    const rainfall = correlate(rain, costR, iterations);
    const temperature = correlate(temp, costT, iterations);
    const cells = [rainfall, temperature];
    const tests = Math.max(1, cells.filter((c) => c.r != null).length);
    const sig = benjaminiHochberg(cells.map((c) => (c.r != null ? c.p : null)), ALPHA);
    weatherStats = {
      method: 'spearman',
      correction: 'benjamini-hochberg',
      fdr: ALPHA,
      tests,
      iterations,
      rainfall:    { ...rainfall,    significant: sig[0] },
      temperature: { ...temperature, significant: sig[1] },
    };
  }

  return {
    weekday,
    worst_weekday,
    weather: weatherStats,
    top_items: topItems.map((t) => ({ ingredient: t.ingredient, unit: t.unit, quantity: round2(parseFloat(t.quantity)), cost: round2(parseFloat(t.cost)), events: t.events })),
    reasons: reasons.map((r) => ({ reason: r.reason, events: r.events, cost: round2(parseFloat(r.cost)) })),
    total_cost: round2(series.reduce((s, x) => s + x.cost, 0)),
  };
}

// ── deterministic fallback narration (used if the LLM is unavailable) ─────────
// Only states relationships the statistics actually support: the gated
// worst-weekday and significant weather correlations.
function fallbackNarration(scores) {
  const top = scores.top_items[0];
  const parts = [`Total waste over the last ${PERIOD_DAYS} days was ${scores.total_cost}.`];
  if (top) parts.push(`The biggest contributor is ${top.ingredient} (${top.cost}, ${top.events} event${top.events !== 1 ? 's' : ''}).`);
  if (scores.worst_weekday) {
    parts.push(`${scores.worst_weekday.weekday} tends to have the highest daily waste (avg ${scores.worst_weekday.avg_cost}).`);
  }
  const w = scores.weather;
  if (w) {
    if (w.rainfall.significant)    parts.push(`Waste ${w.rainfall.r > 0 ? 'rises' : 'falls'} with rainfall (Spearman ρ=${w.rainfall.r}, p=${w.rainfall.p}).`);
    if (w.temperature.significant) parts.push(`Waste ${w.temperature.r > 0 ? 'rises' : 'falls'} with temperature (Spearman ρ=${w.temperature.r}, p=${w.temperature.p}).`);
    if (!w.rainfall.significant && !w.temperature.significant) parts.push('No statistically significant weather link was found this period.');
  }
  const recommendations = scores.top_items.slice(0, 3).map((t) => ({
    ingredient: t.ingredient,
    action: 'Review prep quantities and portioning for this item',
    quantified_impact: t.cost,
  }));
  return { analysis: parts.join(' '), recommendations };
}

// Strip the raw stats down to what the model is allowed to talk about: a weather
// relationship is only passed through (with its numbers) when it cleared the
// significance gate — otherwise the model is told there is none, so it can't
// upgrade noise into a confident claim.
function modelPayload(scores) {
  const w = scores.weather;
  const weatherForModel = !w
    ? 'no location set — weather not analysed'
    : {
        rainfall:    w.rainfall.significant    ? { spearman_rho: w.rainfall.r,    p: w.rainfall.p,    significant: true } : { significant: false },
        temperature: w.temperature.significant ? { spearman_rho: w.temperature.r, p: w.temperature.p, significant: true } : { significant: false },
      };
  return {
    total_cost: scores.total_cost,
    top_items: scores.top_items,
    reasons: scores.reasons,
    worst_weekday: scores.worst_weekday, // null when not statistically distinguishable
    weather: weatherForModel,
  };
}

// ── LLM narration (resilient) ────────────────────────────────────────────────
async function narrate(scores, currency) {
  const sys = 'You are a restaurant waste analyst. Given the stats, write a concise 2–3 sentence analysis and up to 3 concrete recommendations. '
    + 'RULES: Only describe a weather relationship if its "significant" flag is true; if it is false or absent, state there is no reliable weather link and never imply one. '
    + 'If worst_weekday is null, do not claim any day is worst. Never invent numbers not present in the stats; do not call a relationship "strong" unless significant. '
    + 'Respond ONLY as JSON: {"analysis":"...","recommendations":[{"ingredient":"...","action":"...","quantified_impact":<number>}]}. No prose outside the JSON.';
  const user = `Currency: ${currency || 'local'}. Stats:\n${JSON.stringify(modelPayload(scores))}`;

  // Narration is non-critical (deterministic fallback exists), so don't block
  // Generate when the model is down: probe quickly first, then skip straight to
  // the fallback if it's unreachable. A single attempt covers the healthy case.
  if (!(await llm.reachable(1500))) return fallbackNarration(scores);

  try {
    const { content } = await llm.chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { temperature: 0.3, maxTokens: 400, retries: 1 },
    );
    const parsed = parseLlmJson(content);
    if (parsed && parsed.analysis) {
      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3).map((r) => ({
        ingredient: String(r.ingredient ?? '').slice(0, 120),
        action: String(r.action ?? '').slice(0, 300),
        quantified_impact: r.quantified_impact != null ? Number(r.quantified_impact) : null,
      })) : fallbackNarration(scores).recommendations;
      return { analysis: String(parsed.analysis).slice(0, 2000), recommendations: recs };
    }
  } catch (err) {
    console.error('[waste-insights] LLM narration failed:', err.message);
  }
  return fallbackNarration(scores);
}

// ── public ───────────────────────────────────────────────────────────────────
async function generate(restaurantId, generatedBy = 'cron') {
  const settings = await settingsRepo.getAll(restaurantId).catch(() => ({}));
  const tz = settings.timezone || 'UTC';
  const to = todayInTz(tz);
  const from = addDays(to, -(PERIOD_DAYS - 1));

  const [dailyWaste, topItems, reasons] = await Promise.all([
    repo.getDailyWasteSeries(restaurantId, from, to, tz),
    repo.getTopItems(restaurantId, from, to, tz, 8),
    repo.getReasonBreakdown(restaurantId, from, to, tz),
  ]);

  if (!dailyWaste.length) {
    const saved = await repo.saveInsight({
      restaurantId, periodStart: from, periodEnd: to,
      weatherData: null, correlationScores: { total_cost: 0, weekday: [], worst_weekday: null, weather: null, top_items: [], reasons: [] },
      analysis: `No waste was logged in the last ${PERIOD_DAYS} days — nothing to analyse yet.`,
      recommendations: [], generatedBy,
    });
    return shape(saved);
  }

  let weatherDays = null;
  if (settings.latitude && settings.longitude) {
    weatherDays = await weather.getDailyWeather({
      latitude: settings.latitude, longitude: settings.longitude, from, to, timezone: tz,
    });
  }

  const scores = buildCorrelations({ from, to, dailyWaste, weatherDays, topItems, reasons });
  const { analysis, recommendations } = await narrate(scores, settings.currency);

  const saved = await repo.saveInsight({
    restaurantId, periodStart: from, periodEnd: to,
    weatherData: weatherDays, correlationScores: scores,
    analysis, recommendations, generatedBy,
  });
  return shape(saved);
}

async function getLatest(restaurantId) {
  const row = await repo.getLatestInsight(restaurantId);
  return row ? shape(row) : null;
}

// pg returns jsonb as objects already; just normalise the envelope
function shape(row) {
  return {
    id: row.id,
    period_start: row.period_start,
    period_end: row.period_end,
    weather_available: !!row.weather_data,
    correlation_scores: row.correlation_scores || null,
    analysis: row.analysis,
    recommendations: row.recommendations || [],
    generated_by: row.generated_by,
    created_at: row.created_at,
  };
}

module.exports = { generate, getLatest, buildCorrelations, pearson, spearman, rank, correlate, permIterations, benjaminiHochberg };
