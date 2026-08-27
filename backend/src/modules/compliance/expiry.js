/**
 * Expiry arithmetic for anything with a valid-until date — the FSSAI licence,
 * a food-handler certificate, a medical fitness record.
 *
 * Ported from the certStatus helper in `modules/compliance/evidence-pack.ts`.
 *
 * The states are deliberately four, not three: 'unknown' is separate from
 * 'valid' because "we have no expiry date on file" and "this is in date" call
 * for completely different actions, and collapsing them lets a missing record
 * pass an audit view as a healthy one.
 */

/** Renewal lead time. FSSAI renewals routinely take 30-60 days. */
const EXPIRY_WARNING_DAYS = 60;

/** Whole days from now until a date; negative once it has passed. */
function daysUntil(date, now = Date.now()) {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((then - now) / 86400000);
}

function expiryStatus(validUntil, now = Date.now()) {
  const days = daysUntil(validUntil, now);
  if (days === null) return { state: 'unknown', daysToExpiry: null };
  if (days < 0) return { state: 'expired', daysToExpiry: days };
  if (days <= EXPIRY_WARNING_DAYS) return { state: 'expiring', daysToExpiry: days };
  return { state: 'valid', daysToExpiry: days };
}

/**
 * Roll a set of documents into one headline state.
 *
 * Worst-wins, and 'unknown' outranks 'valid': a pack with one undated
 * certificate is not "compliant", it is "we cannot tell". Reporting it as green
 * is exactly the failure an evidence pack exists to prevent.
 */
const RANK = { expired: 3, unknown: 2, expiring: 1, valid: 0 };

function worstStatus(states) {
  if (!states.length) return 'unknown';
  return states.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'valid');
}

module.exports = { EXPIRY_WARNING_DAYS, daysUntil, expiryStatus, worstStatus, RANK };
