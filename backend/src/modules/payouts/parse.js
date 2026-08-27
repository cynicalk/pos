/**
 * Settlement file parsing (MERGE_PLAN.md Phase 8).
 *
 * Ported from Opencode's ingestion/csv-parser, keeping its best idea and fixing
 * its worst habit.
 *
 * **The good idea, kept:** platform variation is pure *data*. Which header
 * aliases map to which field lives in PLATFORM_SPECS, so supporting a third
 * platform is one table entry rather than a second copy of the parser.
 *
 * **The habit, fixed:** the source defaulted everything it could not read.
 * A row with no order id got `unknown_${Math.random()}`; a row with an
 * unreadable date got `new Date()` — today; every unparseable number became 0.
 * In a reconciliation those defaults are the whole problem:
 *
 *   - A random order id means re-importing the same file creates duplicates and
 *     nothing can ever be matched against it.
 *   - Today's date silently drags the settlement period to include today,
 *     corrupting every per-period figure derived from it.
 *   - An unreadable amount becoming ₹0 is indistinguishable from a genuine
 *     zero, so a commission column the parser could not find reads as "they
 *     charged us nothing" — which would be reported as money in our favour.
 *
 * Here, a value that cannot be read is `null` and the row is rejected into a
 * `rejected[]` list with a reason. A settlement built from rows we understood,
 * with an explicit count of the rows we did not, is honest. One built from
 * defaults is a fabrication that balances.
 */

const { parseObjects } = require('./csv');

const FIELDS = [
  'orderId', 'orderDate', 'grossAmount', 'commission', 'tds', 'tcs',
  'slaPenalty', 'discountRestaurant', 'discountPlatform', 'refund',
  'netPayout', 'status', 'items',
];

// Fields without which a row cannot be reconciled at all.
const REQUIRED_FIELDS = ['orderId', 'orderDate', 'grossAmount', 'netPayout'];

const PLATFORM_SPECS = {
  swiggy: {
    label: 'Swiggy',
    detectTokens: ['swiggy', 'bundl', 'gov', 'disbursed_order_id'],
    columns: {
      orderId:   ['order_id', 'orderid', 'order id', 'transaction_id', 'disbursed_order_id'],
      orderDate: ['order_date', 'orderdate', 'order date', 'placed_at', 'order placed date', 'transaction_date'],
      grossAmount: ['gross_order_value', 'order_value', 'total_order_value', 'gross amount', 'gov'],
      commission: ['commission', 'platform_commission', 'commission_amount', 'total_commission'],
      tds: ['tds', 'tds_amount', 'section_194o', '194o_tds', 'tds_194o', 'tds_194_o',
            'section_393', 'tds_393'],
      tcs: ['tcs', 'tcs_amount', 'section_52', 'tcs_52', 'tcs_52_', 'cgst_tcs'],
      slaPenalty: ['sla_penalty', 'penalty', 'penalty_amount', 'late_prep_penalty', 'sla_charges'],
      discountRestaurant: ['restaurant_borne_discount', 'restaurant_discount', 'rest_discount', 'discount_restaurant'],
      discountPlatform: ['platform_borne_discount', 'platform_discount', 'plat_discount', 'swiggy_funded'],
      refund: ['refund', 'refund_amount', 'cancellation_refund', 'cancelled_amount'],
      netPayout: ['net_payout', 'net_amount', 'payout', 'settlement_amount', 'net_settlement'],
      status: ['status', 'order_status', 'delivery_status'],
      items: ['items', 'item_details', 'order_items'],
    },
  },
  zomato: {
    label: 'Zomato',
    detectTokens: ['zomato', 'res_id', 'subtotal'],
    columns: {
      orderId:   ['order_id', 'orderid', 'order id', 'res_order_id'],
      orderDate: ['order_date', 'order date', 'date', 'created_at'],
      grossAmount: ['subtotal', 'order_total', 'gross_amount', 'bill_subtotal'],
      commission: ['commission', 'commission_value', 'zomato_commission'],
      tds: ['tds', 'tds_amount', 'tds_194o'],
      tcs: ['tcs', 'tcs_amount', 'tcs_amount_cgst'],
      slaPenalty: ['penalty', 'sla_penalty', 'cancellation_penalty'],
      discountRestaurant: ['restaurant_discount', 'merchant_discount', 'res_discount'],
      discountPlatform: ['zomato_discount', 'platform_discount'],
      refund: ['refund', 'refund_amount'],
      netPayout: ['net_payout', 'payout_amount', 'final_amount', 'net_amount'],
      status: ['status', 'order_status'],
      items: ['items', 'item_details'],
    },
  },
};

