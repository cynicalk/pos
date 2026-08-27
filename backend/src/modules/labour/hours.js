/**
 * Labour arithmetic — ported from `src/modules/labour/hours.ts`.
 *
 * This module was already pure in the source and comes across close to
 * verbatim, comments included. These numbers reach someone's payslip and the
 * labour half of prime cost, so they are worth testing directly rather than
 * through a database round-trip.
 */

/** A shift longer than this is a forgotten clock-out, not a day worked. */
const MAX_SHIFT_HOURS = 24;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Hours worked between two stamps.
 *
 * Never negative: clock skew or a corrected clock-in can put the stamps out of
 * order, and a negative shift would silently REDUCE the labour cost for the
 * period — a wrong number that reads as a good one.
 *
 * Capped for the same reason: someone who forgets to clock out would otherwise
 * accrue hundreds of hours and destroy every labour metric for the window. The
 * cap is a floor on damage, not a correct value — a shift that hits it needs a
 * manager to look at it, which is what reviewShift is for.
 */
function hoursBetween(clockInAt, clockOutAt) {
  const raw = (new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 3600000;
  if (!Number.isFinite(raw)) return 0;
  return round2(Math.min(Math.max(raw, 0), MAX_SHIFT_HOURS));
}

/**
 * Why a shift needs a human to look at it, or null when it looks ordinary.
 *
 *   running_over — still clocked in past the cap. The LIVE case, and the only
 *                  one still fixable by walking over and asking.
 *   capped       — clocked out past the cap, so the recorded hours were
 *                  truncated and are now wrong on someone's payslip.
 *   reversed     — clocked out before clocked in; recorded as 0 hours, which
 *                  under-pays.
 *
 * Derived from the STAMPS rather than the stored hours, because the stored
 * value is exactly the thing that has been damaged: a capped shift and a
 * genuine 24-hour shift are indistinguishable once written.
 */
function reviewShift(clockInAt, clockOutAt, now = new Date()) {
  if (!clockInAt) return null;
  const inAt = new Date(clockInAt);
  if (Number.isNaN(inAt.getTime())) return null;

  const hoursSince = (from, to) => (to.getTime() - from.getTime()) / 3600000;

  if (!clockOutAt || Number.isNaN(new Date(clockOutAt).getTime())) {
    const elapsed = hoursSince(inAt, new Date(now));
    if (!Number.isFinite(elapsed) || elapsed <= MAX_SHIFT_HOURS) return null;
    return { flag: 'running_over', actualHours: round2(elapsed) };
  }

  const raw = hoursSince(inAt, new Date(clockOutAt));
  if (!Number.isFinite(raw)) return null;
  if (raw < 0) return { flag: 'reversed', actualHours: round2(raw) };
  if (raw > MAX_SHIFT_HOURS) return { flag: 'capped', actualHours: round2(raw) };
  return null;
}

/**
 * Aggregate worked shifts against revenue.
 *
 * salesPerHour and labourPct are null rather than 0 when the inputs cannot
 * support them. Zero would read as "we sell nothing per labour hour"; null
 * reads as "we can't say yet", which is the truth when no hours are logged.
 */
function computeLabourTotals(shifts, revenue) {
  const totalHours = shifts.reduce((sum, s) => sum + Number(s.hours || 0), 0);
  const labourCost = shifts.reduce(
    (sum, s) => sum + Number(s.hours || 0) * Number(s.hourly_rate ?? s.hourlyRate ?? 0), 0,
  );
  const rev = Number(revenue || 0);

  return {
    totalHours: round2(totalHours),
    labourCost: round2(labourCost),
    salesPerHour: totalHours > 0 ? round2(rev / totalHours) : null,
    labourPct: totalHours > 0 && rev > 0 ? round2((labourCost / rev) * 100) : null,
    shiftsLogged: shifts.length,
  };
}

/**
 * Prime cost = food + labour, as a share of revenue.
 *
 * Returns `complete: false` and a null percentage whenever either half is
 * missing. The source's own note is the reason: a prime cost quoted without
 * labour is not a prime cost, it is a food cost wearing its name — and it
 * flatters the operator by exactly the amount they pay their staff. Better to
 * report the halves and say the total is not available yet.
 */
function computePrimeCost({ foodCost, labourCost, revenue, hasLabour, hasFoodCost }) {
  const rev = Number(revenue || 0);
  const food = Number(foodCost || 0);
  const labour = Number(labourCost || 0);
  const complete = Boolean(hasFoodCost) && Boolean(hasLabour) && rev > 0;

  return {
    foodCost: round2(food),
    labourCost: round2(labour),
    primeCost: complete ? round2(food + labour) : null,
    primeCostPct: complete ? round2(((food + labour) / rev) * 100) : null,
    complete,
    missing: [
      ...(hasFoodCost ? [] : ['food cost — no costed recipes on the dishes sold']),
      ...(hasLabour ? [] : ['labour — no shifts logged in this period']),
    ],
  };
}

module.exports = {
  MAX_SHIFT_HOURS, hoursBetween, reviewShift, computeLabourTotals, computePrimeCost,
};
