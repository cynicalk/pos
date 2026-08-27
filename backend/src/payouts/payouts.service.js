const repo = require('./payouts.repository');
const parser = require('../modules/payouts/parse');
const reconciler = require('../modules/payouts/reconcile');
const { ValidationError, NotFoundError } = require('../shared/errors');

/*
 * Settlement reconciliation (MERGE_PLAN.md Phase 8 — Tier 2).
 *
 * The machinery is complete and tested against a fixture. The screen ships
 * empty because no real settlement file exists for this deployment yet, and
 * that emptiness is the honest state — not a placeholder to be filled with
 * sample numbers.
 */

// Settlement exports are text. A few hundred KB covers a month of orders; the
// cap is here so a mis-uploaded video does not become a heap allocation.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const HISTORY_LIMIT = 24;

/**
 * Render a DATE column as a plain date string.
 *
 * The same trap Phase 5 hit. A Postgres DATE comes back from pg as a JS Date at
 * LOCAL midnight, so `.toISOString()` on 3 Aug in IST yields "2026-08-02T18:30Z"
 * — the settlement period displayed a day early, every time, with no error
 * anywhere. Reading the local date parts avoids the round trip through UTC
 * entirely.
 */
const asDate = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toRate = (pct) => {
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  // Accepts 22 or 0.22 — an operator reading "22%" off a contract will type 22,
  // and silently treating that as 2200% would be a spectacular false finding.
  const rate = n > 1 ? n / 100 : n;
  return rate > 0 && rate < 1 ? rate : null;
};

async function getContracts(restaurantId) {
  const rows = await repo.listContracts(restaurantId);
  const byPlatform = Object.fromEntries(rows.map((r) => [r.platform, r]));

  return {
    platforms: parser.PLATFORMS.map((p) => ({
      platform: p,
      label: parser.PLATFORM_SPECS[p].label,
      commissionRatePct: byPlatform[p]?.commission_rate != null
        ? Math.round(Number(byPlatform[p].commission_rate) * 10000) / 100
        : null,
      updatedAt: byPlatform[p]?.updated_at || null,
    })),
    note: 'Commission rates come from your signed contract. CookLyt cannot read them from a '
      + 'settlement file — the file only shows what was actually charged, which is the thing '
      + 'being checked. Without a rate on record, the commission check is skipped rather '
      + 'than run against a guess.',
  };
}

async function saveContract(restaurantId, platform, ratePct, userId) {
  if (!parser.PLATFORMS.includes(platform)) {
    throw new ValidationError(`platform must be one of: ${parser.PLATFORMS.join(', ')}`);
  }
  const rate = toRate(ratePct);
  if (rate === null) {
    throw new ValidationError('Commission rate must be above 0% and below 100%');
  }
  return repo.upsertContract(restaurantId, platform, rate, userId);
}

/**
 * Parse and reconcile an uploaded settlement, WITHOUT saving.
 *
 * Deliberately separate from import: the operator sees exactly what was read,
 * what was rejected and what the checks found, and then decides. A file that
 * silently imports and only then reveals that a fifth of its rows were
 * unreadable is a file the operator has already acted on.
 */
