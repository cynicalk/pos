const request = require("supertest");
const app = require("../src/app");
const db = require("../src/shared/db");
const bcrypt = require("bcrypt");
const { extractToken, createRestaurant, deleteRestaurant, resetBuckets } = require("./helpers");

// The audit writer is fire-and-forget, so poll briefly for the row to appear.
async function waitForAuditRow(sql, params, { tries = 20, delayMs = 50 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { rows } = await db.query(sql, params);
    if (rows.length) return rows[0];
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

let restaurantId;

beforeAll(async () => {
  resetBuckets();
  await db.query(`DELETE FROM users WHERE email = 'admin@test.com'`);
  restaurantId = await createRestaurant("Auth Test");
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
});

describe("POST /api/auth/login", () => {
  it("returns 401 for unknown user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@test.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("sets a cookie and returns user info for valid credentials", async () => {
    const hashed = await bcrypt.hash("password123", 10);
    await db.query(
      // email_verified must be true — login rejects unverified accounts (migration 047)
      `INSERT INTO users (email, password, role, restaurant_id, password_changed_at, email_verified)
       VALUES ($1, $2, 'admin', $3, NOW() - INTERVAL '1 hour', true)`,
      ["admin@test.com", hashed, restaurantId],
    );

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe("admin@test.com");
    expect(extractToken(res)).toBeTruthy();
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "password123" });
    token = extractToken(res);
  });

  it("returns user profile with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("admin@test.com");
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("failed-login auditing", () => {
  const probeEmail = "audit-probe@test.com";

  afterAll(async () => {
    await db.query("DELETE FROM audit_logs WHERE description LIKE $1", [`%${probeEmail}%`]);
  });

  // Regression: failed logins pass actorId=null, and the audit writer used to
  // early-return on a null actor (actor_id was NOT NULL), silently dropping them.
  it("records a login_failed entry with a null actor", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: probeEmail, password: "definitely-wrong" });
    expect(res.status).toBe(401);

    const row = await waitForAuditRow(
      `SELECT actor_id, action FROM audit_logs
       WHERE action = 'login_failed' AND description LIKE $1
       ORDER BY created_at DESC LIMIT 1`,
      [`%${probeEmail}%`],
    );
    expect(row).toBeTruthy();        // stored, not silently dropped
    expect(row.actor_id).toBeNull(); // anonymous attempt → null actor
  });
});
