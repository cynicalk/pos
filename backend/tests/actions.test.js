const db = require('../src/shared/db');
const service = require('../src/actions/actions.service');
const repo = require('../src/actions/actions.repository');
const engine = require('../src/modules/rules/engine');
const { createRestaurant, deleteRestaurant } = require('./helpers');

// Integration coverage for the rules pipeline's SQL (MERGE_PLAN.md Phase 2).
//
// tests/rules.test.js covers the pure engine and needs no database. This file
// exists because that is not enough: the first working build of this feature
// shipped a repository query that threw "inconsistent types deduced for
// parameter $3" on every status change, and all 130 pure tests still passed.
// Anything that only breaks in Postgres has to be exercised against Postgres.

let restaurantId;
let tableId;

beforeAll(async () => {
  restaurantId = await createRestaurant('Actions Test Co');
  const { rows: [t] } = await db.query(
    `INSERT INTO tables (restaurant_id, number, seats, status)
     VALUES ($1, 902, 4, 'available') RETURNING id`,
    [restaurantId],
  );
  tableId = t.id;
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('rule seeding', () => {
  test('seeds the default rules on first evaluation', async () => {
    // Derived from the catalogue rather than restated: this test is about the
    // seeding mechanism, and every phase that adds a rule was otherwise
    // breaking it for no reason. tests/rules.test.js pins the actual list.
    await service.evaluate(restaurantId);
    const rules = await repo.listRules(restaurantId);
    expect(rules.map((r) => r.rule_type).sort())
      .toEqual(engine.DEFAULT_RULES.map((r) => r.ruleType).sort());
  });

  test('re-seeding does not duplicate or reset a tuned threshold', async () => {
    await db.query(
      `UPDATE rules SET condition = '{"field":"cancellation_pct","op":">","value":25}'::jsonb
       WHERE restaurant_id = $1 AND rule_type = 'high_cancellation'`,
      [restaurantId],
    );
    await service.evaluate(restaurantId);

    const rules = await repo.listRules(restaurantId);
    expect(rules).toHaveLength(engine.DEFAULT_RULES.length);
    const tuned = rules.find((r) => r.rule_type === 'high_cancellation');
    expect(tuned.condition.value).toBe(25); // operator's value survived
  });

  test('re-seeding DOES refresh the wording', async () => {
    // The other half of the same decision. A rule's threshold is the operator's
    // judgement about their own restaurant and must survive a deploy; its
    // wording is product copy, lives in DEFAULT_RULES, and must not.
    //
    // Seeding used to be ON CONFLICT DO NOTHING, so a corrected template only
    // ever reached databases created after the correction. The rank-drop
    // message went out reading "measured 7 days apart days apart" on every
    // existing deployment, for exactly that reason.
    await db.query(
      `UPDATE rules SET message_template = 'stale wording from an older release'
       WHERE restaurant_id = $1 AND rule_type = 'rank_drop'`,
      [restaurantId],
    );
    await service.evaluate(restaurantId);

    const expected = engine.DEFAULT_RULES.find((r) => r.ruleType === 'rank_drop');
    const stored = (await repo.listRules(restaurantId)).find((r) => r.rule_type === 'rank_drop');
    expect(stored.message_template).toBe(expected.messageTemplate);
  });

  test('the rank-drop template does not restate the units it is given', async () => {
    // `gap_days` carries its own wording — "7 days apart", or "the same day"
    // when two readings land on one date. A template that appended " days
    // apart" of its own produced both "days apart days apart" and, for the
    // same-day case, "the same day days apart".
    const rule = engine.DEFAULT_RULES.find((r) => r.ruleType === 'rank_drop');
    expect(rule.messageTemplate).toContain('{gap_days}');
    expect(rule.messageTemplate).not.toMatch(/\{gap_days\}\s*days/);
  });
});

describe('evaluation and dedupe against the database', () => {
  test('raises an action for a genuinely stalled table', async () => {
    await db.query(
      `UPDATE tables SET status = 'occupied', occupied_at = now() - INTERVAL '40 minutes'
       WHERE id = $1`,
      [tableId],
    );
    const created = await service.evaluate(restaurantId);
    expect(created).toHaveLength(1);
    expect(created[0].title).toContain('Table 902');
    expect(created[0].action_type).toBe('recommendation');
  });

  test('a second pass does not raise the same issue twice', async () => {
    expect(await service.evaluate(restaurantId)).toHaveLength(0);
  });

  test('does not re-raise something the operator just answered', async () => {
    // Caught in live testing: an alert marked "I acted on this" came back
    // fifteen minutes later, and dismissing would have done the same. A queue
    // that re-raises what you just answered stops being read.
    const [action] = await db.query(
      `SELECT id FROM actions WHERE restaurant_id = $1 AND status = 'open' LIMIT 1`,
      [restaurantId],
    ).then((r) => r.rows);

    await service.setStatus(action.id, restaurantId, 'acted_on');
    expect(await service.evaluate(restaurantId)).toHaveLength(0);

    await service.setStatus(action.id, restaurantId, 'dismissed');
    expect(await service.evaluate(restaurantId)).toHaveLength(0);
  });

  test('a standing condition may speak up again once the cooldown passes', async () => {
    // Backdate the resolution past the cooldown: the table is still stalled,
    // so the finding is allowed to return rather than being silenced forever.
    await db.query(
      `UPDATE actions SET resolved_at = now() - make_interval(hours => $2)
       WHERE restaurant_id = $1`,
      [restaurantId, service.RAISE_COOLDOWN_HOURS + 1],
    );
    expect(await service.evaluate(restaurantId)).toHaveLength(1);
  });

  test('a table that has ordered stops being stalled', async () => {
    await db.query(
      `UPDATE actions SET status = 'dismissed', resolved_at = now()
       WHERE restaurant_id = $1`,
      [restaurantId],
    );
    const { rows: [o] } = await db.query(
      `INSERT INTO orders (restaurant_id, table_id, status, channel)
       VALUES ($1, $2, 'preparing', 'dining') RETURNING id`,
      [restaurantId, tableId],
    );
    expect(await service.evaluate(restaurantId)).toHaveLength(0);
    await db.query('DELETE FROM orders WHERE id = $1', [o.id]);
  });
});

describe('action lifecycle', () => {
  let actionId;

  beforeAll(async () => {
    await db.query('DELETE FROM actions WHERE restaurant_id = $1', [restaurantId]);
    await db.query(
      `UPDATE tables SET occupied_at = now() - INTERVAL '45 minutes' WHERE id = $1`,
      [tableId],
    );
    const [action] = await service.evaluate(restaurantId);
    actionId = action.id;
  });

  test('acknowledging stamps acknowledged_at and leaves it unresolved', async () => {
    const updated = await service.setStatus(actionId, restaurantId, 'acknowledged');
    expect(updated.status).toBe('acknowledged');
    expect(updated.acknowledged_at).toBeTruthy();
    expect(updated.resolved_at).toBeNull();
  });

  test('acting on it resolves it and keeps the acknowledgement time', async () => {
    const updated = await service.setStatus(actionId, restaurantId, 'acted_on');
    expect(updated.status).toBe('acted_on');
    expect(updated.acknowledged_at).toBeTruthy();
    expect(updated.resolved_at).toBeTruthy();
  });

  test('a rule with no standing metric records no outcome', async () => {
    // stalled_table is a one-off nudge about one party, not a metric that a
    // later measurement could fairly compare against.
    const outcome = await repo.getOutcomeByAction(actionId, restaurantId);
    expect(outcome).toBeUndefined();
  });

  test('rejects a status outside the lifecycle', async () => {
    await expect(service.setStatus(actionId, restaurantId, 'nonsense'))
      .rejects.toThrow(/status must be one of/);
  });

  test('will not touch another tenant\'s action', async () => {
    const otherId = await createRestaurant('Someone Else');
    await expect(service.setStatus(actionId, otherId, 'dismissed'))
      .rejects.toThrow(/Action/);
    await deleteRestaurant(otherId);
  });
});

describe('outcome baselines', () => {
  test('taking an action on a tracked rule records a before-value', async () => {
    // Give the restaurant enough reviews to drag the average under 4, so the
    // rating_drop rule fires and brings its tracked metric with it.
    for (let i = 0; i < 6; i += 1) {
      await db.query(
        `INSERT INTO reviews (restaurant_id, overall_rating, food_rating, service_rating)
         VALUES ($1, 2, 2, 3)`,
        [restaurantId],
      );
    }
    await db.query('DELETE FROM actions WHERE restaurant_id = $1', [restaurantId]);

    const created = await service.evaluate(restaurantId);
    const rating = created.find((a) => a.title.includes('Rating dipped'));
    expect(rating).toBeTruthy();

    await service.setStatus(rating.id, restaurantId, 'acted_on');
    const outcome = await repo.getOutcomeByAction(rating.id, restaurantId);
    expect(outcome).toBeTruthy();
    expect(outcome.metric_name).toBe('avg_rating');
    expect(Number(outcome.before_value)).toBeCloseTo(2, 1);
    expect(outcome.verdict).toBeNull(); // nothing measured yet
  });

  test('the metric is computed on the same basis the rule alerted on', async () => {
    const value = await service.computeMetric(restaurantId, 'avg_rating');
    expect(value).toBeCloseTo(2, 1);
  });

  test('a metric with too little data returns null rather than a number', async () => {
    const emptyId = await createRestaurant('No Reviews Co');
    expect(await service.computeMetric(emptyId, 'avg_rating')).toBeNull();
    expect(await service.computeMetric(emptyId, 'cancellation_pct')).toBeNull();
    await deleteRestaurant(emptyId);
  });
});