const PLATFORMS = Object.keys(PLATFORM_SPECS);

class UnrecognizedSettlementError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnrecognizedSettlementError';
  }
}

const normaliseHeader = (h) => String(h).toLowerCase().trim().replace(/[\s-]+/g, '_');

function matchColumn(headers, candidates) {
  const lower = headers.map(normaliseHeader);
  for (const candidate of candidates) {
    const idx = lower.indexOf(normaliseHeader(candidate));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Which platform's export this is.
 *
 * Scored on how many of the platform's own columns are present, not on a
 * filename or a brand token that might appear in either file. Ties and empty
 * matches are refused rather than guessed — mis-detecting Zomato as Swiggy maps
 * `subtotal` onto nothing and silently produces a settlement of zeros.
 */
function detectPlatform(headers) {
  const scores = PLATFORMS.map((platform) => {
    const spec = PLATFORM_SPECS[platform];
    const matched = FIELDS.filter((f) => matchColumn(headers, spec.columns[f])).length;
    const branded = headers.some((h) =>
      spec.detectTokens.some((t) => normaliseHeader(h).includes(t)));
    return { platform, score: matched + (branded ? 2 : 0), matched };
  }).sort((a, b) => b.score - a.score);

  const [best, next] = scores;
  if (!best || best.matched < REQUIRED_FIELDS.length) return null;
  // A tie means the headers do not distinguish the two formats. Refusing is the
  // only safe answer: picking one would map half the columns onto nothing.
  if (next && next.score === best.score) return null;
  return best.platform;
}

/**
 * Read a money value.
 *
 * Returns null — not 0 — when the cell cannot be read, so the caller can tell
 * "they charged nothing" from "we could not find the column". An empty cell IS
 * treated as zero, because an absent deduction genuinely means none was made;
 * a cell containing letters is not.
 */
function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '' || str === '-' || /^n\/?a$/i.test(str)) return 0;

  const cleaned = str.replace(/[₹$,\s]/g, '');
  // Accounting parentheses: (1,234.50) means negative.
  const negated = /^\((.*)\)$/.exec(cleaned);
  const body = negated ? `-${negated[1]}` : cleaned;

  if (!/^-?\d*\.?\d+$/.test(body)) return null;
  const num = Number(body);
  return Number.isFinite(num) ? num : null;
}

/**
 * Read a date.
 *
 * DD/MM/YYYY is tried BEFORE the built-in Date parser, not after. Indian
 * settlement exports are day-first, and `new Date('03/04/2026')` reads that as
 * 3 April in some runtimes and 4 March in others — a month-wide error in the
 * settlement period, produced silently.
 */
function parseDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(str);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(Number(y), month - 1, day));
    // Rejects 31/02: the roll-over would otherwise land on 3 March.
    return date.getUTCMonth() === month - 1 ? date : null;
  }

  const iso = new Date(str);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function parseStatus(value) {
  const str = String(value || '').toLowerCase();
  if (str.includes('cancel')) return 'cancelled';
  if (str.includes('refund')) return 'refunded';
  if (!str.trim()) return 'delivered';
  return 'delivered';
}

const ITEM_ENTRY = /^(.+?)(?:\s*[x×]\s*(\d+))?(?:\s*@\s*([\d.]+))?$/i;

/** "Butter Naan x2 @ 60; Paneer Tikka x1 @ 240" → structured lines. */
function parseItemsCell(value) {
  if (!value) return [];
  return String(value)
    .split(/[;|]/)
    .map((e) => e.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const m = ITEM_ENTRY.exec(entry);
      if (!m || !m[1].trim()) return [];
      const quantity = m[2] ? parseInt(m[2], 10) : 1;
      const unitPrice = m[3] ? parseFloat(m[3]) : 0;
      return [{
        itemName: m[1].trim(),
        quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * quantity * 100) / 100,
      }];
    });
}

/**
 * Parse a settlement export.
 *
 * @returns {{ platform, orders, rejected, totals, periodStart, periodEnd,
 *             rowCount, columnsFound, columnsMissing }}
 * @throws  UnrecognizedSettlementError when the file is not a settlement export
 *          we can read. Refusing is the point: a half-mapped file produces a
 *          settlement that balances and is wrong.
 */
