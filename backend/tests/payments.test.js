const request = require("supertest");
const app = require("../src/app");
const db = require("../src/shared/db");
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

let token;
let orderId;
let restaurantId;
let tableId;
let menuItemId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant("Payments Test");
  token = await createTestUser(restaurantId, "payments_admin@test.com", "admin");

  const { rows: [table] } = await db.query(
    `INSERT INTO tables (number, seats, restaurant_id) VALUES (98, 4, $1) RETURNING *`,
    [restaurantId],
  );
  tableId = table.id;

  const { rows: [item] } = await db.query(
    `INSERT INTO menu_items (name, price, category, restaurant_id) VALUES ('Payment Test Item', 15.00, 'mains', $1) RETURNING *`,
    [restaurantId],
  );
  menuItemId = item.id;

  const orderRes = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({ tableId: table.id, items: [{ menuItemId: item.id, quantity: 1 }] });
  orderId = orderRes.body.id;
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
});

describe("POST /api/payments/:orderId", () => {
  it("processes a cash payment", async () => {
    const res = await request(app)
      .post(`/api/payments/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "cash", amountTendered: 20.0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.charged).toBe(15);
    expect(res.body.change).toBe(5);
  });

  it("rejects a second payment on a paid order", async () => {
    const res = await request(app)
      .post(`/api/payments/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "cash", amountTendered: 20.0 });
    expect(res.status).toBe(400);
  });

  it("rejects invalid payment method", async () => {
    const res = await request(app)
      .post(`/api/payments/${orderId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "bitcoin" });
    expect(res.status).toBe(400);
  });
});

describe("loyalty oversell guard (CHECK points_balance >= 0)", () => {
  // Settlement now runs inside the payment transaction; the DB CHECK (migration
  // 071) makes a redeem that would go negative fail and roll back atomically.
  it("rejects a redemption that would drive the balance negative and leaves it unchanged", async () => {
    const loyaltyRepo = require("../src/loyalty/loyalty.repository");
    const { rows: [c] } = await db.query(
      `INSERT INTO loyalty_customers (restaurant_id, phone, name, points_balance)
       VALUES ($1, '5550001111', 'Oversell', 10) RETURNING *`,
      [restaurantId],
    );

    await expect(
      loyaltyRepo.addTransaction(restaurantId, {
        customerId: c.id, orderId: null, type: "redeem", points: -50, description: "test oversell",
      }),
    ).rejects.toThrow();

    // The failed transaction rolled back — balance is still 10.
    const { rows: [after] } = await db.query(
      "SELECT points_balance FROM loyalty_customers WHERE id = $1", [c.id],
    );
    expect(after.points_balance).toBe(10);
  });
});

describe("concurrent payments on the same order", () => {
  // The order-row lock must serialize two simultaneous payments so the order is
  // charged exactly once — without it both requests could pass the status check
  // and double-charge.
  it("lets only one of two simultaneous payments succeed", async () => {
    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ tableId, items: [{ menuItemId, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    const newOrderId = orderRes.body.id;

    const pay = () =>
      request(app)
        .post(`/api/payments/${newOrderId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ method: "cash", amountTendered: 20.0 });

    const [a, b] = await Promise.all([pay(), pay()]);

    // Exactly one success (200) and one rejection (400).
    expect([a.status, b.status].sort()).toEqual([200, 400]);

    // And exactly one completed payment row exists for the order.
    const { rows } = await db.query(
      "SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1 AND status = 'completed'",
      [newOrderId],
    );
    expect(rows[0].n).toBe(1);
  });
});
