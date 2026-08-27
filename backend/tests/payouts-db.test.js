/*
 * Phase 8 SQL coverage (MERGE_PLAN.md).
 *
 * Chiefly: re-importing an overlapping file must not double-count. An operator
 * who uploads last month's export again and sees the recoverable total double
 * has been handed a number to take to a platform that is twice what they are
 * owed.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/shared/db');
const service = require('../src/payouts/payouts.service');
const { createRestaurant, deleteRestaurant } = require('./helpers');

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'swiggy-settlement.csv'),
);

let restaurantId;

beforeAll(async () => {
  restaurantId = await createRestaurant('Payouts Test Co');
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('contracts', () => {
  test('starts with no rate on record for any platform', async () => {
    const c = await service.getContracts(restaurantId);
    expect(c.platforms.every((p) => p.commissionRatePct === null)).toBe(true);
  });

  test('accepts a rate typed as a percentage', async () => {
    // An operator reading "22%" off a contract types 22. Treating that as
    // 2200% would produce a spectacular false finding.
    await service.saveContract(restaurantId, 'swiggy', 22, null);
    const c = await service.getContracts(restaurantId);
    const swiggy = c.platforms.find((p) => p.platform === 'swiggy');
    expect(swiggy.commissionRatePct).toBe(22);
  });

  test('accepts a rate typed as a fraction', async () => {
    await service.saveContract(restaurantId, 'zomato', 0.18, null);
    const c = await service.getContracts(restaurantId);
    expect(c.platforms.find((p) => p.platform === 'zomato').commissionRatePct).toBe(18);
  });

  test('refuses an impossible rate', async () => {
    await expect(service.saveContract(restaurantId, 'swiggy', 0, null))
      .rejects.toThrow(/above 0/);
    await expect(service.saveContract(restaurantId, 'swiggy', 150, null))
      .rejects.toThrow(/above 0/);
  });

  test('refuses an unknown platform', async () => {
    await expect(service.saveContract(restaurantId, 'dunzo', 20, null))
      .rejects.toThrow(/platform must be one of/);
  });
});

describe('preview', () => {
  test('reports what was read and what was rejected without saving anything', async () => {
    const p = await service.preview(restaurantId, {
      buffer: FIXTURE, fileName: 'aug.csv',
    });

    expect(p.parsed.platform).toBe('swiggy');
    expect(p.parsed.rowsRead).toBe(5);
    expect(p.parsed.rejected).toHaveLength(3);
    // Dates cross the wire as plain strings everywhere, preview included —
    // handing out the parser's Date rendered a raw ISO timestamp in the header.
    expect(p.parsed.periodStart).toBe('2026-08-03');
    expect(p.parsed.periodEnd).toBe('2026-08-05');

    // Nothing persisted.
    const list = await service.listSettlements(restaurantId);
    expect(list.empty).toBe(true);
  });

  test('uses the contracted rate that was saved earlier', async () => {
    const p = await service.preview(restaurantId, {
      buffer: FIXTURE, fileName: 'aug.csv',
    });
    expect(p.report.commission.checked).toBe(true);
    expect(p.report.commission.contractedRatePct).toBe(22);
  });

  test('refuses a file that is not a settlement export', async () => {
    await expect(service.preview(restaurantId, {
      buffer: Buffer.from('name,qty\nrice,2\n'), fileName: 'menu.csv',
    })).rejects.toThrow(/could not tell which platform/i);
  });

  test('refuses an empty upload', async () => {
    await expect(service.preview(restaurantId, {
      buffer: Buffer.alloc(0), fileName: 'x.csv',
    })).rejects.toThrow(/no file/i);
  });

  test('does not leak the raw parse internals onto the wire', async () => {
    const p = await service.preview(restaurantId, { buffer: FIXTURE, fileName: 'aug.csv' });
    expect(p._internal).toBeUndefined();
  });
});

describe('import', () => {
  let imported;

  test('persists the readable rows and reports the rejected count', async () => {
    imported = await service.importSettlement(restaurantId, {
      buffer: FIXTURE, fileName: 'aug.csv', userId: null,
    });

    expect(imported.ordersImported).toBe(5);
    expect(imported.ordersAlreadyPresent).toBe(0);
    expect(imported.rowsRejected).toBe(3);
    expect(imported.recoverable).toBeGreaterThan(0);
  });

  test('re-importing the same file adds nothing and says so', async () => {
    // The number that matters: an operator who uploads twice must not see the
    // recoverable total double.
    const again = await service.importSettlement(restaurantId, {
      buffer: FIXTURE, fileName: 'aug-again.csv', userId: null,
    });

    expect(again.ordersImported).toBe(0);
    expect(again.ordersAlreadyPresent).toBe(5);

    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM settlement_orders WHERE restaurant_id = $1',
      [restaurantId],
    );
    expect(rows[0].n).toBe(5);
  });

  test('the rejected count is stored, not just reported at import time', async () => {
    const detail = await service.getSettlementDetail(restaurantId, imported.id);
    expect(detail.rowsRejected).toBe(3);
    expect(detail.rowsRead).toBe(5);
  });

  test('the detail view carries every order so a figure can be traced', async () => {
    const detail = await service.getSettlementDetail(restaurantId, imported.id);
    expect(detail.orders).toHaveLength(5);
    // Worst variance first, so the disputed row is the one on screen.
    expect(Math.abs(detail.orders[0].variance))
      .toBeGreaterThanOrEqual(Math.abs(detail.orders[1].variance));
  });

  test('the period stored is the one the rows describe', async () => {
    // A DATE column comes back from pg as a JS Date at LOCAL midnight, so
    // toISOString() in IST reported the period a day early. Dates cross the
    // wire as plain strings for exactly that reason.
    const detail = await service.getSettlementDetail(restaurantId, imported.id);
    expect(detail.periodStart).toBe('2026-08-03');
    expect(detail.periodEnd).toBe('2026-08-05');
    expect(typeof detail.orders[0].orderDate).toBe('string');
  });

  test('refuses a file where nothing could be read', async () => {
    const csv = 'order_id,order_date,gov,net_payout,commission,tds,tcs,penalty,'
      + 'restaurant_discount,refund\n,bad-date,xx,yy,0,0,0,0,0,0\n';
    await expect(service.importSettlement(restaurantId, {
      buffer: Buffer.from(csv), fileName: 'junk.csv', userId: null,
    })).rejects.toThrow(/nothing to import/i);
  });

  test('another restaurant cannot read our settlement', async () => {
    // A settlement is the restaurant's whole financial position for a period.
    const otherId = await createRestaurant('Someone Else Payouts');
    await expect(service.getSettlementDetail(otherId, imported.id))
      .rejects.toThrow(/not found/i);
    await deleteRestaurant(otherId);
  });

  test('the list stops reporting empty once something is imported', async () => {
    const list = await service.listSettlements(restaurantId);
    expect(list.empty).toBe(false);
    expect(list.settlements[0].rowsRejected).toBe(3);
  });
});