function parseSettlement(csvText, { platform: forced = null } = {}) {
  const { headers, rows, malformed } = parseObjects(csvText);

  if (!headers.length) {
    throw new UnrecognizedSettlementError('That file has no header row.');
  }

  const platform = forced || detectPlatform(headers);
  if (!platform) {
    throw new UnrecognizedSettlementError(
      'Could not tell which platform this export is from. Its columns do not match a '
      + `Swiggy or Zomato settlement file. Columns found: ${headers.slice(0, 8).join(', ')}`,
    );
  }
  if (!PLATFORM_SPECS[platform]) {
    throw new UnrecognizedSettlementError(`No settlement format is known for "${platform}".`);
  }

  const spec = PLATFORM_SPECS[platform];
  const resolved = Object.fromEntries(
    FIELDS.map((f) => [f, matchColumn(headers, spec.columns[f])]),
  );

  const columnsMissing = REQUIRED_FIELDS.filter((f) => !resolved[f]);
  if (columnsMissing.length) {
    throw new UnrecognizedSettlementError(
      `This looks like a ${spec.label} export but is missing column(s) needed to reconcile `
      + `it: ${columnsMissing.join(', ')}. Nothing was imported.`,
    );
  }

  const cell = (row, field) => (resolved[field] ? row[resolved[field]] : undefined);

  const orders = [];
  const rejected = [];

  rows.forEach((row, idx) => {
    const orderId = String(cell(row, 'orderId') || '').trim();
    const orderDate = parseDate(cell(row, 'orderDate'));
    const grossAmount = parseAmount(cell(row, 'grossAmount'));
    const netPayout = parseAmount(cell(row, 'netPayout'));

    // Row number as a human counts it: header is line 1.
    const line = idx + 2;

    if (!orderId) {
      rejected.push({ line, reason: 'no order id — nothing to reconcile this row against' });
      return;
    }
    if (!orderDate) {
      rejected.push({ line, orderId, reason: `unreadable date "${cell(row, 'orderDate')}"` });
      return;
    }
    if (grossAmount === null) {
      rejected.push({ line, orderId, reason: `unreadable gross amount "${cell(row, 'grossAmount')}"` });
      return;
    }
    if (netPayout === null) {
      rejected.push({ line, orderId, reason: `unreadable payout "${cell(row, 'netPayout')}"` });
      return;
    }

    // Deductions default to 0 only when the COLUMN is absent from this export,
    // which is a real statement about the format. A present-but-unreadable cell
    // rejects the row above.
    const amount = (field) => {
      if (!resolved[field]) return 0;
      const v = parseAmount(cell(row, field));
      return v === null ? 0 : v;
    };

    orders.push({
      platformOrderId: orderId,
      orderDate,
      grossAmount,
      commission: amount('commission'),
      tds: amount('tds'),
      tcs: amount('tcs'),
      slaPenalty: amount('slaPenalty'),
      discountRestaurant: amount('discountRestaurant'),
      discountPlatform: amount('discountPlatform'),
      refundAmount: amount('refund'),
      netAmount: netPayout,
      status: parseStatus(cell(row, 'status')),
      items: parseItemsCell(cell(row, 'items')),
    });
  });

  const sum = (key) => Math.round(orders.reduce((a, o) => a + o[key], 0) * 100) / 100;

  const times = orders.map((o) => o.orderDate.getTime());
  // Null rather than today's date when nothing parsed — the source's fallback
  // to `new Date()` invented a period out of an empty file.
  const periodStart = times.length ? new Date(Math.min(...times)) : null;
  const periodEnd = times.length ? new Date(Math.max(...times)) : null;

  return {
    platform,
    platformLabel: spec.label,
    orders,
    rejected,
    malformedRows: malformed,
    rowCount: rows.length,
    columnsFound: FIELDS.filter((f) => resolved[f]),
    columnsMissing: FIELDS.filter((f) => !resolved[f]),
    periodStart,
    periodEnd,
    totals: {
      grossSales:      sum('grossAmount'),
      totalCommission: sum('commission'),
      totalTds:        sum('tds'),
      totalTcs:        sum('tcs'),
      totalPenalties:  sum('slaPenalty'),
      totalDiscounts:  sum('discountRestaurant'),
      totalRefunds:    sum('refundAmount'),
      netPayout:       sum('netAmount'),
    },
  };
}

module.exports = {
  PLATFORM_SPECS,
  PLATFORMS,
  FIELDS,
  REQUIRED_FIELDS,
  UnrecognizedSettlementError,
  detectPlatform,
  matchColumn,
  parseAmount,
  parseDate,
  parseStatus,
  parseItemsCell,
  parseSettlement,
};
