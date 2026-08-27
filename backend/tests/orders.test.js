const request = require("supertest");
const app = require("../src/app");
const db = require("../src/shared/db");
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

let token;
let tableId;
let menuItemId;
let orderId;
let restaurantId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant("Orders Test");
  token = await createTestUser(restaurantId, "orders_admin@test.com", "admin");

  const { rows: [table] } = await db.query(
    `INSERT INTO tables (number, seats, restaurant_id) VALUES (99, 4, $1) RETURNING *`,
    [restaurantId],
  );
  tableId = table.id;

  const { rows: [item] } = await db.query(
    `INSERT INTO menu_items (name, price, category, restaurant_id) VALUES ('Test Item', 10.00, 'mains', $1) RETURNING *`,
    [restaurantId],
  );
  menuItemId = item.id;
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
});

describe("POST /api/orders", () => {
  it("creates an order", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tableId,
        items: [{ menuItemId, quantity: 2, notes: "No onions" }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    orderId = res.body.id;
  });

  it("rejects order with no items", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ tableId, items: [] });
    expect(res.status).toBe(400);
  });

  it("rolls back the whole order if stock deduction fails (atomic)", async () => {
    const inventoryService = require("../src/inventory/inventory.service");
    const spy = jest
      .spyOn(inventoryService, "deductForOrderTx")
      .mockRejectedValueOnce(new Error("forced deduction failure"));

    const { rows: [before] } = await db.query(
      "SELECT COUNT(*)::int AS n FROM orders WHERE restaurant_id = $1",
      [restaurantId],
    );

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ tableId, items: [{ menuItemId, quantity: 1 }] });
    expect(res.status).toBe(500);

    const { rows: [after] } = await db.query(
      "SELECT COUNT(*)::int AS n FROM orders WHERE restaurant_id = $1",
      [restaurantId],
    );
    expect(after.n).toBe(before.n); // order + line items rolled back — no new row

    spy.mockRestore();
  });
});

describe("GET /api/orders/:id", () => {
  it("retrieves the created order", async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
  });
});

describe("POST /api/orders/:id/cancel-pending", () => {
  // Regression: cancelPendingItems referenced an undefined constant
  // (CANCELLABLE_ITEM_STATUSES) and threw a ReferenceError -> 500 on every call.
  it("cancels pending items without crashing", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ tableId, items: [{ menuItemId, quantity: 1 }] });
    expect(created.status).toBe(201);

    const res = await request(app)
      .post(`/api/orders/${created.body.id}/cancel-pending`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Only item was pending -> order ends up cancelled
    expect(res.body.status).toBe("cancelled");
  });
});
