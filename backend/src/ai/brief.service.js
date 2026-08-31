// AI Daily Brief — the morning moment.
//
// A deterministic signals gatherer reads yesterday and the recent windows from
// the SAME services the Insights/Actions/Snapshots pages use, so the brief can
// never disagree with the screens it summarises. A model then narrates those
// figures and nothing else; when it is unreachable a templated fallback says the
// same thing in plainer words. The maths decides — the model only phrases.
//
// Honesty is inherited, not re-implemented: every figure here is already an
// abstaining one (null where a cost or a count is missing), and the brief prints
// "not available" rather than a zero that reads like a fact.

const { narrateOrFallback } = require('./narrate');
const briefRepo = require('./brief.repository');
const aiRepo = require('./ai.repository');
const snapshotsRepo = require('../snapshots/snapshots.repository');
const anomaly = require('../modules/analytics/anomaly');
const insightsService = require('../insights/insights.service');
const actionsService = require('../actions/actions.service');

// Enough closed days to give the anomaly detector its 14-day baseline plus the
// 7-day recent window it judges, with room to spare for closed days.
const HISTORY_DAYS = 35;
// Windows the money metrics are read over — a month, matching the Insights pages.
const WINDOW_DAYS = 30;
// Waste is a short-horizon operational signal; a week is what the chat tool uses.
const WASTE_DAYS = 7;
// How many ranked actions the brief leads with. The rest stay on the Actions page.
const TOP_ACTIONS = 3;

const round2 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

