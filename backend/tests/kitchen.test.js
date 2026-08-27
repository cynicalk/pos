const request = require("supertest");
const app = require("../src/app");
const db = require("../src/shared/db");
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

let token;
let orderId;
let restaurantId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant("Kitchen Test");
  token = await createTestUser(restaurantId, "kitchen_admin@test.com", "admin");

  const { rows: [table] } = await db.query(
    `INSERT INTO tables (number, seats, restaurant_id) VALUES (97, 4, $1) RETURNING *`,
    [restaurantId],
  );

  const { rows: [item] } = await db.query(
    `INSERT INTO menu_items (name, price, category, restaurant_id) VALUES ('Kitchen Test Item', 12.00, 'mains', $1) RETURNING *`,
    [restaurantId],
  );

  const orderRes = await request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({ tableId: table.id, items: [{ menuItemId: item.id, quantity: 1 }] });
  orderId = orderRes.body.id;
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
});

describe("GET /api/kitchen/queue", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/kitchen/queue");
    expect(res.status).toBe(401);
  });

  it("returns kitchen queue with order items", async () => {
    const res = await request(app)
      .get("/api/kitchen/queue")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const entry = res.body.find((i) => i.order_id === orderId);
    expect(entry).toBeDefined();
    expect(entry.item_name).toBe("Kitchen Test Item");
  });
});

describe("PATCH /api/kitchen/:orderId/preparing", () => {
  it("marks an order as preparing", async () => {
    const res = await request(app)
      .patch(`/api/kitchen/${orderId}/preparing`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("preparing");
  });
});

describe("PATCH /api/kitchen/:orderId/ready", () => {
  it("marks an order as ready", async () => {
    const res = await request(app)
      .patch(`/api/kitchen/${orderId}/ready`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});
