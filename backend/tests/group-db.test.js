/*
 * Phase 7 SQL-level coverage (MERGE_PLAN.md).
 *
 * Most of this file is about the grant boundary, because that is the part where
 * a mistake is a data leak rather than a wrong number. Migration 072 defined the
 * rule and nothing consumed it until now; these tests are the first thing that
 * actually holds it to it.
 */

const db = require('../src/shared/db');
const service = require('../src/group/group.service');
const repo = require('../src/group/group.repository');
const { createRestaurant, deleteRestaurant } = require('./helpers');

let orgId;
let andheri;
let bandra;
let colaba;
let otherOrgOutlet;
let ownerId;
let managerId;

const createUser = async (restaurantId, email) => {
  const { rows: [u] } = await db.query(
    `INSERT INTO users (email, password, role, restaurant_id, password_changed_at)
     VALUES ($1, 'x', 'admin', $2, NOW() - INTERVAL '1 hour') RETURNING id`,
    [email, restaurantId],
  );
  return u.id;
};

beforeAll(async () => {
  // The trigger from migration 072 gives the first restaurant its own org; the
  // other two join it explicitly, which is what adding an outlet means.
  andheri = await createRestaurant('Andheri');
  const { rows: [r] } = await db.query(
    'SELECT organization_id FROM restaurants WHERE id = $1', [andheri],
  );
  orgId = r.organization_id;

  const addOutlet = async (name) => {
    const { rows: [row] } = await db.query(
      'INSERT INTO restaurants (name, organization_id) VALUES ($1, $2) RETURNING id',
      [name, orgId],
    );
    return row.id;
  };
  bandra = await addOutlet('Bandra');
  colaba = await addOutlet('Colaba');

  // A different organization entirely — the thing that must never leak in.
  otherOrgOutlet = await createRestaurant('Someone Elses Cafe');

  ownerId = await createUser(andheri, `owner-${Date.now()}@test.com`);
  managerId = await createUser(bandra, `manager-${Date.now()}@test.com`);
});

afterAll(async () => {
  await db.query('DELETE FROM restaurants WHERE organization_id = $1', [orgId]);
  await db.query('DELETE FROM organizations WHERE id = $1', [orgId]);
  await deleteRestaurant(otherOrgOutlet);
  await db.pool?.end?.();
});

describe('the grant boundary', () => {
  test('an admin with no grants sees every outlet in their organization', async () => {
    const outlets = await repo.listVisibleOutlets(ownerId, andheri);
    expect(outlets.map((o) => o.name).sort()).toEqual(['Andheri', 'Bandra', 'Colaba']);
  });

  test('another organization never appears, grants or not', async () => {
    const outlets = await repo.listVisibleOutlets(ownerId, andheri);
    expect(outlets.map((o) => o.name)).not.toContain('Someone Elses Cafe');
  });

  test('an admin with grants sees only those outlets, plus their own', async () => {
    await db.query(
      'INSERT INTO owner_outlets (user_id, restaurant_id) VALUES ($1, $2)',
      [managerId, colaba],
    );
    const outlets = await repo.listVisibleOutlets(managerId, bandra);
    // Colaba by grant, Bandra because it is where they work. Not Andheri.
    expect(outlets.map((o) => o.name).sort()).toEqual(['Bandra', 'Colaba']);
  });

  test('a grant for another organization outlet is ignored, not honoured', async () => {
    // The dangerous case: a stale or malicious grant row must not be able to
    // reach across the organization boundary, because the org filter is applied
    // before the grant filter rather than instead of it.
    await db.query(
      'INSERT INTO owner_outlets (user_id, restaurant_id) VALUES ($1, $2)',
      [managerId, otherOrgOutlet],
    );
    const outlets = await repo.listVisibleOutlets(managerId, bandra);
    expect(outlets.map((o) => o.name)).not.toContain('Someone Elses Cafe');
    expect(outlets.map((o) => o.name).sort()).toEqual(['Bandra', 'Colaba']);

    await db.query(
      'DELETE FROM owner_outlets WHERE user_id = $1 AND restaurant_id = $2',
      [managerId, otherOrgOutlet],
    );
  });

  test('a granted user still sees where they actually work', async () => {
    // Granted Colaba only; Bandra is their own outlet and must not vanish.
    const outlets = await repo.listVisibleOutlets(managerId, bandra);
    expect(outlets.map((o) => o.id)).toContain(bandra);
  });
});

