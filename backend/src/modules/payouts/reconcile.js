/**
 * Settlement reconciliation (MERGE_PLAN.md Phase 8).
 *
 * Answers one question: **did the platform pay what the file itself says they
 * should have?**
 *
 * That is deliberately narrower than the source's "leakage detection", and the
 * narrowing is the honest part. The source compared each order's actual
 * deduction against an `expectedAmount` stored on the payout line — a figure
 * that had to come from somewhere, and in practice came from the same import.
 * Comparing a file against itself finds arithmetic errors, not underpayment.
 *
 * What can be checked without inventing anything:
 *
 *  1. **Arithmetic.** gross − deductions should equal the net payout, per order
 *     and in total. A file that does not add up is the strongest possible
 *     evidence, because it needs no assumption at all.
 *
 *  2. **Commission rate**, but ONLY against a rate the operator entered from
 *     their signed contract. There is no way to derive a contracted rate from a
 *     settlement file — the file shows what was charged, which is the thing in
 *     question. With no rate on record this check abstains entirely rather than
 *     assuming an industry-standard number. An "expected commission" computed
 *     from a guessed rate would generate confident disputes about money.
 *
 *  3. **Coverage**, against POS orders in the same period — how much of what we
 *     rang up appears in the settlement at all. Approximate by nature, so it is
 *     reported as a comparison and never as a variance figure.
 */

// Below this, a difference is rounding across hundreds of orders, not a
// discrepancy worth an operator's afternoon.
const MATERIALITY_RUPEES = 1;

// Per-order arithmetic tolerance. Platforms round each line to paise.
const ORDER_TOLERANCE = 0.5;

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const round2 = (n) => Math.round(n * 100) / 100;

/** Severity from how big the gap is as a share of gross. */
function severityFor(variancePct) {
  const pct = Math.abs(variancePct);
  if (pct > 10) return 'critical';
  if (pct > 5) return 'high';
  if (pct > 2) return 'medium';
  return 'low';
}

/** What the file says should have been paid for one order. */
function expectedNet(order) {
  return round2(
    order.grossAmount
    - order.commission
    - order.tds
    - order.tcs
    - order.slaPenalty
    - order.discountRestaurant
    - order.refundAmount,
  );
}

// Deduction columns the arithmetic check subtracts. If any is absent from the
// export, gross - deductions is missing a term and the check cannot run.
const DEDUCTION_FIELDS = [
  'commission', 'tds', 'tcs', 'slaPenalty', 'discountRestaurant', 'refund',
];

/**
 * Check 1 — does the file add up?
 *
 * A positive variance means we were paid LESS than the file's own numbers say.
 * That sign convention is fixed everywhere below: positive is always money
 * missing, so a total nobody has to reason about twice.
 *
 * **Abstains when a deduction column is missing from the export**, and that
 * guard is not defensive tidiness — it was written after this check reported a
 * ₹213 shortfall against a fixture that balanced perfectly. The header read
 * `TDS 194O`, which was not in the alias list, so TDS came through as 0; the
 * check then subtracted six deductions where the file had seven and concluded
 * the platform owed money.
 *
 * A missing column makes every row look underpaid by exactly the amount we
 * cannot see. Widening the aliases fixed that one file; abstaining is what
 * makes the next unrecognised header a "we cannot check this" instead of a
 * fabricated demand sent to a platform.
 */
function checkArithmetic(orders, columnsFound = null) {
  if (columnsFound) {
    const missing = DEDUCTION_FIELDS.filter((f) => !columnsFound.includes(f));
    if (missing.length) {
      return {
        checked: false,
        reason: 'missing_deduction_columns',
        missingColumns: missing,
        note: `This export has no ${missing.join(', ')} column, so gross minus deductions `
          + 'cannot be compared against the payout — every row would look short by exactly '
          + 'the amount we cannot see. Nothing is claimed from this check.',
        orderCount: orders.length,
        discrepancies: [],
        totalVariance: 0,
        balanced: null,
      };
    }
  }

  const discrepancies = [];
  let totalVariance = 0;

  for (const order of orders) {
    const expected = expectedNet(order);
    const variance = round2(expected - order.netAmount);
    totalVariance += variance;

    if (Math.abs(variance) > ORDER_TOLERANCE) {
      discrepancies.push({
        platformOrderId: order.platformOrderId,
        orderDate: order.orderDate,
        grossAmount: order.grossAmount,
        expectedNet: expected,
        actualNet: order.netAmount,
        variance,
        // Share of THIS order, so a ₹40 gap on a ₹200 order outranks the same
        // gap on a ₹4,000 one.
        variancePct: order.grossAmount > 0
          ? round2((variance / order.grossAmount) * 100)
          : 0,
      });
    }
  }

  discrepancies.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  return {
    checked: true,
    orderCount: orders.length,
    discrepancies,
    totalVariance: round2(totalVariance),
    // Stated so a clean file is a positive result, not an empty screen.
    balanced: discrepancies.length === 0,
  };
}

/**
 * Check 2 — was commission charged at the contracted rate?
 *
 * @param contractedRate  fraction (0.22 for 22%), or null when the operator has
 *                        not recorded their contract. Null means ABSTAIN.
 */
