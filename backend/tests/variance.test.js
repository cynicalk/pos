const request = require("supertest");
const app = require("../src/app");
const db = require("../src/shared/db");
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

// Clean numbers (see the variance methodology worked example):
//   opening 100, purchase 20 @ 2.50, closing 110  -> actual usage 10 kg
//   50 sold × 0.1 kg recipe                        -> theoretical usage 5 kg
//   standard price 2.00, actual price 2.50
//   theo cost 10, actual cost 25, total variance 15
//   usage = (10-5)*2 = 10 ; price = (2.50-2)*10 = 5 ; 10 + 5 = 15
//   sales 500 -> variance is 3% of sales
let token;
let restaurantId;
let openingId;
let closingId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant("Variance Test");
  token = await createTestUser(restaurantId, "variance_admin@test.com", "admin");

  const { rows: [ing] } = await db.query(
    `INSERT INTO ingredients (restaurant_id, name, unit, stock_on_hand, latest_unit_cost)
     VALUES ($1, 'Var Flour', 'kg', 110, 2.00) RETURNING id`, [restaurantId]);
  const { rows: [rec] } = await db.query(
    `INSERT INTO recipes (restaurant_id, name) VALUES ($1, 'Var Recipe') RETURNING id`, [restaurantId]);
  await db.query(
    `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, cost_per_unit)
     VALUES ($1, $2, 0.1, 'kg', 2.00)`, [rec.id, ing.id]);
  const { rows: [mi] } = await db.query(
    `INSERT INTO menu_items (name, price, category, restaurant_id, recipe_id)
     VALUES ('Var Item', 10, 'Mains', $1, $2) RETURNING id`, [restaurantId, rec.id]);

  // A paid order + purchase inside the count window (1h ago)
  const { rows: [ord] } = await db.query(
    `INSERT INTO orders (restaurant_id, status, channel, created_at)
     VALUES ($1, 'paid', 'dining', NOW() - INTERVAL '1 hour') RETURNING id`, [restaurantId]);
  await db.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, status) VALUES ($1, $2, 50, 'served')`,
    [ord.id, mi.id]);
  await db.query(
    `INSERT INTO payments (order_id, amount, method, status, total_charged, created_at)
     VALUES ($1, 500, 'cash', 'completed', 500, NOW() - INTERVAL '1 hour')`, [ord.id]);
  await db.query(
    `INSERT INTO inventory_transactions (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost, created_at)
     VALUES ($1, $2, 'PURCHASE', 20, 2.50, NOW() - INTERVAL '1 hour')`, [restaurantId, ing.id]);

  // Finalized opening (2h ago, 100) and closing (now, 110) counts
  const { rows: [oc] } = await db.query(
    `INSERT INTO stock_counts (restaurant_id, label, status, counted_at)
     VALUES ($1, 'open', 'finalized', NOW() - INTERVAL '2 hours') RETURNING id`, [restaurantId]);
  await db.query(`INSERT INTO stock_count_lines (stock_count_id, ingredient_id, counted_qty, unit) VALUES ($1,$2,100,'kg')`, [oc.id, ing.id]);
  const { rows: [cc] } = await db.query(
    `INSERT INTO stock_counts (restaurant_id, label, status, counted_at)
     VALUES ($1, 'close', 'finalized', NOW()) RETURNING id`, [restaurantId]);
  await db.query(`INSERT INTO stock_count_lines (stock_count_id, ingredient_id, counted_qty, unit) VALUES ($1,$2,110,'kg')`, [cc.id, ing.id]);
  openingId = oc.id;
  closingId = cc.id;
});

afterAll(async () => {
  await db.query(`DELETE FROM recipe_ingredients WHERE recipe_id IN (SELECT id FROM recipes WHERE restaurant_id = $1)`, [restaurantId]);
  await db.query(`DELETE FROM stock_count_lines WHERE stock_count_id IN (SELECT id FROM stock_counts WHERE restaurant_id = $1)`, [restaurantId]);
  await deleteRestaurant(restaurantId);
});

describe("GET /api/reports/food-cost-variance", () => {
  it("decomposes ingredient variance into price and usage components", async () => {
    const res = await request(app)
      .get(`/api/reports/food-cost-variance?closingCountId=${closingId}&openingCountId=${openingId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.rows.find((r) => r.ingredient_name === "Var Flour");
    expect(row).toBeTruthy();
    expect(row.theoretical_qty).toBeCloseTo(5, 3);
    expect(row.actual_qty).toBeCloseTo(10, 3);
    expect(row.dollar_variance).toBeCloseTo(15, 2);
    expect(row.usage_variance).toBeCloseTo(10, 2);
    expect(row.price_variance).toBeCloseTo(5, 2);
    // price + usage must reconcile to the total dollar variance
    expect(row.price_variance + row.usage_variance).toBeCloseTo(row.dollar_variance, 2);

    expect(res.body.totals.variance_pct_of_sales).toBeCloseTo(3, 2);
    expect(res.body.totals.theoretical_cost).toBeCloseTo(10, 2);
    expect(res.body.totals.actual_cost).toBeCloseTo(25, 2);
  });

  it("requires a finalized closing count", async () => {
    const res = await request(app)
      .get(`/api/reports/food-cost-variance?closingCountId=${restaurantId}`) // not a count id
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
