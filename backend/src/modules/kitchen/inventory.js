/**
 * Inventory arithmetic — ported from `src/modules/kitchen/inventory.ts`.
 *
 * Only the reorder half came across. The source's `deriveStockPosition` existed
 * because that app had no running stock figure: it reconstructed one as
 * `count + received − usage − waste` between periodic physical counts, tracked a
 * measured/derived/stale/uncounted confidence, and refused to report at all
 * past a freshness horizon rather than let the estimate drift.
 *
 * POS does not need any of that. `ingredients.stock_on_hand` is maintained by
 * an append-only ledger (`inventory_transactions`) that every sale, waste log,
 * count and delivery writes to, so the on-hand number is measured rather than
 * inferred. Porting the derivation would have replaced a fact with an estimate.
 *
 * What POS lacked, and this adds, is the reorder POINT: the level at which you
 * must order to avoid running out during the supplier's lead time.
 */

/**
 * Safety stock as a fraction of lead-time demand — a buffer against demand
 * being lumpier than its average, not a statistical service level. Ordering
 * exactly lead-time demand means a 50% chance of running out before the
 * delivery lands, because half of all weeks are busier than the average one.
 */
const SAFETY_FACTOR = 0.5;

/** Fallback when an ingredient has no supplier, matching suppliers.lead_time_days. */
const DEFAULT_LEAD_TIME_DAYS = 2;

const round = (n, dp = 3) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Reorder point = usage during the lead time + safety buffer.
 *
 * The lead time is the entire point: ordering when you hit zero means being
 * empty for the whole delivery wait, which is how a kitchen ends up 86-ing a
 * dish mid-service.
 */
function reorderPoint(dailyUsage, leadTimeDays) {
  if (!Number.isFinite(dailyUsage) || !Number.isFinite(leadTimeDays)) return 0;
  const usage = Math.max(dailyUsage, 0);
  const lead = Math.max(leadTimeDays, 0);
  return round(usage * lead * (1 + SAFETY_FACTOR));
}

/**
 * Days the current stock lasts at the observed rate.
 *
 * Null when usage is zero — an ingredient nothing consumes has infinite cover,
 * and reporting a number there (or a 0) would be worse than saying nothing.
 * Capped at CAP_DAYS so a barely-used item reads ">90d" rather than a falsely
 * precise 4,000.
 */
const COVER_CAP_DAYS = 90;

function daysOfCover(onHand, dailyUsage) {
  if (!Number.isFinite(onHand) || !Number.isFinite(dailyUsage)) return null;
  if (dailyUsage <= 0) return null;
  // Floored at zero. Negative stock is common in a POS whose ledger has run
  // ahead of its last count, and "-6.8 days of cover" is not a quantity anybody
  // can act on — you have no cover at all. The size of the shortfall is already
  // carried by onHand, where it reads as what it is.
  return round(Math.min(Math.max(onHand / dailyUsage, 0), COVER_CAP_DAYS), 1);
}

/**
 * One ingredient's reorder position.
 *
 * `dailyUsage` of 0 yields a reorder point of 0 and `shouldReorder: false`.
 * That is deliberate: with no observed consumption there is no defensible
 * quantity to advise, and suggesting one would be a guess dressed as arithmetic.
 * The UI says "no usage recorded" instead.
 */
function buildReorderPosition({ onHand, dailyUsage, leadTimeDays = DEFAULT_LEAD_TIME_DAYS }) {
  const usage = Number.isFinite(dailyUsage) ? Math.max(dailyUsage, 0) : 0;
  const stock = Number.isFinite(onHand) ? onHand : 0;
  const point = reorderPoint(usage, leadTimeDays);

  return {
    onHand: round(stock),
    dailyUsage: round(usage),
    leadTimeDays,
    reorderPoint: point,
    daysOfCover: daysOfCover(stock, usage),
    coverCapped: usage > 0 && stock / usage > COVER_CAP_DAYS,
    shouldReorder: usage > 0 && stock <= point,
    hasUsageSignal: usage > 0,
  };
}

module.exports = {
  SAFETY_FACTOR, DEFAULT_LEAD_TIME_DAYS, COVER_CAP_DAYS,
  reorderPoint, daysOfCover, buildReorderPosition,
};