function checkCommission(orders, totals, contractedRate) {
  if (contractedRate === null || contractedRate === undefined) {
    return {
      checked: false,
      // Named as a gap the operator can close, not as a pass.
      reason: 'no_contracted_rate',
      note: 'No contracted commission rate is on record, so CookLyt cannot say whether the '
        + 'commission charged is correct. Enter the rate from your signed platform contract '
        + 'to enable this check — it cannot be derived from the settlement file, because the '
        + 'file only shows what they actually charged.',
      effectiveRatePct: totals.grossSales > 0
        ? round2((totals.totalCommission / totals.grossSales) * 100)
        : null,
    };
  }

  const expectedCommission = round2(totals.grossSales * contractedRate);
  const variance = round2(totals.totalCommission - expectedCommission);

  const overcharged = orders.filter((o) => {
    if (o.grossAmount <= 0) return false;
    const expected = o.grossAmount * contractedRate;
    return o.commission - expected > ORDER_TOLERANCE;
  }).length;

  return {
    checked: true,
    contractedRatePct: round2(contractedRate * 100),
    effectiveRatePct: totals.grossSales > 0
      ? round2((totals.totalCommission / totals.grossSales) * 100)
      : null,
    expectedCommission,
    actualCommission: totals.totalCommission,
    // Positive = they charged MORE than contracted, i.e. money missing.
    variance,
    material: Math.abs(variance) > MATERIALITY_RUPEES,
    ordersOvercharged: overcharged,
  };
}

/**
 * Check 3 — how much of our own trade appears in this settlement?
 *
 * Deliberately a comparison, not a variance. POS orders and platform orders are
 * counted differently (channel mix, timing of when an order lands in a
 * settlement window, cancellations), so a gap here is a prompt to look, never a
 * claim that money is missing.
 */
function checkCoverage({ posRevenue, posOrderCount }, totals, orders) {
  if (posRevenue === null || posRevenue === undefined) {
    return { checked: false, reason: 'no_pos_data' };
  }

  return {
    checked: true,
    posRevenue: round2(posRevenue),
    posOrderCount,
    settlementGross: totals.grossSales,
    settlementOrderCount: orders.length,
    // Left as two numbers side by side on purpose. Dividing them would produce
    // a percentage that looks like a finding.
    note: 'CookLyt records every channel; a settlement covers one platform. These two '
      + 'numbers are not expected to match — they are shown together so a large, '
      + 'unexplained gap is visible.',
  };
}

/**
 * The full reconciliation.
 *
 * `totalRecoverable` sums ONLY what the checks could actually establish: the
 * file's own arithmetic gap, plus the commission overcharge when a contracted
 * rate is on record. When no rate is recorded, commission contributes nothing —
 * not an estimate.
 */
function reconcile(parsed, { contractedRate = null, pos = {} } = {}) {
  const arithmetic = checkArithmetic(parsed.orders, parsed.columnsFound);
  const commission = checkCommission(parsed.orders, parsed.totals, contractedRate);
  const coverage = checkCoverage(pos, parsed.totals, parsed.orders);

  const recoverable = round2(
    (arithmetic.totalVariance > 0 ? arithmetic.totalVariance : 0)
    + (commission.checked && commission.variance > 0 ? commission.variance : 0),
  );

  const variancePct = parsed.totals.grossSales > 0
    ? round2((recoverable / parsed.totals.grossSales) * 100)
    : 0;

  const findings = [];
  if (!arithmetic.checked) {
    findings.push({
      kind: 'arithmetic_unavailable',
      severity: 'medium',
      title: 'Could not check whether this settlement adds up',
      detail: arithmetic.note,
      amount: null,
    });
  }
  if (arithmetic.discrepancies.length) {
    findings.push({
      kind: 'arithmetic',
      severity: severityFor(
        parsed.totals.grossSales > 0
          ? (arithmetic.totalVariance / parsed.totals.grossSales) * 100 : 0,
      ),
      title: `${arithmetic.discrepancies.length} order(s) do not add up`,
      detail: 'Gross minus the deductions listed on the same row does not equal the payout '
        + 'recorded for that order. This needs no assumption on our part — the file '
        + 'disagrees with itself.',
      amount: round2(arithmetic.totalVariance),
    });
  }
  if (commission.checked && commission.material && commission.variance > 0) {
    findings.push({
      kind: 'commission',
      severity: severityFor(
        parsed.totals.grossSales > 0
          ? (commission.variance / parsed.totals.grossSales) * 100 : 0,
      ),
      title: `Commission charged above the contracted ${commission.contractedRatePct}%`,
      detail: `Effective rate on this settlement was ${commission.effectiveRatePct}%.`,
      amount: commission.variance,
    });
  }
  if (parsed.rejected.length) {
    findings.push({
      kind: 'unreadable_rows',
      severity: 'medium',
      title: `${parsed.rejected.length} row(s) could not be read`,
      detail: 'These rows are excluded from every figure above. Nothing was guessed to fill '
        + 'them in, so the totals describe only the rows we understood.',
      // No rupee figure: we could not read the amounts, which is the point.
      amount: null,
    });
  }

  findings.sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return {
    platform: parsed.platform,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    totals: parsed.totals,
    arithmetic,
    commission,
    coverage,
    findings,
    totalRecoverable: recoverable,
    variancePct,
    rowsRead: parsed.orders.length,
    rowsRejected: parsed.rejected.length,
  };
}

module.exports = {
  DEDUCTION_FIELDS,
  MATERIALITY_RUPEES,
  ORDER_TOLERANCE,
  SEVERITY_ORDER,
  severityFor,
  expectedNet,
  checkArithmetic,
  checkCommission,
  checkCoverage,
  reconcile,
};