async function parseAndReconcile(restaurantId, { buffer, fileName, platform = null }) {
  if (!buffer || !buffer.length) throw new ValidationError('No file was uploaded');
  if (buffer.length > MAX_FILE_BYTES) {
    throw new ValidationError(`That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  }

  let parsed;
  try {
    parsed = parser.parseSettlement(buffer.toString('utf8'), { platform });
  } catch (err) {
    if (err instanceof parser.UnrecognizedSettlementError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }

  const contract = await repo.getContract(restaurantId, parsed.platform);
  const contractedRate = contract?.commission_rate != null
    ? Number(contract.commission_rate)
    : null;

  // Coverage only makes sense over a real period. A file whose rows were all
  // rejected has none, and comparing against an invented window would be worse
  // than not comparing at all.
  let pos = {};
  if (parsed.periodStart && parsed.periodEnd) {
    const row = await repo.getPosRevenue(
      restaurantId,
      parsed.periodStart.toISOString().slice(0, 10),
      parsed.periodEnd.toISOString().slice(0, 10),
    );
    pos = { posRevenue: Number(row?.revenue || 0), posOrderCount: row?.order_count || 0 };
  }

  return { parsed, report: reconciler.reconcile(parsed, { contractedRate, pos }) };
}

/** The wire shape: the full parse result, minus the per-order internals. */
function toPreview(fileName, parsed, report) {
  return {
    fileName,
    parsed: {
      platform: parsed.platform,
      platformLabel: parsed.platformLabel,
      // Through asDate like every other date on the wire. The parser holds a
      // real Date; handing that straight out rendered "2026-08-03T00:00:00.000Z"
      // in the preview header. Caught on live output.
      periodStart: asDate(parsed.periodStart),
      periodEnd: asDate(parsed.periodEnd),
      rowCount: parsed.rowCount,
      rowsRead: parsed.orders.length,
      rejected: parsed.rejected,
      columnsMissing: parsed.columnsMissing,
      totals: parsed.totals,
    },
    report,
  };
}

async function preview(restaurantId, opts) {
  const { parsed, report } = await parseAndReconcile(restaurantId, opts);
  return toPreview(opts.fileName, parsed, report);
}

/** Parse, reconcile, and persist. */
async function importSettlement(restaurantId, { buffer, fileName, platform = null, userId }) {
  const { parsed, report } = await parseAndReconcile(restaurantId, { buffer, fileName, platform });

  if (!parsed.orders.length) {
    throw new ValidationError(
      'No rows in that file could be read, so there is nothing to import. '
      + (parsed.rejected[0] ? `First problem: ${parsed.rejected[0].reason}.` : ''),
    );
  }

  const { settlement, inserted, duplicates } = await repo.saveSettlement(restaurantId, {
    parsed, report, fileName, userId,
  });

  return {
    id: settlement.id,
    platform: settlement.platform,
    periodStart: asDate(settlement.period_start),
    periodEnd: asDate(settlement.period_end),
    ordersImported: inserted,
    // Named plainly. "Imported 200" when 180 already existed would misrepresent
    // what just happened, and the operator would double-count the recovery.
    ordersAlreadyPresent: duplicates,
    rowsRejected: parsed.rejected.length,
    recoverable: report.totalRecoverable,
    findings: report.findings,
  };
}

async function listSettlements(restaurantId) {
  const rows = await repo.listSettlements(restaurantId, HISTORY_LIMIT);
  return {
    settlements: rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      fileName: r.file_name,
      periodStart: asDate(r.period_start),
      periodEnd: asDate(r.period_end),
      grossSales: Number(r.gross_sales),
      commission: Number(r.commission),
      netPayout: Number(r.net_payout),
      recoverable: Number(r.recoverable),
      rowsRead: r.rows_read,
      rowsRejected: r.rows_rejected,
      findings: r.findings,
      createdAt: r.created_at,
    })),
    // The empty state is a real state and says so, rather than rendering as a
    // dashboard of zeros.
    empty: rows.length === 0,
    supportedPlatforms: parser.PLATFORMS.map((p) => ({
      platform: p, label: parser.PLATFORM_SPECS[p].label,
    })),
  };
}

async function getSettlementDetail(restaurantId, id) {
  const settlement = await repo.getSettlement(restaurantId, id);
  if (!settlement) throw new NotFoundError('Settlement not found');
  const orders = await repo.listSettlementOrders(restaurantId, id);

  return {
    id: settlement.id,
    platform: settlement.platform,
    fileName: settlement.file_name,
    periodStart: asDate(settlement.period_start),
    periodEnd: asDate(settlement.period_end),
    totals: {
      grossSales: Number(settlement.gross_sales),
      commission: Number(settlement.commission),
      tds: Number(settlement.tds),
      tcs: Number(settlement.tcs),
      penalties: Number(settlement.penalties),
      discounts: Number(settlement.discounts),
      refunds: Number(settlement.refunds),
      netPayout: Number(settlement.net_payout),
    },
    recoverable: Number(settlement.recoverable),
    rowsRead: settlement.rows_read,
    rowsRejected: settlement.rows_rejected,
    findings: settlement.findings,
    orders: orders.map((o) => ({
      platformOrderId: o.platform_order_id,
      orderDate: asDate(o.order_date),
      grossAmount: Number(o.gross_amount),
      commission: Number(o.commission),
      netAmount: Number(o.net_amount),
      status: o.status,
      variance: Number(o.variance),
    })),
  };
}

module.exports = {
  getContracts,
  saveContract,
  preview,
  importSettlement,
  listSettlements,
  getSettlementDetail,
  MAX_FILE_BYTES,
  HISTORY_LIMIT,
};
