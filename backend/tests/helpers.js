const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../src/shared/db');
const { resetBuckets } = require('../src/shared/middleware/rateLimit');

// Login sets the token as an HttpOnly cookie, not in the response body.
// This extracts the raw JWT from the Set-Cookie header so tests can pass it
// via Authorization header on subsequent requests.
// Used only in auth.test.js which specifically tests the login endpoint.
function extractToken(res) {
  const cookies = res.headers['set-cookie'] || [];
  for (const c of cookies) {
    const m = c.match(/pos_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

// Creates a user and returns a signed JWT directly — no HTTP login needed.
// Feature tests (menu, orders, tables…) use this so they don't touch the
// login endpoint or trigger its rate limiter.
async function createTestUser(restaurantId, email, role = 'admin') {
  const hashed = await bcrypt.hash('test-password', 4); // low rounds: speed over security
  const { rows: [user] } = await db.query(
    // Backdate password_changed_at: PG's clock can be 1–2 s ahead of Node's
    // (Docker clock skew), so the DEFAULT now() would produce a pca > iat and
    // trigger the token-revocation check. Setting it 1 hour in the past avoids
    // this regardless of skew direction or magnitude.
    `INSERT INTO users (email, password, role, restaurant_id, password_changed_at)
     VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 hour') RETURNING id`,
    [email, hashed, role, restaurantId],
  );
  return jwt.sign(
    { userId: user.id, role, restaurantId },
    process.env.JWT_SECRET,
    { expiresIn: '8h' },
  );
}

async function createRestaurant(name) {
  const { rows: [r] } = await db.query(
    `INSERT INTO restaurants (name) VALUES ($1) RETURNING id`,
    [name],
  );
  return r.id;
}

async function deleteRestaurant(id) {
  if (id) await db.query('DELETE FROM restaurants WHERE id = $1', [id]);
}

module.exports = { extractToken, createTestUser, createRestaurant, deleteRestaurant, resetBuckets };
