const repo = require('./accounting.repository');
const journal = require('../modules/accounting/journal');
const { ValidationError } = require('../shared/errors');

/*
 * Accounting bridge — assemble a period's POS sales into balanced vouchers and
 * hand them out as Tally XML or a journal CSV. The heavy lifting (balancing,
 * serialising) is the pure module's; this only fetches, merges by day, and
 * chooses a format.
 */

// Grouping is by the local trading day so a late-night order lands on the right
// date. The timezone comes from the caller (the screen passes the operator's
// configured zone), then the restaurant's own timezone setting, then UTC — never
// a hardcoded region, so the day-book always agrees with the Reports screen.
const FALLBACK_TZ = 'UTC';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveRange(from, to) {
  // Default to the last 30 days ending today, a sensible "recent books" window.
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const toStr = to || iso(today);
  const fromStr = from || iso(new Date(today.getTime() - 29 * 86400000));
  if (!ISO_DATE.test(fromStr) || !ISO_DATE.test(toStr)) {
    throw new ValidationError('from and to must be YYYY-MM-DD dates');
  }
  if (fromStr > toStr) throw new ValidationError('from must be on or before to');
  return { from: fromStr, to: toStr };
}

async function assemble(restaurantId, { from, to, tz } = {}) {
  const range = resolveRange(from, to);
  // Caller's zone wins; else the restaurant's configured trading timezone; else UTC.
  const zone = tz || (await repo.getTimezone(restaurantId)) || FALLBACK_TZ;
  const [income, collections, companyName] = await Promise.all([
    repo.getDailyIncome(range.from, range.to, zone, restaurantId),
    repo.getDailyCollections(range.from, range.to, zone, restaurantId),
    repo.getRestaurantName(restaurantId),
  ]);

  const byDate = new Map();
  for (const c of collections) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push({ method: c.method, amount: c.amount });
  }

  const days = income.map((row) => ({
    date: row.date,
    collections: byDate.get(row.date) || [],
    subtotal: row.subtotal,
    taxAmount: row.tax_amount,
    serviceCharge: row.service_charge,
    packagingFee: row.packaging_fee,
    recordedDiscount: row.recorded_discount,
  }));

  const built = journal.buildJournal(days);
  return { ...built, range, companyName };
}

/** JSON view for the screen: the vouchers, the balance, the honest cross-check. */
async function preview(restaurantId, opts) {
  const j = await assemble(restaurantId, opts);
  return {
    range: j.range,
    companyName: j.companyName,
    totals: j.totals,
    discountCrossCheck: j.discountCrossCheck,
    vouchers: j.vouchers,
    scopeNote:
      'Sales day book only — one balanced journal voucher per trading day. Delivery-platform '
      + 'commission is reconciled separately on Payouts and is not posted here, to avoid '
      + 'double-counting orders that also carry a POS payment.',
  };
}

/**
 * A downloadable file in the requested format.
 * @returns { filename, contentType, body }
 */
async function exportFile(restaurantId, { format = 'tally', ...opts } = {}) {
  const j = await assemble(restaurantId, opts);
  const stamp = `${j.range.from}_to_${j.range.to}`;
  const safeCompany = j.companyName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'CookLyt';

  if (format === 'tally' || format === 'xml') {
    return {
      filename: `${safeCompany}-tally-${stamp}.xml`,
      contentType: 'application/xml; charset=utf-8',
      body: journal.toTallyXml(j, { companyName: j.companyName }),
    };
  }
  if (format === 'journal' || format === 'csv') {
    return {
      filename: `${safeCompany}-journal-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: journal.toJournalCsv(j),
    };
  }
  throw new ValidationError('format must be one of: tally, journal');
}

module.exports = { preview, exportFile, FALLBACK_TZ };
