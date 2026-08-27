const request = require('supertest');
const app = require('../src/app');
const db = require('../src/shared/db');
const sessionsService = require('../src/sessions/sessions.service');
const { createTestUser, createRestaurant, deleteRestaurant, resetBuckets } = require('./helpers');

let token;          // staff/admin JWT
let restaurantId;
let restaurantToken; // door-QR public_token
let tableId;
let menuItemId;

beforeAll(async () => {
  resetBuckets();
  restaurantId = await createRestaurant('Waitlist Test');
  token = await createTestUser(restaurantId, 'waitlist_admin@test.com', 'admin');

  const { rows: [r] } = await db.query('SELECT public_token FROM restaurants WHERE id = $1', [restaurantId]);
  restaurantToken = r.public_token;

  const { rows: [t] } = await db.query(
    `INSERT INTO tables (number, seats, status, restaurant_id) VALUES (97, 4, 'available', $1) RETURNING *`,
    [restaurantId],
  );
  tableId = t.id;

  const { rows: [m] } = await db.query(
    `INSERT INTO menu_items (name, price, category, restaurant_id) VALUES ('WL Item', 12.00, 'Main Course', $1) RETURNING *`,
    [restaurantId],
  );
  menuItemId = m.id;

  await db.query(`INSERT INTO settings (restaurant_id, key, value) VALUES ($1, 'eta_enabled', 'true')`, [restaurantId]);
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
});

describe('public waitlist (door QR)', () => {
  it('returns restaurant info by public token', async () => {
    const res = await request(app).get(`/api/public/restaurant/${restaurantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.restaurant_id).toBe(restaurantId);
    expect(res.body.eta_enabled).toBe(true);
  });

  it('rejects a join with no guest name', async () => {
    const res = await request(app)
      .post('/api/public/waitlist')
      .send({ restaurantToken, partySize: 2 });
    expect(res.status).toBe(400);
  });

  it('joins the queue and returns a pollable token + estimate', async () => {
    const res = await request(app)
      .post('/api/public/waitlist')
      .send({ restaurantToken, guestName: 'Test Guest', partySize: 2 });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.status).toBe('waiting');
    expect(res.body.position).toBe(1);
    // A free table exists → wait is 0.
    expect(res.body.estimatedWaitMinutes).toBe(0);

    const status = await request(app).get(`/api/public/waitlist/${res.body.token}`);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('waiting');
  });

  it('polling status is read-only — never writes per-party estimates', async () => {
    const waitlistRepo = require('../src/waitlist/waitlist.repository');
    const join = await request(app)
      .post('/api/public/waitlist')
      .send({ restaurantToken, guestName: 'Poller', partySize: 2 });
    const t = join.body.token;

    // The join legitimately recomputes+writes; the poll that follows must not.
    const spy = jest.spyOn(waitlistRepo, 'setEstimate');
    const status = await request(app).get(`/api/public/waitlist/${t}`);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('waiting');
    expect(typeof status.body.position).toBe('number');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    await request(app).post(`/api/public/waitlist/${t}/cancel`); // tidy up the queue
  });

  it('lets a guest cancel by token (idempotently)', async () => {
    const join = await request(app)
      .post('/api/public/waitlist')
      .send({ restaurantToken, guestName: 'Leaver', partySize: 2 });
    const t = join.body.token;

    const c1 = await request(app).post(`/api/public/waitlist/${t}/cancel`);
    expect(c1.status).toBe(200);
    expect(c1.body.status).toBe('cancelled');

    const c2 = await request(app).post(`/api/public/waitlist/${t}/cancel`);
    expect(c2.status).toBe(200); // already resolved — no error
  });
});

describe('staff waitlist', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/waitlist');
    expect(res.status).toBe(401);
  });

  it('lists the queue and seats a party (occupying the table)', async () => {
    const list = await request(app).get('/api/waitlist').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const waiting = list.body.find((e) => e.guestName === 'Test Guest');
    expect(waiting).toBeTruthy();

    const seat = await request(app)
      .post(`/api/waitlist/${waiting.id}/seat`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId });
    expect(seat.status).toBe(200);
    expect(seat.body.status).toBe('seated');

    const { rows: [tbl] } = await db.query('SELECT status FROM tables WHERE id = $1', [tableId]);
    expect(tbl.status).toBe('occupied');
  });
});

describe('session logging links the seated party', () => {
  it('records party_size + waitlist_id when the table frees', async () => {
    // The seated party (party of 2) orders, then the table is paid/freed.
    const { rows: [w] } = await db.query(
      `SELECT id FROM waitlist WHERE restaurant_id = $1 AND status = 'seated' AND assigned_table_id = $2 LIMIT 1`,
      [restaurantId, tableId],
    );
    // Backdate the seating so it precedes the order in the linkage window.
    await db.query(`UPDATE waitlist SET seated_at = NOW() - INTERVAL '50 minutes' WHERE id = $1`, [w.id]);

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableId, items: [{ menuItemId, quantity: 1 }] });
    expect(order.status).toBe(201);
    await db.query(`UPDATE orders SET created_at = NOW() - INTERVAL '45 minutes', status = 'paid' WHERE id = $1`, [order.body.id]);

    const session = await sessionsService.recordSessionEnd(tableId, restaurantId);
    expect(session).toBeTruthy();
    expect(session.party_size).toBe(2);
    expect(session.waitlist_id).toBe(w.id);
    expect(parseFloat(session.duration_minutes)).toBeGreaterThan(0);
    expect(session.ended_reason).toBe('paid');

    // Idempotent: a second free event must not write a duplicate session.
    const again = await sessionsService.recordSessionEnd(tableId, restaurantId);
    expect(again).toBeNull();
  });
});
