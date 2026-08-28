/**
 * Staffing from the forecast — hours, headcount and labour cost (docs/FORECASTING.md §II.2, §IV).
 *
 * The demand forecast says how many covers a day will bring. This module turns
 * that into how many staff-hours that day needs, and what those hours cost
 * against the day's forecast takings — the two questions a roster answers.
 *
 * It refuses to invent a productivity standard. "Covers per labour-hour" is
 * learned from what this kitchen actually did — its own completed shifts against
 * its own recorded covers — not a textbook figure. Below enough history to learn
 * it, the plan says so and offers nothing, because a staffing number pulled from
 * an industry average is exactly the confident-but-baseless figure the rest of
 * the system refuses to print.
 *
 * The grain is the day, not the hour, because the labour history is daily
 * (staff_shifts records hours per work_date). A per-daypart roster would need
 * clock-level data the deployment does not yet hold, so the plan stays at the
 * grain its evidence supports.
 */

const { median } = require('./baseline');

/** Below this many usable history days, productivity is not stated. */
const MIN_HISTORY_DAYS = 14;
/** Fallback shift length when history cannot supply a typical one. */
const DEFAULT_SHIFT_HOURS = 8;

/**
 * Learn covers per labour-hour from the kitchen's own record.
 *
 * @param history [{ covers, labourHours }] — days with both recorded.
 * Returns null when there is not enough to learn from, rather than a guess.
 */
function learnProductivity(history) {
  const usable = history.filter((d) => d.labourHours > 0 && d.covers > 0);
  if (usable.length < MIN_HISTORY_DAYS) {
    return { coversPerLabourHour: null, sampleDays: usable.length, enough: false };
  }
  // Median of the daily ratio — robust to the odd short-staffed or dead day
  // that a mean would let drag the standard around.
  const ratios = usable.map((d) => d.covers / d.labourHours);
  return {
    coversPerLabourHour: median(ratios),
    sampleDays: usable.length,
    enough: true,
  };
}

/** The typical length of a single staff's day, learned or defaulted. */
function typicalShiftHours(history) {
  const perStaff = history
    .filter((d) => d.headcount > 0 && d.labourHours > 0)
    .map((d) => d.labourHours / d.headcount);
  const m = perStaff.length ? median(perStaff) : null;
  return m && m > 0 ? m : DEFAULT_SHIFT_HOURS;
}

/** Historical share of labour-hours by role — how this kitchen actually splits. */
function roleMix(roleHours) {
  const total = roleHours.reduce((s, r) => s + Number(r.hours || 0), 0);
  if (total <= 0) return [];
  return roleHours
    .map((r) => ({ role: r.role, share: Number(r.hours) / total }))
    .sort((a, b) => b.share - a.share);
}

/** Blended cost of an hour worked, across all roles, from what was paid. */
function blendedRate(roleHours) {
  const hours = roleHours.reduce((s, r) => s + Number(r.hours || 0), 0);
  const cost = roleHours.reduce((s, r) => s + Number(r.cost || 0), 0);
  return hours > 0 ? cost / hours : 0;
}

/**
 * Plan one day: forecast covers → suggested hours, headcount and role split.
 *
 * @param covers        forecast covers for the day (point).
 * @param productivity  learnProductivity() output.
 * @param opts          { roleMix, shiftHours }.
 */
function planDay(covers, productivity, { roleMix: mix = [], shiftHours = DEFAULT_SHIFT_HOURS } = {}) {
  if (!productivity.enough || covers === null) {
    return { suggestedHours: null, suggestedHeadcount: null, byRole: [] };
  }
  const suggestedHours = covers / productivity.coversPerLabourHour;
  const suggestedHeadcount = Math.max(1, Math.round(suggestedHours / shiftHours));
  const byRole = mix.map((r) => ({
    role: r.role,
    hours: suggestedHours * r.share,
    headcount: Math.max(0, Math.round((suggestedHours * r.share) / shiftHours)),
  }));
  return { suggestedHours, suggestedHeadcount, byRole };
}

/**
 * The band of labour-cost-as-%-of-revenue this outlet has actually run at.
 *
 * Not an industry benchmark — the operator's own recent normal, so a day is
 * judged lean or heavy against how they themselves usually staff, and the
 * verdict cannot be wrong in the way a borrowed 25%-of-revenue rule would be.
 */
function laborPctBand(history) {
  const pcts = history
    .filter((d) => d.revenue > 0 && d.labourCost > 0)
    .map((d) => (d.labourCost / d.revenue) * 100);
  if (pcts.length < MIN_HISTORY_DAYS) return { median: null, low: null, high: null, sampleDays: pcts.length };
  const sorted = [...pcts].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { median: median(sorted), low: at(0.25), high: at(0.75), sampleDays: pcts.length };
}

/** Where a projected labour % sits against the outlet's own band. */
function verdict(projectedPct, band) {
  if (projectedPct === null || band.median === null) return 'unknown';
  if (projectedPct > band.high) return 'heavy';
  if (projectedPct < band.low) return 'lean';
  return 'healthy';
}

module.exports = {
  learnProductivity,
  typicalShiftHours,
  roleMix,
  blendedRate,
  planDay,
  laborPctBand,
  verdict,
  MIN_HISTORY_DAYS,
  DEFAULT_SHIFT_HOURS,
};
