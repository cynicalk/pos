/**
 * What a winback offer should be — pure policy, no I/O.
 *
 * The size of the nudge scales with how far gone the guest is, and the minimum
 * order is anchored to the guest's OWN average spend rather than a flat number,
 * so the offer is economically sane for that guest: a regular who spends ₹1,200 a
 * visit gets a different threshold than one who spends ₹300. Nothing here is
 * projected — it reads the guest's recorded status and average, and returns terms
 * the operator can accept or override.
 */

// Discount ladder by churn status. A guest merely due back gets a gentle nudge;
// one likely lost gets the strongest pull, because the alternative is losing them.
const OFFER_BY_STATUS = {
  due:         { discountValue: 10, validDays: 14, rationale: 'due back around now — a gentle nudge to return on schedule' },
  overdue:     { discountValue: 15, validDays: 21, rationale: 'past their usual rhythm — a reason to come back before the habit breaks' },
  likely_lost: { discountValue: 20, validDays: 30, rationale: 'lapsed well beyond their cadence — the strongest pull, before they are gone for good' },
};

const DEFAULT_OFFER = { discountValue: 10, validDays: 21, rationale: 'a standard returning-guest offer' };

// Round a rupee figure down to a tidy step so printed thresholds read cleanly.
function roundTo(n, step) {
  return Math.max(0, Math.floor(n / step) * step);
}

/**
 * Recommend offer terms for one lapsed guest.
 *
 * @param guest { status, avgSpend }
 * @returns { discountType, discountValue, minOrderAmount, validDays, rationale }
 */
function recommendOffer(guest = {}) {
  const base = OFFER_BY_STATUS[guest.status] || DEFAULT_OFFER;
  const avg = Number(guest.avgSpend) || 0;

  // Minimum order at roughly half their typical spend, to a ₹50 step — low
  // enough to feel usable, high enough that the discount rides a real order.
  // Zero when we have no spend to anchor to, rather than an invented floor.
  const minOrderAmount = avg > 0 ? roundTo(avg * 0.5, 50) : 0;

  return {
    discountType: 'percent',
    discountValue: base.discountValue,
    minOrderAmount,
    validDays: base.validDays,
    rationale: base.rationale,
  };
}

// Offer status derived from the linked coupon, so the winback list never keeps a
// lifecycle of its own that could drift from what actually happened at the till.
function offerStatus({ usesCount = 0, expiresAt = null, isActive = true }, now = Date.now()) {
  if (usesCount > 0) return 'redeemed';
  if (!isActive) return 'void';
  if (expiresAt && new Date(expiresAt).getTime() < now) return 'expired';
  return 'open';
}

module.exports = { recommendOffer, offerStatus, OFFER_BY_STATUS };
