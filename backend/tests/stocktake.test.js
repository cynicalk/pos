const request = require("supertest");
const app = require("../src/app");
const db = require("../src/shared/db");
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

let token;
let restaurantId;
let ingredientId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant("Stocktake Test");
  token = await createTestUser(restaurantId, "stocktake_admin@test.com", "admin");

  const { rows: [ing] } = await db.query(
    `INSERT INTO ingredients (restaurant_id, name, unit, stock_on_hand, latest_unit_cost)
     VALUES ($1, 'Count Flour', 'kg', 50, 2.00) RETURNING id`,
    [restaurantId],
  );
  ingredientId = ing.id;
});

afterAll(async () => {
  await db.query(
    `DELETE FROM stock_count_lines WHERE stock_count_id IN (SELECT id FROM stock_counts WHERE restaurant_id = $1)`,
    [restaurantId],
  );
  await deleteRestaurant(restaurantId);
});

describe("stocktake lifecycle", () => {
  let countId;

  it("creates an open count pre-populated with active ingredients", async () => {
    const res = await request(app)
      .post("/api/stocktake")
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Week 1 open" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    countId = res.body.id;

    const get = await request(app)
      .get(`/api/stocktake/${countId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    const line = get.body.lines.find((l) => l.ingredient_id === ingredientId);
    expect(line).toBeTruthy();
    expect(line.counted_qty).toBeNull();
  });

  it("saves counted quantities", async () => {
    const res = await request(app)
      .patch(`/api/stocktake/${countId}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ lines: [{ ingredientId, countedQty: 42 }] });
    expect(res.status).toBe(200);
    const line = res.body.lines.find((l) => l.ingredient_id === ingredientId);
    expect(parseFloat(line.counted_qty)).toBe(42);
  });

  it("rejects negative counts", async () => {
    const res = await request(app)
      .patch(`/api/stocktake/${countId}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ lines: [{ ingredientId, countedQty: -5 }] });
    expect(res.status).toBe(400);
  });

  it("finalizes the count and snapshots system stock", async () => {
    const res = await request(app)
      .post(`/api/stocktake/${countId}/finalize`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("finalized");
    expect(res.body.counted_at).toBeTruthy();
  });

  it("refuses edits and deletion after finalize", async () => {
    const edit = await request(app)
      .patch(`/api/stocktake/${countId}/lines`)
      .set("Authorization", `Bearer ${token}`)
      .send({ lines: [{ ingredientId, countedQty: 10 }] });
    expect(edit.status).toBe(400);

    const del = await request(app)
      .delete(`/api/stocktake/${countId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(400);
  });

  it("lists counts for the restaurant", async () => {
    const res = await request(app)
      .get("/api/stocktake")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.id === countId)).toBe(true);
  });
});
