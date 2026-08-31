// AI Evening Wrap — the close-out moment, the bookend to the morning brief.
//
// The brief looks back at yesterday; this looks at today as it closes, and its
// one signal no brief carries is the cash reconciliation — what the drawer should
// hold against what the last count found — plus a nudge for tomorrow's prep. Same
// discipline: deterministic signals from the services the close-out screens use,
// the model only phrases them, and an honest templated wrap stands in when the
// model is offline. Every figure abstains where the data isn't there.

const { narrateOrFallback } = require('./narrate');
const { round2 } = require('./brief.service');
const aiRepo = require('./ai.repository');
const snapshotsRepo = require('../snapshots/snapshots.repository');
const reportsService = require('../reports/reports.service');
const settingsService = require('../settings/settings.service');
const shiftService = require('../shift/shift.service');
const prepService = require('../prep/prep.service');

const WASTE_DAYS = 1; // today's waste

const isSameLocalDay = (iso, localToday) => {
  if (!iso) return false;
  // shift_counts.counted_at is a timestamp; compare on the calendar date. This is
  // a light check — a close done just after local midnight is a corner the wrap
  // does not need to be exact about, and it never invents a variance.
  return String(new Date(iso).toISOString().slice(0, 10)) === String(localToday);
};

async function gatherWrapSignals(restaurantId) {
  const tz = await snapshotsRepo.getTimezone(restaurantId);
  const today = await snapshotsRepo.getLocalToday(restaurantId, tz);
  const safe = (p) => p.catch(() => null);

  const [report, settings, cash, history, waste, prep] = await Promise.all([
    safe(reportsService.getDailySummary(today, tz, restaurantId)),
    safe(settingsService.getAll(restaurantId)),
    safe(shiftService.getSummary(restaurantId)),
    safe(shiftService.getHistory(restaurantId)),
    safe(aiRepo.getWasteSummary(restaurantId, WASTE_DAYS)),
    safe(prepService.getPrepForecast(restaurantId, {})),
  ]);

  // ── Today's trade vs target ─────────────────────────────────────────────────
  const revenue = report?.summary ? round2(report.summary.total_revenue) : null;
  const orders = report?.summary ? Number(report.summary.total_orders) : null;
  const target = settings && settings.daily_revenue_target
    ? Number(settings.daily_revenue_target)
    : null;
  const trade = {
    date: today,
    revenue,
    orders,
    target: target && target > 0 ? target : null,
    // Abstain unless we have both a revenue and a target to compare it to.
    targetPct: revenue != null && target > 0 ? round2((revenue / target) * 100) : null,
  };

  // ── Cash reconciliation ─────────────────────────────────────────────────────
  // What the drawer should hold since the last count, and — only if a count was
  // actually taken today — how that count came out (over/short).
  let cashSignal = null;
  if (cash) {
    const lastToday = Array.isArray(history)
      ? history.find((h) => isSameLocalDay(h.counted_at, today))
      : null;
    cashSignal = {
      expectedInDrawer: round2(cash.expectedCash),
      countedToday: !!lastToday,
      varianceToday: lastToday ? round2(lastToday.variance) : null,
    };
  }

  // ── Waste logged today ──────────────────────────────────────────────────────
  let wasteSignal = null;
  if (Array.isArray(waste) && waste.length) {
    const total = waste.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    if (total > 0) wasteSignal = { totalCost: round2(total), topReason: waste[0].reason };
  }

  // ── Tomorrow's prep nudge ───────────────────────────────────────────────────
  let tomorrow = null;
  if (prep?.summary) {
    const worst = (prep.dishes || [])
      .filter((d) => d.valuedSurplus != null || d.chronic)
      .sort((a, b) => (b.valuedSurplus ?? 0) - (a.valuedSurplus ?? 0))[0] || null;
    tomorrow = {
      surplusValue: prep.summary.totalSurplusValue,   // null where nothing is costed
      surplusPortions: prep.summary.totalSurplusPortions,
      chronicCount: prep.summary.chronic,
      topDish: worst ? worst.name : null,
    };
  }

  return { date: today, timezone: tz, trade, cash: cashSignal, waste: wasteSignal, tomorrow };
}

const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

function buildMessages(signals) {
  const system =
    'You are the end-of-day wrap for an Indian restaurant operator, written as the day closes. You ' +
    'are given a JSON object of figures the POS already computed for today. Write a short spoken-style ' +
    'wrap — 3 to 5 sentences, plain, calm, no headings, no bullet points, no emoji. Rules you must not ' +
    'break: use ONLY the numbers in the JSON, each with the exact meaning of its field name; never ' +
    'invent, estimate, or combine figures into a new one; a null value means that figure is not ' +
    'available, so say it is not recorded rather than guessing; amounts are Indian rupees. ' +
    'cash.expectedInDrawer is what the cash drawer should hold at close since the last count; ' +
    'cash.varianceToday is only meaningful when cash.countedToday is true (positive is over, negative ' +
    'is short) — if countedToday is false, do not state a variance. tomorrow.surplusValue is the rupees ' +
    'likely to be over-prepped tomorrow, not today, and over-prep is waste, never a good thing. Do not ' +
    'add value judgements like "good news" or "bad news" — state the figure and, for over-prep, what to ' +
    'watch. Write amounts with the rupee sign and whole numbers (e.g. ₹2,443), not the word "rupees" and ' +
    'not decimals. Lead with how today traded against the target, then the cash position for the close, ' +
    'then one waste or tomorrow-prep note if present. Sound like a trusted manager closing up.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(signals) },
  ];
}

function fallbackNarrative(signals) {
  const parts = [];
  const t = signals.trade;

  if (t.revenue == null) {
    parts.push('No trade recorded for today yet.');
  } else {
    let line = `Today took ${inr(t.revenue)}`;
    if (t.orders != null) line += ` across ${t.orders} order${t.orders === 1 ? '' : 's'}`;
    if (t.targetPct != null) line += ` — ${t.targetPct}% of the ${inr(t.target)} target`;
    parts.push(`${line}.`);
  }

  if (signals.cash) {
    const c = signals.cash;
    let line = `The drawer should hold ${inr(c.expectedInDrawer)} at close`;
    if (c.countedToday && c.varianceToday != null) {
      const v = c.varianceToday;
      line += v === 0
        ? ', and today\'s count balanced'
        : `, and today's count came up ${inr(Math.abs(v))} ${v < 0 ? 'short' : 'over'}`;
    }
    parts.push(`${line}.`);
  }

  if (signals.waste && signals.waste.totalCost) {
    parts.push(`Waste logged today: ${inr(signals.waste.totalCost)}, mostly ${String(signals.waste.topReason || '').toLowerCase()}.`);
  }
  if (signals.tomorrow && signals.tomorrow.surplusValue) {
    let line = `Tomorrow you're likely to over-prep about ${inr(signals.tomorrow.surplusValue)}`;
    if (signals.tomorrow.topDish) line += ` — keep an eye on ${signals.tomorrow.topDish}`;
    parts.push(`${line}.`);
  }

  return parts.join(' ');
}

async function getEveningWrap(restaurantId) {
  const signals = await gatherWrapSignals(restaurantId);
  const { narrative, aiUsed, model } = await narrateOrFallback(
    buildMessages(signals),
    fallbackNarrative(signals),
    { maxTokens: 200, restaurantId },
  );
  return { date: signals.date, generatedAt: new Date().toISOString(), signals, narrative, model, aiUsed };
}

module.exports = { getEveningWrap, gatherWrapSignals, buildMessages, fallbackNarrative };