describe('the rollup', () => {
  const seedOrder = async (restaurantId, { status = 'paid', amount = 500 } = {}) => {
    const { rows: [t] } = await db.query(
      `INSERT INTO tables (restaurant_id, number, seats) VALUES ($1, $2, 4) RETURNING id`,
      [restaurantId, Math.floor(Math.random() * 100000)],
    );
    const { rows: [o] } = await db.query(
      `INSERT INTO orders (restaurant_id, table_id, status) VALUES ($1, $2, $3) RETURNING id`,
      [restaurantId, t.id, status],
    );
    if (status === 'paid') {
      await db.query(
        `INSERT INTO payments (order_id, amount, method, status)
         VALUES ($1, $2, 'cash', 'completed')`,
        [o.id, amount],
      );
    }
    return o.id;
  };

  test('an owner sees the whole organization and is told so', async () => {
    const view = await service.getRollup({ userId: ownerId, restaurantId: andheri });
    expect(view.visibleOutlets).toBe(3);
    expect(view.orgOutlets).toBe(3);
    expect(view.partialView).toBe(false);
    expect(view.organization.name).toBe('Andheri');
  });

  test('a manager is told their view is partial', async () => {
    // Without this the manager reads "2 outlets" as the whole business.
    const view = await service.getRollup({ userId: managerId, restaurantId: bandra });
    expect(view.visibleOutlets).toBe(2);
    expect(view.orgOutlets).toBe(3);
    expect(view.partialView).toBe(true);
  });

  test('revenue rolls up on the completed-payments definition', async () => {
    await seedOrder(andheri, { amount: 500 });
    await seedOrder(bandra, { amount: 300 });

    const view = await service.getRollup({ userId: ownerId, restaurantId: andheri });
    expect(view.totals.revenue).toBe(800);

    const row = view.outlets.find((o) => o.outletId === andheri);
    expect(row.revenue).toBe(500);
  });

  test('an outlet with no activity reports null rates, not zeroes', async () => {
    const view = await service.getRollup({ userId: ownerId, restaurantId: andheri });
    const quiet = view.outlets.find((o) => o.outletId === colaba);
    expect(quiet.orders).toBe(0);
    expect(quiet.cancellationPct).toBeNull();
    expect(quiet.foodCostPct).toBeNull();
    expect(quiet.avgRating).toBeNull();
  });

  test('a cancelled order raises the rate without earning revenue', async () => {
    await seedOrder(andheri, { status: 'cancelled' });
    const view = await service.getRollup({ userId: ownerId, restaurantId: andheri });
    const row = view.outlets.find((o) => o.outletId === andheri);
    expect(row.orders).toBe(2);
    expect(row.cancellationPct).toBe(50);
    expect(row.revenue).toBe(500);
  });

  test('a manager rollup contains no figure from an outlet they cannot see', async () => {
    // Andheri has revenue; the manager is not granted it.
    const view = await service.getRollup({ userId: managerId, restaurantId: bandra });
    expect(view.outlets.map((o) => o.outletId)).not.toContain(andheri);
    expect(view.totals.revenue).toBe(300);
  });

  test('the window is clamped rather than run', async () => {
    const view = await service.getRollup(
      { userId: ownerId, restaurantId: andheri }, { days: 99999 },
    );
    expect(view.windowDays).toBe(365);
  });

  test('a nonsense window falls back to the default', async () => {
    const view = await service.getRollup(
      { userId: ownerId, restaurantId: andheri }, { days: 'lots' },
    );
    expect(view.windowDays).toBe(service.DEFAULT_DAYS);
  });
});
