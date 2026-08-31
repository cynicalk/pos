// AI Weekly Review — the "Monday read".
//
// The daily brief's sibling, one horizon up: last seven closed days against the
// seven before them, so the operator sees drift a single morning can't show —
// a revenue trend, the best and worst day, where margin and waste are heading.
//
// Same discipline as the brief, and it reuses the brief's narration layer: the
// figures come from the services the reports/insights pages already use, the
// model only phrases them, and a templated fallback stands in when it's offline.

const briefService = require('./brief.service');
const snapshotsRepo = require('../snapshots/snapshots.repository');
const insightsService = require('../insights/insights.service');
const actionsService = require('../actions/actions.service');
const aiRepo = require('./ai.repository');

const { round2 } = briefService;

// Two equal weeks: the one that just closed and the one before it.
const WEEK = 7;
const SPAN_DAYS = WEEK * 2 + 1; // + today, which we drop from judgement

/** Sum revenue / count traded days over a slice of the snapshot series. */
function summarise(slice) {
  const revenue = slice.reduce((s, d) => s + Number(d.revenue || 0), 0);
  const tradedDays = slice.filter((d) => Number(d.revenue) > 0).length;
  return { revenue: round2(revenue), tradedDays };
}

function pctChange(now, prior) {
  if (!prior || prior <= 0) return null; // no prior trade to grow from — abstain
  return round2(((now - prior) / prior) * 100);
}

/**
 * Gather the week's signals. Everything abstains: a missing prior week yields a
 * null change rather than a fabricated one, and a metric with no data stays null.
 */
async function gatherWeeklySignals(restaurantId) {
  const tz = await snapshotsRepo.getTimezone(restaurantId);
  const today = await snapshotsRepo.getLocalToday(restaurantId, tz);

  const safe = (p) => p.catch(() => null);
  const [series, economics, actions, waste, attach] = await Promise.all([
    safe(snapshotsRepo.getRevenueSeries(restaurantId, tz, SPAN_DAYS)),
    safe(insightsService.getEconomics(restaurantId, WEEK)),
    safe(actionsService.list(restaurantId, 'open')),
    safe(aiRepo.getWasteSummary(restaurantId, WEEK)),
    safe(insightsService.getAttachRate(restaurantId, WEEK)),
  ]);

  // Drop today (partial) and split the remaining fortnight into two equal weeks.
  const closed = (series || []).filter((d) => d.date !== today);
  const prior = closed.slice(-SPAN_DAYS + 1, -WEEK); // the earlier seven
  const current = closed.slice(-WEEK);               // the seven just closed

  const thisWeek = summarise(current);
  const lastWeek = summarise(prior);

  // Best / worst trading day within the week just closed.
  const traded = current.filter((d) => Number(d.revenue) > 0);
  const sorted = [...traded].sort((a, b) => Number(b.revenue) - Number(a.revenue));
  const best = sorted[0] ? { date: sorted[0].date, revenue: round2(sorted[0].revenue) } : null;
  const worst = sorted.length > 1 ? { date: sorted[sorted.length - 1].date, revenue: round2(sorted[sorted.length - 1].revenue) } : null;

  // The biggest attach-rate mover vs the prior window (already computed by the
  // service), high-margin categories preferred when the swing is a drop.
  let attachMover = null;
  const cats = (attach?.categories || []).filter((c) => c.delta != null);
  if (cats.length) {
    const byMagnitude = [...cats].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const m = byMagnitude[0];
    attachMover = { category: m.category, delta: round2(m.delta), highMargin: !!m.highMargin };
  }

  const top = (actions || [])[0] || null;

  let wasteSignal = null;
  if (Array.isArray(waste) && waste.length) {
    const total = waste.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    wasteSignal = { days: WEEK, totalCost: round2(total), topReason: waste[0].reason };
  }

  return {
    weekEnding: closed[closed.length - 1]?.date || today,
    revenue: {
      thisWeek: thisWeek.revenue,
      lastWeek: lastWeek.revenue,
      changePct: pctChange(thisWeek.revenue, lastWeek.revenue),
      tradedDays: thisWeek.tradedDays,
    },
    best,
    worst,
    margin: economics
      ? {
          foodCostPct: round2(economics.foodCost?.foodCostPct),
          operatingMarginPct: economics.operatingMargin?.operatingMarginPct ?? null,
          avgPerCover: economics.apc?.apc ?? null,
        }
      : null,
    waste: wasteSignal,
    attachMover,
    topAction: top ? { title: top.title, amount: top.opportunity?.amount ?? null } : null,
  };
}

const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

function buildMessages(signals) {
  const system =
    'You are the Monday-morning weekly review for an Indian restaurant operator. You are given a ' +
    'JSON object of figures the POS already computed for the last seven closed days versus the ' +
    'seven before them. Write a short spoken-style review — 3 to 5 sentences, plain, calm, no ' +
    'headings, no bullets, no emoji. Rules you must not break: use ONLY the numbers in the JSON, ' +
    'each with the exact meaning of its field name; never invent, estimate, or combine figures ' +
    'into a new one; a null value means the figure is not available, so say it is not recorded ' +
    'rather than guessing; amounts are Indian rupees. revenue.changePct compares this week to last ' +
    'week. Lead with the week-over-week revenue trend, then the best or worst day, then one margin, ' +
    'waste or attach-rate note if present. Sound like a trusted manager reviewing the week.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(signals) },
  ];
}

/** Honest templated review for when the model is offline — same facts, plainer. */
function fallbackNarrative(s) {
  const parts = [];
  const r = s.revenue;
  if (r.thisWeek == null || r.tradedDays === 0) {
    parts.push('No trade recorded in the last seven days.');
  } else {
    let line = `This week took ${inr(r.thisWeek)} across ${r.tradedDays} trading day${r.tradedDays === 1 ? '' : 's'}`;
    if (r.changePct != null) {
      line += `, ${r.changePct >= 0 ? 'up' : 'down'} ${Math.abs(r.changePct)}% on last week's ${inr(r.lastWeek)}`;
    } else {
      line += ' (no prior week to compare)';
    }
    parts.push(`${line}.`);
  }

  if (s.best) parts.push(`Best day was ${s.best.date} at ${inr(s.best.revenue)}.`);
  if (s.margin?.foodCostPct != null) parts.push(`Food cost ran ${s.margin.foodCostPct}% for the week.`);
  if (s.waste?.totalCost) parts.push(`Waste came to ${inr(s.waste.totalCost)}, most of it ${String(s.waste.topReason || '').toLowerCase()}.`);
  if (s.topAction) parts.push(s.topAction.amount != null ? `Biggest open action: ${s.topAction.title} (${inr(s.topAction.amount)}).` : `Biggest open action: ${s.topAction.title}.`);

  return parts.join(' ');
}

async function getWeeklyReview(restaurantId) {
  const signals = await gatherWeeklySignals(restaurantId);
  const { narrative, aiUsed, model } = await briefService.narrateOrFallback(
    buildMessages(signals),
    fallbackNarrative(signals),
  );
  return { weekEnding: signals.weekEnding, generatedAt: new Date().toISOString(), signals, narrative, model, aiUsed };
}

module.exports = { getWeeklyReview, gatherWeeklySignals, fallbackNarrative, buildMessages };