function hourLabel(hour) {
  if (hour === null || hour === undefined) return null;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? 'am' : 'pm'}`;
}

/** Yesterday's local date string, from the restaurant's own trading-day zone. */
function previousDay(todayStr) {
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Gather every figure the brief will state — all deterministic, all abstaining.
 * Each source is wrapped so one unavailable metric degrades to null instead of
 * failing the whole brief.
 */
async function gatherSignals(restaurantId) {
  const tz = await snapshotsRepo.getTimezone(restaurantId);
  const today = await snapshotsRepo.getLocalToday(restaurantId, tz);
  const yesterday = previousDay(today);

  const safe = (p) => p.catch(() => null);

  const [series, headline, economics, actions, waste, hours, coupons] = await Promise.all([
    safe(snapshotsRepo.getRevenueSeries(restaurantId, tz, HISTORY_DAYS)),
    safe(briefRepo.getDayHeadline(restaurantId, yesterday, tz)),
    safe(insightsService.getEconomics(restaurantId, WINDOW_DAYS)),
    safe(actionsService.list(restaurantId, 'open')),
    safe(aiRepo.getWasteSummary(restaurantId, WASTE_DAYS)),
    safe(insightsService.getServiceHours(restaurantId, WINDOW_DAYS)),
    safe(insightsService.getCouponEconomics(restaurantId, WINDOW_DAYS)),
  ]);

  // ── Yesterday, judged against normal (today excluded from judgement) ────────
  const detection = series ? anomaly.detectAnomalies(series, { recentDays: 7, today }) : null;
  const yAnomaly = detection?.anomalies?.find((a) => a.date === yesterday) || null;
  const sales = {
    date: yesterday,
    traded: !!headline,
    revenue: headline ? round2(headline.revenue) : null,
    orders: headline ? Number(headline.orders) : null,
    avgOrderValue: headline ? round2(headline.avg_order_value) : null,
    covers: headline && headline.covered_orders > 0 ? Number(headline.covers) : null,
    normal: detection?.hasBaseline ? detection.normal : null,
    anomaly: yAnomaly
      ? { direction: yAnomaly.direction, pctFromNormal: yAnomaly.pctFromNormal }
      : null,
  };

  // ── Top ranked open actions (rupee amount where one is defensible) ──────────
  const topActions = (actions || []).slice(0, TOP_ACTIONS).map((a) => ({
    title: a.title,
    priority: a.priority,
    amount: a.opportunity?.amount ?? null,
  }));

  // ── Margin position (abstaining) ────────────────────────────────────────────
  const margin = economics
    ? {
        windowDays: WINDOW_DAYS,
        foodCostPct: round2(economics.foodCost?.foodCostPct),
        operatingMarginPct: economics.operatingMargin?.operatingMarginPct ?? null,
        operatingMarginComplete: !!economics.operatingMargin?.complete,
        avgPerCover: economics.apc?.apc ?? null,
        scRemovedPct: economics.scRemoved?.removedPct ?? null,
      }
    : null;

  // ── Waste, week to date ─────────────────────────────────────────────────────
  let wasteSignal = null;
  if (Array.isArray(waste) && waste.length) {
    const total = waste.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const top = waste[0]; // repo orders by total_cost DESC
    wasteSignal = {
      days: WASTE_DAYS,
      totalCost: round2(total),
      topReason: top ? top.reason : null,
      topReasonCost: top ? round2(top.total_cost) : null,
    };
  }

  // ── Peak trading hour ───────────────────────────────────────────────────────
  const peakHour = hours?.peakHours?.length ? hourLabel(hours.peakHours[0]) : null;

  // ── One coupon flag: the cheapest-kept code that moved real volume ──────────
  let couponFlag = null;
  const worst = (coupons?.codes || []).find((c) => c.weight === 'heavy');
  if (worst) {
    couponFlag = { code: worst.code, discountRate: round2(worst.discountRate), netPerOrder: round2(worst.netPerOrder) };
  }

  return { date: yesterday, timezone: tz, sales, topActions, margin, waste: wasteSignal, peakHour, couponFlag };
}

// ── Narration ─────────────────────────────────────────────────────────────────

const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

/** The strict prompt: narrate ONLY these figures, invent nothing, abstain aloud. */
function buildMessages(signals) {
  const system =
    'You are the morning briefing for an Indian restaurant operator. You are given a JSON ' +
    'object of figures already computed by the POS. Write a short spoken-style brief — 3 to 5 ' +
    'sentences, plain, calm, no headings, no bullet points, no emoji. Rules you must not break: ' +
    'use ONLY the numbers in the JSON, each with the exact meaning of its field name; never ' +
    'invent, estimate, combine two figures into a new one, or round to a "nicer" number; a value ' +
    'of null means that figure is not available, so say it is not recorded rather than guessing; ' +
    'amounts are Indian rupees. sales.* is yesterday alone. sales.normal is the usual DAILY ' +
    'revenue for comparison — it is NOT yesterday\'s takings. If sales.traded is false, yesterday ' +
    'had no trade: say exactly that and state no revenue, order count, or covers for the day. ' +
    'margin.* covers the last ' + WINDOW_DAYS + ' days, not one day — never present a window ' +
    'figure as a daily one. Lead with how yesterday traded versus normal, then the single most ' +
    'important action, then one margin or waste note if present. Do not list every field. Sound ' +
    'like a trusted manager, not a dashboard.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(signals) },
  ];
}

/** Honest templated brief for when the model is unreachable — same facts, plainer. */
function fallbackNarrative(signals) {
  const s = signals.sales;
  const parts = [];

  if (!s.traded) {
    parts.push(`No trade recorded for ${s.date}.`);
  } else {
    let line = `Yesterday took ${inr(s.revenue)} across ${s.orders} order${s.orders === 1 ? '' : 's'}`;
    if (s.covers) line += ` (${s.covers} covers)`;
    if (s.anomaly) {
      const dir = s.anomaly.direction === 'drop' ? 'down' : 'up';
      line += ` — ${dir} ${Math.abs(s.anomaly.pctFromNormal)}% against a normal of ${inr(s.normal)}`;
    } else if (s.normal !== null) {
      line += `, in line with the usual ${inr(s.normal)}`;
    }
    parts.push(`${line}.`);
  }

  const top = signals.topActions[0];
  if (top) {
    parts.push(top.amount != null ? `Top action: ${top.title} (${inr(top.amount)} at stake).` : `Top action: ${top.title}.`);
  } else {
    parts.push('No open actions.');
  }

  if (signals.margin) {
    const m = signals.margin;
    if (m.foodCostPct != null) parts.push(`Food cost is running ${m.foodCostPct}% over the last ${m.windowDays} days.`);
    else if (m.operatingMarginPct != null) parts.push(`Operating margin is ${m.operatingMarginPct}% over the last ${m.windowDays} days.`);
  }
  if (signals.waste && signals.waste.totalCost) {
    parts.push(`Waste this week is ${inr(signals.waste.totalCost)}, most of it ${String(signals.waste.topReason || '').toLowerCase()}.`);
  }

  return parts.join(' ');
}

/**
 * Build the brief. Deterministic signals always; the model only phrases them, and
 * only if it answers inside a tight budget — the operator opens this at 9am and
 * will not wait on a cold model, so a fast fallback is preferred to a slow wait.
 */
async function getDailyBrief(restaurantId) {
  const signals = await gatherSignals(restaurantId);
  const { narrative, aiUsed, model } = await narrateOrFallback(
    buildMessages(signals),
    fallbackNarrative(signals),
  );
  return { date: signals.date, generatedAt: new Date().toISOString(), signals, narrative, model, aiUsed };
}

module.exports = { getDailyBrief, gatherSignals, fallbackNarrative, buildMessages, narrateOrFallback, round2 };
