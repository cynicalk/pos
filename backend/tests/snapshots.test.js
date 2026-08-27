const db = require('../src/shared/db');
const svc = require('../src/snapshots/snapshots.service');
const { createRestaurant, deleteRestaurant } = require('./helpers');

// Daily snapshot collector (MERGE_PLAN.md Phase 0). These assertions guard the
// two properties the forecasting family will silently depend on years from now:
// the trading day is the RESTAURANT's local day, and re-running the collector
// corrects a day rather than duplicating it.

const TZ = 'Asia/Kolkata';

let restaurantId;
let tableId;
let menuItemId;

/** An order paid at a given UTC instant, with one line item. */
async function createPaidOrder(at, itemName, qty, amount) {
  const { rows: [o] } = await db.query(
    `INSERT INTO orders (restaurant_id, table_id, status, channel, created_at)
     VALUES ($1, $2, 'paid', 'dining', $3) RETURNING id`,
    [restaurantId, tableId, at],
  );
  await db.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, item_name, unit_price)
     VALUES ($1, $2, $3, $4, $5)`,
    [o.id, menuItemId, qty, itemName, amount / qty],
  );
  await db.query(
    `INSERT INTO payments (order_id, amount, method, status, created_at)
     VALUES ($1, $2, 'cash', 'completed', $3)`,
    [o.id, amount, at],
  );
  return o.id;
}

beforeAll(async () => {
  restaurantId = await createRestaurant('Snapshot Test Co');
  await db.query(
    `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, 'timezone', $2)`,
    [restaurantId, TZ],
  );
  const { rows: [t] } = await db.query(
    `INSERT INTO tables (restaurant_id, number, seats) VALUES ($1, 901, 4) RETURNING id`,
    [restaurantId],
  );
  tableId = t.id;
  const { rows: [m] } = await db.query(
    `INSERT INTO menu_items (restaurant_id, name, price, category)
     VALUES ($1, 'Test Dish', 100, 'main') RETURNING id`,
    [restaurantId],
  );
  menuItemId = m.id;
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('daily snapshot collection', () => {
  test('creating a restaurant gives it its own organization', async () => {
    const { rows } = await db.query(
      'SELECT organization_id FROM restaurants WHERE id = $1',
      [restaurantId],
    );
    expect(rows[0].organization_id).toBeTruthy();
  });

  test('attributes an order to the restaurant local trading day, not the UTC one', async () => {
    // 2025-03-10 20:00 UTC is 2025-03-11 01:30 in IST — the same dinner service,
    // but a UTC-bounded day would file it under the 10th. A restaurant's day is
    // the day it is where the restaurant is.
    await createPaidOrder('2025-03-10T20:00:00Z', 'Test Dish', 1, 500);
    await svc.collect(restaurantId);

    const { rows } = await db.query(
      `SELECT snapshot_date::text AS d, total_revenue, timezone
       FROM daily_snapshots WHERE restaurant_id = $1 AND snapshot_date = '2025-03-11'`,
      [restaurantId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].total_revenue)).toBe(500);
    expect(rows[0].timezone).toBe(TZ);

    const { rowCount: onTheTenth } = await db.query(
      `SELECT 1 FROM daily_snapshots WHERE restaurant_id = $1 AND snapshot_date = '2025-03-10'`,
      [restaurantId],
    );
    expect(onTheTenth).toBe(0);
  });

  test('re-collecting corrects a day in place instead of duplicating it', async () => {
    await createPaidOrder('2025-03-10T21:00:00Z', 'Test Dish', 2, 300);
    // Forced, because the day is older than the refresh window — `collect`
    // would correctly skip it. Running twice proves the upsert corrects in
    // place rather than inserting a second row for the same day.
    await svc.collectDay(restaurantId, '2025-03-11');
    await svc.collectDay(restaurantId, '2025-03-11');

    const { rows } = await db.query(
      `SELECT total_orders, total_revenue, avg_order_value, item_sales
       FROM daily_snapshots WHERE restaurant_id = $1 AND snapshot_date = '2025-03-11'`,
      [restaurantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total_orders).toBe(2);
    expect(Number(rows[0].total_revenue)).toBe(800);
    expect(Number(rows[0].avg_order_value)).toBe(400);
    expect(rows[0].item_sales).toEqual({ 'Test Dish': 3 });
  });

  test('cancelled orders are counted but contribute no revenue', async () => {
    await db.query(
      `INSERT INTO orders (restaurant_id, table_id, status, channel, created_at)
       VALUES ($1, $2, 'cancelled', 'dining', '2025-03-10T21:30:00Z')`,
      [restaurantId, tableId],
    );
    await svc.collectDay(restaurantId, '2025-03-11');

    const { rows } = await db.query(
      `SELECT total_orders, cancelled_orders, total_revenue
       FROM daily_snapshots WHERE restaurant_id = $1 AND snapshot_date = '2025-03-11'`,
      [restaurantId],
    );
    expect(rows[0].cancelled_orders).toBe(1);
    expect(rows[0].total_orders).toBe(2);
    expect(Number(rows[0].total_revenue)).toBe(800);
  });

  test('the routine pass leaves days older than the refresh window alone', async () => {
    // Documents the cost/correctness trade-off deliberately: rewriting all
    // history every pass gets more expensive the longer a restaurant trades,
    // so a closed day changes only when someone forces it via collectDay.
    await createPaidOrder('2025-03-10T22:00:00Z', 'Test Dish', 1, 999);
    await svc.collect(restaurantId);

    const { rows } = await db.query(
      `SELECT total_revenue FROM daily_snapshots
       WHERE restaurant_id = $1 AND snapshot_date = '2025-03-11'`,
      [restaurantId],
    );
    expect(Number(rows[0].total_revenue)).toBe(800); // unchanged

    await svc.collectDay(restaurantId, '2025-03-11');
    const { rows: after } = await db.query(
      `SELECT total_revenue FROM daily_snapshots
       WHERE restaurant_id = $1 AND snapshot_date = '2025-03-11'`,
      [restaurantId],
    );
    expect(Number(after[0].total_revenue)).toBe(1799); // picked up once forced
  });

  test('a day with no reviews stores NULL rating, never zero', async () => {
    const { rows } = await db.query(
      `SELECT avg_rating, review_count FROM daily_snapshots
       WHERE restaurant_id = $1 AND snapshot_date = '2025-03-11'`,
      [restaurantId],
    );
    expect(rows[0].avg_rating).toBeNull();
    expect(rows[0].review_count).toBe(0);
  });

  test('coverage counts only closed days and never claims forecast readiness early', async () => {
    const cov = await svc.getCoverage(restaurantId);
    expect(cov.days).toBe(1); // 2025-03-11 only; today is excluded
    expect(cov.firstDay).toBe('2025-03-11');
    expect(cov.ready).toBe(false);
    expect(cov.remainingDays).toBe(cov.requiredDays - cov.days);
  });
});
