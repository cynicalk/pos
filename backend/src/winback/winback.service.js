const crypto = require('crypto');
const repo = require('./winback.repository');
const couponsRepo = require('../coupons/coupons.repository');
const churn = require('../modules/guests/churn');
const winback = require('../modules/guests/winback');
const { ValidationError, NotFoundError } = require('../shared/errors');

/*
 * Winback offers — issue a printable, single-use discount to one lapsed guest,
 * and list the offers already out. The prediction (who has lapsed) is the churn
 * module's; this turns a chosen guest into an offer the operator can hand over.
 *
 * The discount is a real coupon, so it applies at the till through the same
 * engine as any other code — a winback offer is not a parallel discount system,
 * just a coupon issued for a named guest with its own reason.
 */

// Long enough to include guests who have genuinely lapsed, matching the churn view.
const WINDOW_DAYS = 365;

// No 0/O/1/I — a printed code has to be read back by a person at the counter.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSuffix(n = 4) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i += 1) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

// WB-<first name, letters only>-<4 random> — recognisable as a winback code and
// unique. Falls back to WB-<random> for a guest with no usable name.
function buildCode(name) {
  const stem = (name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return `WB-${stem ? `${stem}-` : ''}${randomSuffix()}`;
}

async function uniqueCode(restaurantId, name) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = buildCode(name);
    // eslint-disable-next-line no-await-in-loop
    if (!(await repo.codeExists(restaurantId, code))) return code;
  }
  throw new ValidationError('Could not generate a unique offer code — try again');
}

/** The lapsed guest's current churn record, re-derived server-side from orders. */
async function guestChurnRecord(restaurantId, customerId) {
  const row = await repo.getGuestForOffer(restaurantId, customerId, WINDOW_DAYS);
  if (!row) throw new NotFoundError('Guest');
  const { guests } = churn.buildChurnPredictions([{
    customerId: row.customer_id,
    phone: row.phone,
    name: row.name,
    orderDates: row.order_dates,
    totalSpend: Number(row.total_spend),
  }]);
  // guests holds only those with enough history for a cadence; empty means the
  // guest cannot be assessed, so an offer would be guesswork.
  return guests[0] || null;
}

/**
 * Issue an offer for one lapsed guest.
 *
 * Refuses when the guest cannot be measured (too few visits) or already has an
 * open offer — a second live code for the same person is how a guest ends up with
 * two discounts and the operator loses track of which is which.
 */
async function createOffer(restaurantId, customerId, userId) {
  if (!customerId) throw new ValidationError('customerId is required');

  const existing = await repo.getOpenOfferForGuest(restaurantId, customerId);
  if (existing) {
    throw new ValidationError(`This guest already has an open offer (${existing.code}).`);
  }

  const guest = await guestChurnRecord(restaurantId, customerId);
  if (!guest) {
    throw new ValidationError(
      `Not enough visit history to size an offer for this guest — needs ${churn.MIN_ORDERS_FOR_CADENCE}+ visits.`,
    );
  }

  const terms = winback.recommendOffer({ status: guest.status, avgSpend: guest.avgSpend });
  const code = await uniqueCode(restaurantId, guest.name);
  const expiresAt = new Date(Date.now() + terms.validDays * 86400000).toISOString();

  const coupon = await couponsRepo.create(restaurantId, {
    code,
    description: `Winback offer for ${guest.name || 'guest'} — ${terms.rationale}`,
    discountType: terms.discountType,
    discountValue: terms.discountValue,
    minOrderAmount: terms.minOrderAmount,
    maxUses: 1,
    expiresAt,
  });

  await repo.insertOffer(restaurantId, {
    customerId, couponId: coupon.id, churnStatus: guest.status, userId,
  });

  return {
    code,
    guest: { customerId, name: guest.name, phone: guest.phone },
    discountType: terms.discountType,
    discountValue: terms.discountValue,
    minOrderAmount: terms.minOrderAmount,
    expiresAt,
    validDays: terms.validDays,
    rationale: terms.rationale,
    churnStatus: guest.status,
  };
}

async function listOffers(restaurantId) {
  const rows = await repo.listOffers(restaurantId);
  const offers = rows.map((r) => ({
    id: r.id,
    code: r.code,
    guest: { customerId: r.customer_id, name: r.name, phone: r.phone },
    discountType: r.discount_type,
    discountValue: Number(r.discount_value),
    minOrderAmount: Number(r.min_order_amount),
    churnStatus: r.churn_status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    status: winback.offerStatus({
      usesCount: r.uses_count, expiresAt: r.expires_at, isActive: r.is_active,
    }),
  }));

  return {
    offers,
    summary: {
      total: offers.length,
      open: offers.filter((o) => o.status === 'open').length,
      redeemed: offers.filter((o) => o.status === 'redeemed').length,
      expired: offers.filter((o) => o.status === 'expired').length,
    },
  };
}

module.exports = { createOffer, listOffers, buildCode, WINDOW_DAYS };
