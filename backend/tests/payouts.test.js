/*
 * Phase 8 pure tests (MERGE_PLAN.md).
 *
 * The through-line: this code is about money someone will demand back from a
 * platform. Every test below asks the same question — can it produce a figure
 * that isn't real?
 */

const fs = require('fs');
const path = require('path');
const { parseRows, parseObjects } = require('../src/modules/payouts/csv');
const parser = require('../src/modules/payouts/parse');
const reconciler = require('../src/modules/payouts/reconcile');

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'swiggy-settlement.csv'), 'utf8',
);

describe('CSV reading', () => {
  test('a quoted field keeps its commas', () => {
    // The failure this prevents: a dish name with a comma shifts every later
    // column by one, turning a commission figure into a TDS figure silently.
    const [row] = parseRows('a,"b,c",d');
    expect(row).toEqual(['a', 'b,c', 'd']);
  });

  test('escaped quotes survive', () => {
    const [row] = parseRows('a,"say ""hi""",c');
    expect(row).toEqual(['a', 'say "hi"', 'c']);
  });

  test('a newline inside quotes does not end the row', () => {
    const rows = parseRows('a,"line1\nline2",c\nd,e,f');
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe('line1\nline2');
  });

  test('CRLF and a BOM are handled', () => {
    const rows = parseRows('﻿a,b\r\nc,d\r\n');
    expect(rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  test('a short row is counted as malformed rather than silently padded', () => {
    const { rows, malformed } = parseObjects('a,b,c\n1,2\n');
    expect(malformed).toBe(1);
    expect(rows[0].c).toBe('');
  });
});

describe('reading values', () => {
  test('an unreadable amount is null, not zero', () => {
    // Zero would read as "they charged us nothing", which is money in our
    // favour — the most dangerous possible default.
    expect(parser.parseAmount('not-a-number')).toBeNull();
    expect(parser.parseAmount('12abc')).toBeNull();
  });

  test('an empty cell is a genuine zero', () => {
    expect(parser.parseAmount('')).toBe(0);
    expect(parser.parseAmount('-')).toBe(0);
    expect(parser.parseAmount('N/A')).toBe(0);
  });

  test('currency symbols and thousands separators are stripped', () => {
    expect(parser.parseAmount('₹1,200.50')).toBe(1200.5);
  });

  test('accounting parentheses mean negative', () => {
    expect(parser.parseAmount('(1,234.50)')).toBe(-1234.5);
  });

  test('dates are read day-first, as Indian exports write them', () => {
    // new Date('03/04/2026') is 4 March in some runtimes and 3 April in others.
    // Getting this wrong moves the settlement period by a month, silently.
    const d = parser.parseDate('03/04/2026');
    expect(d.getUTCDate()).toBe(3);
    expect(d.getUTCMonth()).toBe(3); // April
  });

  test('an impossible date is rejected, not rolled over', () => {
    // 31/02 would otherwise become 3 March.
    expect(parser.parseDate('31/02/2026')).toBeNull();
    expect(parser.parseDate('01/13/2026')).toBeNull();
  });

  test('an unreadable date is null, never today', () => {
    expect(parser.parseDate('sometime')).toBeNull();
    expect(parser.parseDate('')).toBeNull();
  });

  test('item cells parse into lines', () => {
    const items = parser.parseItemsCell('Butter Naan x2 @ 60; Paneer Tikka x1 @ 240');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      itemName: 'Butter Naan', quantity: 2, unitPrice: 60, lineTotal: 120,
    });
  });
});

describe('platform detection', () => {
  test('recognises the Swiggy fixture', () => {
    const parsed = parser.parseSettlement(FIXTURE);
    expect(parsed.platform).toBe('swiggy');
  });

  test('refuses a file that is not a settlement export', () => {
    expect(() => parser.parseSettlement('name,qty\nrice,2\n'))
      .toThrow(parser.UnrecognizedSettlementError);
  });

  test('refuses an empty file rather than importing nothing quietly', () => {
    expect(() => parser.parseSettlement('')).toThrow(parser.UnrecognizedSettlementError);
  });

  test('refuses a file whose columns are too few to identify at all', () => {
    const csv = 'order_id,order_date,gov\nSW1,03/08/2026,100\n';
    expect(() => parser.parseSettlement(csv)).toThrow(/could not tell which platform/i);
  });

  test('refuses a named platform whose export is missing a needed column', () => {
    // Detection is bypassed, so this exercises the second guard: the file is
    // Swiggy-shaped but has no payout column, and there is nothing to
    // reconcile against. Refusing beats importing gross figures alone.
    const csv = 'order_id,order_date,gov,commission\nSW1,03/08/2026,100,22\n';
    expect(() => parser.parseSettlement(csv, { platform: 'swiggy' }))
      .toThrow(/missing column/i);
  });

  test('refuses a platform it has no format for', () => {
    expect(() => parser.parseSettlement('a,b\n1,2\n', { platform: 'petpooja' }))
      .toThrow(/no settlement format is known/i);
  });
});

describe('parsing the fixture', () => {
  const parsed = parser.parseSettlement(FIXTURE);

  test('reads the rows it understands and rejects the rest with reasons', () => {
    expect(parsed.orders).toHaveLength(5);
    expect(parsed.rejected).toHaveLength(3);
    const reasons = parsed.rejected.map((r) => r.reason).join(' | ');
    expect(reasons).toMatch(/no order id/);
    expect(reasons).toMatch(/unreadable date/);
    expect(reasons).toMatch(/unreadable gross amount/);
  });

  test('every rejection names the line so it can be found in the file', () => {
    for (const r of parsed.rejected) expect(typeof r.line).toBe('number');
  });

  test('a rejected row contributes nothing to any total', () => {
    // 5 readable rows: 1200 + 850 + 2400 + 600 + 1500
    expect(parsed.totals.grossSales).toBe(6550);
  });

  test('the TDS column is found despite its header spelling', () => {
    // "TDS 194O". When this alias was missing, TDS read as 0 and the
    // arithmetic check reported a fabricated shortfall.
    expect(parsed.totals.totalTds).toBeGreaterThan(0);
    expect(parsed.columnsMissing).not.toContain('tds');
  });

  test('the period comes from the rows that parsed, not from today', () => {
    expect(parsed.periodStart.toISOString().slice(0, 10)).toBe('2026-08-03');
    expect(parsed.periodEnd.toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  test('a dish name containing a comma stays intact', () => {
    const order = parsed.orders.find((o) => o.platformOrderId === 'SW10001');
    expect(order.items.map((i) => i.itemName)).toContain('Paneer Tikka, Malai');
  });

  test('an empty file yields no period rather than an invented one', () => {
    const csv = 'order_id,order_date,gov,net_payout\n';
    const empty = parser.parseSettlement(csv);
    expect(empty.periodStart).toBeNull();
    expect(empty.periodEnd).toBeNull();
  });
});

describe('reconciliation', () => {
  const parsed = parser.parseSettlement(FIXTURE);

  test('finds the rows where the file disagrees with itself', () => {
    const r = reconciler.reconcile(parsed);
    expect(r.arithmetic.checked).toBe(true);
    expect(r.arithmetic.discrepancies.length).toBeGreaterThan(0);
    expect(r.arithmetic.discrepancies[0].platformOrderId).toBe('SW10005');
  });

  test('a file that balances is reported as balanced, not as an empty screen', () => {
    const clean = {
      ...parsed,
      orders: parsed.orders.filter((o) => o.platformOrderId !== 'SW10005'),
    };
    const r = reconciler.checkArithmetic(clean.orders, parsed.columnsFound);
    expect(r.balanced).toBe(true);
    expect(r.checked).toBe(true);
  });

  test('ABSTAINS on arithmetic when a deduction column is missing', () => {
    // The defect this pins: a missing TDS column made every row look short by
    // exactly the amount we could not see, and the check reported a ₹213
    // shortfall against a fixture that balanced perfectly.
    const found = parsed.columnsFound.filter((c) => c !== 'tds');
    const r = reconciler.checkArithmetic(parsed.orders, found);
    expect(r.checked).toBe(false);
    expect(r.totalVariance).toBe(0);
    expect(r.balanced).toBeNull();
    expect(r.missingColumns).toContain('tds');
  });

  test('abstains on commission when no contracted rate is on record', () => {
    const r = reconciler.reconcile(parsed);
    expect(r.commission.checked).toBe(false);
    expect(r.commission.reason).toBe('no_contracted_rate');
    // It may report the EFFECTIVE rate — that is measured — but never an
    // expected one.
    expect(r.commission.expectedCommission).toBeUndefined();
  });

  test('an unrecorded rate contributes nothing to the recoverable total', () => {
    const without = reconciler.reconcile(parsed);
    const with20 = reconciler.reconcile(parsed, { contractedRate: 0.20 });
    expect(with20.totalRecoverable).toBeGreaterThan(without.totalRecoverable);
  });

  test('checks commission only against a rate the operator entered', () => {
    const r = reconciler.reconcile(parsed, { contractedRate: 0.20 });
    expect(r.commission.checked).toBe(true);
    expect(r.commission.contractedRatePct).toBe(20);
    expect(r.commission.variance).toBeGreaterThan(0);
  });

  test('commission charged BELOW contract is not counted as recoverable', () => {
    // A generous platform is not money we can demand back.
    const r = reconciler.reconcile(parsed, { contractedRate: 0.50 });
    expect(r.commission.variance).toBeLessThan(0);
    expect(r.totalRecoverable).toBe(
      Math.round(Math.max(r.arithmetic.totalVariance, 0) * 100) / 100,
    );
  });

  test('unreadable rows are a finding with no rupee figure attached', () => {
    const r = reconciler.reconcile(parsed);
    const finding = r.findings.find((f) => f.kind === 'unreadable_rows');
    expect(finding).toBeTruthy();
    // We could not read the amounts — that is the entire point.
    expect(finding.amount).toBeNull();
  });

  test('coverage abstains without POS data and never divides the two numbers', () => {
    const r = reconciler.reconcile(parsed);
    expect(r.coverage.checked).toBe(false);

    const withPos = reconciler.reconcile(parsed, {
      pos: { posRevenue: 9000, posOrderCount: 12 },
    });
    expect(withPos.coverage.checked).toBe(true);
    expect(withPos.coverage.posRevenue).toBe(9000);
    // Deliberately two numbers side by side, not a percentage that looks like
    // a finding.
    expect(withPos.coverage.coveragePct).toBeUndefined();
  });

  test('a settlement with no orders produces no findings and no recoverable', () => {
    const empty = parser.parseSettlement('order_id,order_date,gov,net_payout,commission,tds,tcs,penalty,restaurant_discount,refund\n');
    const r = reconciler.reconcile(empty);
    expect(r.totalRecoverable).toBe(0);
    expect(r.variancePct).toBe(0);
  });

  test('severity scales with the share of gross at stake', () => {
    expect(reconciler.severityFor(12)).toBe('critical');
    expect(reconciler.severityFor(7)).toBe('high');
    expect(reconciler.severityFor(3)).toBe('medium');
    expect(reconciler.severityFor(0.5)).toBe('low');
    // Sign must not change the severity — a large gap either way is large.
    expect(reconciler.severityFor(-12)).toBe('critical');
  });
});
