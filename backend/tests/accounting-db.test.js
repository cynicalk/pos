/*
 * Accounting bridge SQL coverage. The pure suite proves the vouchers balance
 * given clean input; this proves the query feeds them clean input — that day
 * grouping honours the timezone (the bug that once hardcoded IST), and that a
 * real day's payments come out as a balanced voucher.
 */
const db = require('../src/shared/db');
const service = require('../src/accounting/accounting.service');
const { createRestaurant, deleteRestaurant } = require('./helpers');

let restaurantId;

// Seed one paid order with a completed payment at an exact instant.
async function seedSale(at, { method, subtotal, tax }) {
  const { rows: [o] } = await db.query(
    `INSERT INTO orders (restaurant_id, status, created_at) VALUES ($1, 'paid', $2) RETURNING id`,
    [restaurantId, at],
  );
  const total = subtotal + tax;
  await db.query(
    `INSERT INTO payments (order_id, method, status, amount, subtotal, tax_amount, total_charged)
     VALUES ($1, $2, 'completed', $3, $4, $5, $6)`,
    [o.id, method, total, subtotal, tax, total],
  );
  return o.id;
}

beforeAll(async () => {
  restaurantId = await createRestaurant('Accounting Test Co');
  // A quiet day: two tenders, no discounts, so billed == collected exactly.
  await seedSale('2026-08-20T06:00:00Z', { method: 'cash', subtotal: 1000, tax: 50 });
  await seedSale('2026-08-20T07:00:00Z', { method: 'upi', subtotal: 500, tax: 25 });
  // An order at 20:00 UTC = 01:30 next day in IST — the case the tz fix is about.
  await seedSale('2026-08-20T20:00:00Z', { method: 'card', subtotal: 200, tax: 10 });
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('balance', () => {
  test('a real day comes out as a balanced voucher', async () => {
    const p = await service.preview(restaurantId, { from: '2026-08-19', to: '2026-08-22', tz: 'UTC' });
    expect(p.totals.balanced).toBe(true);
    for (const v of p.vouchers) expect(v.debit).toBe(v.credit);
    // The 20 Aug voucher: 1000+500+200 sales, 50+25+10 tax, three tenders.
    const aug20 = p.vouchers.find((v) => v.date === '2026-08-20');
    expect(aug20).toBeTruthy();
    expect(aug20.lines.find((l) => l.ledger === 'Sales').credit).toBe(1700);
    expect(aug20.lines.find((l) => l.ledger === 'Output Tax').credit).toBe(85);
    // No discount line: nothing was given away.
    expect(aug20.lines.some((l) => l.ledger === 'Discounts Allowed')).toBe(false);
  });
});

describe('timezone grouping (the fix)', () => {
  test('the late order lands on a different day under IST than under UTC', async () => {
    const utc = await service.preview(restaurantId, { from: '2026-08-19', to: '2026-08-22', tz: 'UTC' });
    const ist = await service.preview(restaurantId, { from: '2026-08-19', to: '2026-08-22', tz: 'Asia/Kolkata' });

    // Under UTC all three sales are on the 20th → one voucher.
    const utc20 = utc.vouchers.find((v) => v.date === '2026-08-20');
    expect(utc.vouchers.filter((v) => v.date === '2026-08-21')).toHaveLength(0);

    // Under IST the 20:00Z order shifts to the 21st → a second voucher appears,
    // and the 20th's takings shrink by that order's total.
    const ist21 = ist.vouchers.find((v) => v.date === '2026-08-21');
    expect(ist21).toBeTruthy();
    expect(ist21.credit).toBe(210); // 200 sales + 10 tax
    const ist20 = ist.vouchers.find((v) => v.date === '2026-08-20');
    expect(ist20.credit).toBeLessThan(utc20.credit);
    // Both frames still balance.
    expect(ist.totals.balanced).toBe(true);
  });
});

describe('export formats', () => {
  test('tally XML carries the voucher and journal CSV has a header row', async () => {
    const xml = await service.exportFile(restaurantId, { from: '2026-08-19', to: '2026-08-22', tz: 'UTC', format: 'tally' });
    expect(xml.contentType).toMatch(/xml/);
    expect(xml.body).toContain('<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>');
    expect(xml.body).toContain('<DATE>20260820</DATE>');

    const csv = await service.exportFile(restaurantId, { from: '2026-08-19', to: '2026-08-22', tz: 'UTC', format: 'journal' });
    expect(csv.contentType).toMatch(/csv/);
    expect(csv.body.split('\r\n')[0]).toBe('Date,Voucher Type,Ledger,Debit,Credit,Narration');
  });

  test('an unknown format is refused', async () => {
    await expect(service.exportFile(restaurantId, { format: 'pdf' })).rejects.toThrow(/format must be/);
  });
});
