const request = require("supertest");
const app = require("../src/app");
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

let adminToken;
let createdItemId;
let restaurantId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant("Menu Test");
  adminToken = await createTestUser(restaurantId, "menutest_admin@test.com", "admin");
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
});

describe("GET /api/menu", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/menu");
    expect(res.status).toBe(401);
  });

  it("returns menu items", async () => {
    const res = await request(app)
      .get("/api/menu")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/menu", () => {
  it("creates a menu item as admin", async () => {
    const res = await request(app)
      .post("/api/menu")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test Burger", price: 9.99, category: "mains" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Burger");
    createdItemId = res.body.id;
  });

  it("rejects item without name", async () => {
    const res = await request(app)
      .post("/api/menu")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ price: 5.0 });
    expect(res.status).toBe(400);
  });
});
