/**
 * Prep reconciliation — how a day's prep decision landed, from logged data only.
 *
 * For each dish: what was prepped (actual if recorded, else the plan), what
 * sold, and therefore what went unsold. "Unsold" is stated, not "wasted": some
 * dishes carry to the next service and only the operator knows which, so this
 * reports the gap and lets them read it. The confirmed-binned figure comes
 * separately from waste_logs, as a cost, so the two are never conflated.
 *
 * Nothing is invented. A dish with neither a plan nor an actual is `not_logged`
 * and carries no over-prep number — the whole point of the feature is the number
 * the kitchen entered, so a missing one is a gap to show, not a zero to assume.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * @param rows [{
 *   menuItemId, name, forecastQty, plannedQty, actualQty,  // from prep_logs (nullable)
 *   sold,                    // portions sold that day
 *   loggedWasteCost,         // ₹ logged as OVERPREP for this dish that day
 * }]
 */
function reconcileDish(row) {
  const planned = row.plannedQty == null ? null : Number(row.plannedQty);
  const actual = row.actualQty == null ? null : Number(row.actualQty);
  const sold = Number(row.sold) || 0;

  // Prefer what was actually made; fall back to the plan; say which.
  const prepped = actual != null ? actual : planned;
  const preppedSource = actual != null ? 'actual' : planned != null ? 'planned' : null;

  const base = {
    menuItemId: row.menuItemId,
    name: row.name,
    forecastQty: row.forecastQty == null ? null : Number(row.forecastQty),
    plannedQty: planned,
    actualQty: actual,
    sold,
    loggedWasteCost: round2(row.loggedWasteCost || 0),
  };

  if (prepped == null) {
    return { ...base, prepped: null, preppedSource: null, unsold: null, overPrepPct: null, status: 'not_logged' };
  }

  const unsold = Math.max(0, round2(prepped - sold));
  const overPrepPct = prepped > 0 ? round2((unsold / prepped) * 100) : null;
  // Sold more than prepped means the plan under-shot (a stockout risk), worth its
  // own flag rather than a silent zero.
  const status = prepped < sold ? 'short' : unsold > 0 ? 'over' : 'on_target';

  return { ...base, prepped, preppedSource, unsold, overPrepPct, status };
}

function buildReconciliation(rows = []) {
  const dishes = rows.map(reconcileDish).sort((a, b) => (b.unsold ?? -1) - (a.unsold ?? -1));

  const logged = dishes.filter((d) => d.status !== 'not_logged');
  const withPlan = rows.filter((r) => r.plannedQty != null).length;
  const withActual = rows.filter((r) => r.actualQty != null).length;

  return {
    dishes,
    coverage: {
      total: dishes.length,
      logged: logged.length,
      planned: withPlan,
      actual: withActual,
      // Of the dishes that were logged, the share the kitchen over-prepped.
      pct: dishes.length > 0 ? round2((logged.length / dishes.length) * 100) : null,
    },
    totals: {
      prepped: round2(logged.reduce((s, d) => s + (d.prepped || 0), 0)),
      sold: round2(logged.reduce((s, d) => s + d.sold, 0)),
      unsold: round2(logged.reduce((s, d) => s + (d.unsold || 0), 0)),
      loggedWasteCost: round2(dishes.reduce((s, d) => s + d.loggedWasteCost, 0)),
      overPrepped: logged.filter((d) => d.status === 'over').length,
      shortPrepped: logged.filter((d) => d.status === 'short').length,
    },
  };
}

module.exports = { reconcileDish, buildReconciliation };
