/*
 * Phase 6 SQL-level coverage (MERGE_PLAN.md).
 *
 * The pure suite cannot see the classifier's idempotency guard, the fact that
 * guest spend is summed from payments the same way revenue is, or the refusal
 * to draft a reply that has nowhere to go.
 *
 * The LLM client is mocked throughout. LM Studio may well be running on the
 * development machine, and a test whose result depends on whether a model
 * happens to be loaded is a test that proves nothing. Each block states which
 * path it is exercising.
 */

jest.mock('../src/ai/llm.client', () => ({
  reachable: jest.fn(async () => false),
  chat: jest.fn(async () => ({ content: '' })),
}));

const db = require('../src/shared/db');
const llm = require('../src/ai/llm.client');
const service = require('../src/reputation/reputation.service');
const repo = require('../src/reputation/reputation.repository');
const { createRestaurant, deleteRestaurant } = require('./helpers');

let restaurantId;
let tableId;

const addReview = async (rating, comment, phone = null) => {
  const { rows: [r] } = await db.query(
    `INSERT INTO reviews (restaurant_id, table_id, overall_rating, comment, customer_phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [restaurantId, tableId, rating, comment, phone],
  );
  return r.id;
};

beforeAll(async () => {
  restaurantId = await createRestaurant('Reputation Test Co');
  const { rows: [t] } = await db.query(
    `INSERT INTO tables (restaurant_id, number, seats) VALUES ($1, 1, 4) RETURNING id`,
    [restaurantId],
  );
  tableId = t.id;
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

beforeEach(() => {
  llm.reachable.mockResolvedValue(false);
  llm.chat.mockResolvedValue({ content: '' });
});

describe('review classification (keyword path)', () => {
  test('classifies pending reviews and records which classifier ran', async () => {
    await addReview(2, 'there was a hair in my food, filthy table');
    const result = await service.classifyPending(restaurantId);

    expect(result.classified).toBeGreaterThanOrEqual(1);
    expect(result.via).toBe('keyword');

    const rows = await repo.listForWindow(restaurantId, 30);
    const classified = rows.find((r) => r.comment?.includes('hair'));
    expect(classified.theme).toBe('hygiene');
    expect(classified.sentiment).toBe('negative');
    expect(classified.classified_by).toBe('keyword');
    expect(classified.classified_at).toBeTruthy();
  });

  test('a second pass has nothing left to do', async () => {
    const result = await service.classifyPending(restaurantId);
    expect(result.classified).toBe(0);
    expect(result.via).toBeNull();
  });

  test('an already-classified review is never re-written', async () => {
    // The theme IS NULL guard: a slower pass must not overwrite the answer
    // already on screen.
    const id = await addReview(1, 'rude staff, terrible service');
    await service.classifyPending(restaurantId);

    const overwritten = await repo.setClassification(restaurantId, id, {
      theme: 'value_for_money', sentiment: 'positive', classifiedBy: 'model',
    });
    expect(overwritten).toBeNull();

    const row = await repo.getById(restaurantId, id);
    expect(row.theme).toBe('service');
  });
});

describe('review classification (model path)', () => {
  // The model is opt-in. Page loads never ask for it — see classifyPending's
  // note about a 30-second hang behind an "reachable" endpoint.
  const withModel = () => service.classifyPending(restaurantId, { useModel: true });

  test('uses the model answer when it comes back the right length', async () => {
    await addReview(2, 'portions have shrunk for the price');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockResolvedValue({ content: '["value_for_money"]' });

    const result = await withModel();
    expect(result.via).toBe('model');

    const rows = await repo.listForWindow(restaurantId, 30);
    const row = rows.find((r) => r.comment?.includes('shrunk'));
    expect(row.theme).toBe('value_for_money');
    expect(row.classified_by).toBe('model');
  });

  test('falls back to keywords when the model returns the wrong number of themes', async () => {
    // The dangerous failure: a short list would shift every theme onto the
    // wrong review, and nothing downstream could tell.
    await addReview(1, 'the delivery arrived cold and the box had leaked');
    await addReview(2, 'oily and bland');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockResolvedValue({ content: '["delivery_packaging"]' });

    const result = await withModel();
    expect(result.via).toBe('keyword');

    const rows = await repo.listForWindow(restaurantId, 30);
    expect(rows.find((r) => r.comment?.includes('leaked')).theme).toBe('delivery_packaging');
    expect(rows.find((r) => r.comment?.includes('oily')).theme).toBe('food_quality');
  });

  test('falls back to keywords when the model returns prose', async () => {
    await addReview(3, 'service was slow, the waiter forgot us');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockResolvedValue({ content: 'Sure! Here are the themes you asked for.' });

    const result = await withModel();
    expect(result.via).toBe('keyword');
  });

  test('a theme the model invented is coerced to other', async () => {
    await addReview(4, 'parking outside is a nightmare');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockResolvedValue({ content: '["parking"]' });

    await withModel();
    const rows = await repo.listForWindow(restaurantId, 30);
    expect(rows.find((r) => r.comment?.includes('nightmare')).theme).toBe('other');
  });
});

describe('insights', () => {
  test('never calls the model, however reachable it looks', async () => {
    // The defect this pins: getInsights used to classify with the model on the
    // request path, so opening Reviews waited out a 30-second timeout while
    // llm.reachable() cheerfully reported the endpoint was up.
    await addReview(2, 'the paneer was rubbery and cold');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockClear();

    await service.getInsights(restaurantId, { days: 30 });
    expect(llm.chat).not.toHaveBeenCalled();
  });

  test('reports the window, the summary and the contactable count together', async () => {
    await addReview(1, 'a fly in the dal', '9876500001');
    const insights = await service.getInsights(restaurantId, { days: 30 });

    expect(insights.windowDays).toBe(30);
    expect(insights.summary.total).toBeGreaterThan(0);
    expect(insights.summary.avgRating).not.toBeNull();
    expect(insights.contactable).toBeGreaterThanOrEqual(1);
  });

  test('an absurd window is clamped rather than run', async () => {
    const insights = await service.getInsights(restaurantId, { days: 99999 });
    expect(insights.windowDays).toBe(365);
  });

  test('a nonsense window falls back to the default', async () => {
    const insights = await service.getInsights(restaurantId, { days: 'soon' });
    expect(insights.windowDays).toBe(service.DEFAULT_WINDOW_DAYS);
  });
});

describe('reply drafting', () => {
  test('refuses to draft a reply that could never be delivered', async () => {
    const id = await addReview(2, 'cold food', null);
    await expect(service.draftReply(restaurantId, id, null))
      .rejects.toThrow(/no phone number/);
  });

  test('drafts from the template when no model is reachable', async () => {
    const id = await addReview(1, 'a hair in the curry', '9876500002');
    await service.classifyPending(restaurantId);

    const draft = await service.draftReply(restaurantId, id, null);
    expect(draft.source).toBe('template');
    expect(draft.draft).toMatch(/sorry/i);
    // Stated on every draft: the system did not send anything.
    expect(draft.delivery).toBe('manual');
  });

  test('uses the model draft when one comes back', async () => {
    const id = await addReview(2, 'the naan was stale', '9876500003');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockResolvedValue({ content: '  Hi, sorry about the naan. — Team  ' });

    const draft = await service.draftReply(restaurantId, id, null);
    expect(draft.source).toBe('model');
    expect(draft.draft).toBe('Hi, sorry about the naan. — Team');
  });

  test('a rating-only review never reaches the model', async () => {
    const id = await addReview(2, null, '9876500004');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockClear();

    const draft = await service.draftReply(restaurantId, id, null);
    expect(draft.source).toBe('template');
    expect(llm.chat).not.toHaveBeenCalled();
  });

  test('a model failure keeps the template rather than failing the request', async () => {
    const id = await addReview(1, 'terrible service throughout', '9876500005');
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockRejectedValue(new Error('LLM unavailable'));

    const draft = await service.draftReply(restaurantId, id, null);
    expect(draft.source).toBe('template');
  });

  test('redrafting clears a previous sent mark', async () => {
    const id = await addReview(2, 'slow service and cold food', '9876500006');
    await service.draftReply(restaurantId, id, null);
    await service.markReplySent(restaurantId, id, null);
    expect((await repo.getReply(restaurantId, id)).marked_sent_at).toBeTruthy();

    await service.saveReply(restaurantId, id, 'A different message entirely.', null);
    const after = await repo.getReply(restaurantId, id);
    expect(after.marked_sent_at).toBeNull();
    expect(after.source).toBe('operator');
  });

  test('an empty edit is refused', async () => {
    const id = await addReview(3, 'fine', '9876500007');
    await expect(service.saveReply(restaurantId, id, '   ', null)).rejects.toThrow(/empty/);
  });

  test('another restaurant cannot draft against our review', async () => {
    const otherId = await createRestaurant('Someone Else');
    const id = await addReview(2, 'bad', '9876500008');
    await expect(service.draftReply(otherId, id, null)).rejects.toThrow(/not found/i);
    await deleteRestaurant(otherId);
  });
});

describe('rankings', () => {
  test('records and groups a tracked query', async () => {
    await service.recordRank(restaurantId, {
      platform: 'swiggy', query: '  Biryani  ', position: 7,
    }, null);

    const { trackedQueries } = await service.getRankings(restaurantId);
    const q = trackedQueries.find((x) => x.query === 'biryani');
    expect(q).toBeTruthy();
    expect(q.latestPosition).toBe(7);
  });

  test('normalisation means one tracked query, not three', async () => {
    await service.recordRank(restaurantId, { platform: 'swiggy', query: 'BIRYANI', position: 5 }, null);
    await service.recordRank(restaurantId, { platform: 'swiggy', query: 'biryani ', position: 4 }, null);

    const { trackedQueries } = await service.getRankings(restaurantId);
    expect(trackedQueries.filter((q) => q.query === 'biryani')).toHaveLength(1);
  });

  test('rejects an unknown platform', async () => {
    await expect(service.recordRank(restaurantId, {
      platform: 'dunzo', query: 'thali', position: 3,
    }, null)).rejects.toThrow(/platform must be one of/);
  });

  test('rejects a position of zero', async () => {
    await expect(service.recordRank(restaurantId, {
      platform: 'swiggy', query: 'thali', position: 0,
    }, null)).rejects.toThrow(/1 or higher/);
  });

  test('rejects a total smaller than the position', async () => {
    // Position 8 of 5 results is not a reading anyone can have taken.
    await expect(service.recordRank(restaurantId, {
      platform: 'swiggy', query: 'thali', position: 8, totalResults: 5,
    }, null)).rejects.toThrow(/smaller than the position/);
  });

  test('the payload says the readings were typed in', async () => {
    const r = await service.getRankings(restaurantId);
    expect(r.source).toBe('manual');
  });

  test('benchmark compares own reviews against recorded competitors', async () => {
    await service.recordCompetitorRating(restaurantId, {
      competitorName: 'Rival Kitchen', platform: 'swiggy', rating: 4.6,
    }, null);

    const { benchmark } = await service.getRankings(restaurantId);
    expect(benchmark.ownRating).not.toBeNull();
    expect(benchmark.competitors[0].competitorName).toBe('Rival Kitchen');
    expect(benchmark.competitors[0].delta).toBe(
      Math.round((benchmark.ownRating - 4.6) * 10) / 10,
    );
  });

  test('rejects a rating outside the scale', async () => {
    await expect(service.recordCompetitorRating(restaurantId, {
      competitorName: 'Rival', platform: 'swiggy', rating: 7,
    }, null)).rejects.toThrow(/between 0 and 5/);
  });

  test('another restaurant cannot delete our reading', async () => {
    const otherId = await createRestaurant('Someone Else 2');
    const rank = await service.recordRank(restaurantId, {
      platform: 'zomato', query: 'kebab', position: 2,
    }, null);
    await expect(service.deleteRank(otherId, rank.id)).rejects.toThrow(/not found/i);
    await deleteRestaurant(otherId);
  });
});

describe('guest metrics', () => {
  const seedGuest = async (phone, name, orders) => {
    const { rows: [c] } = await db.query(
      `INSERT INTO loyalty_customers (restaurant_id, phone, name)
       VALUES ($1, $2, $3) RETURNING id`,
      [restaurantId, phone, name],
    );
    for (const { amount, daysAgo, paid = true } of orders) {
      const { rows: [o] } = await db.query(
        `INSERT INTO orders (restaurant_id, table_id, status, loyalty_customer_id, created_at)
         VALUES ($1, $2, $3, $4, now() - ($5::int * INTERVAL '1 day')) RETURNING id`,
        [restaurantId, tableId, paid ? 'paid' : 'cancelled', c.id, daysAgo],
      );
      await db.query(
        `INSERT INTO payments (order_id, amount, method, status)
         VALUES ($1, $2, 'cash', $3)`,
        [o.id, amount, paid ? 'completed' : 'pending'],
      );
    }
    return c.id;
  };

  test('spend is summed from completed payments, matching how revenue is defined', async () => {
    const id = await seedGuest('9990000001', 'Repeat Rhea', [
      { amount: 300, daysAgo: 2 },
      { amount: 500, daysAgo: 9 },
    ]);
    const m = await service.getGuestMetrics(restaurantId, { days: 90 });
    const guest = m.recentGuests.find((g) => g.customerId === id);

    expect(guest.visits).toBe(2);
    expect(guest.totalSpend).toBe(800);
    expect(guest.repeat).toBe(true);
  });

  test('a cancelled order is not a visit and its money is not spend', async () => {
    const id = await seedGuest('9990000002', 'Cancelled Chetan', [
      { amount: 400, daysAgo: 1 },
      { amount: 999, daysAgo: 1, paid: false },
    ]);
    const m = await service.getGuestMetrics(restaurantId, { days: 90 });
    const guest = m.recentGuests.find((g) => g.customerId === id);

    expect(guest.visits).toBe(1);
    expect(guest.totalSpend).toBe(400);
  });

  test('a split bill is one visit, not two', async () => {
    // Two payments against one order. Joining payments directly would have
    // counted this guest as visiting twice.
    const { rows: [c] } = await db.query(
      `INSERT INTO loyalty_customers (restaurant_id, phone, name)
       VALUES ($1, '9990000003', 'Split Sana') RETURNING id`,
      [restaurantId],
    );
    const { rows: [o] } = await db.query(
      `INSERT INTO orders (restaurant_id, table_id, status, loyalty_customer_id)
       VALUES ($1, $2, 'paid', $3) RETURNING id`,
      [restaurantId, tableId, c.id],
    );
    await db.query(
      `INSERT INTO payments (order_id, amount, method, status)
       VALUES ($1, 250, 'cash', 'completed'), ($1, 250, 'card', 'completed')`,
      [o.id],
    );

    const m = await service.getGuestMetrics(restaurantId, { days: 90 });
    const guest = m.recentGuests.find((g) => g.customerId === c.id);
    expect(guest.visits).toBe(1);
    expect(guest.totalSpend).toBe(500);
  });

  test('a lapsed guest lands on the winback list', async () => {
    const id = await seedGuest('9990000004', 'Lapsed Leela', [
      { amount: 1200, daysAgo: 50 },
      { amount: 800, daysAgo: 70 },
    ]);
    const m = await service.getGuestMetrics(restaurantId, { days: 90 });
    expect(m.lapsedGuests.some((g) => g.customerId === id)).toBe(true);
  });

  test('coverage reports how many orders could be attributed at all', async () => {
    // An anonymous order — the common case on most floors.
    await db.query(
      `INSERT INTO orders (restaurant_id, table_id, status) VALUES ($1, $2, 'paid')`,
      [restaurantId, tableId],
    );
    const m = await service.getGuestMetrics(restaurantId, { days: 90 });
    expect(m.coverage.totalOrders).toBeGreaterThan(m.coverage.identifiedOrders);
    expect(m.coverage.pct).toBeLessThan(100);
    expect(m.coverage.windowDays).toBe(90);
  });
});

describe('the Yumzy snapshot', () => {
  test('carries reviews and rankings but no guest contact details', async () => {
    const snapshot = await service.getSnapshot(restaurantId);
    const serialised = JSON.stringify(snapshot);

    expect(snapshot.reviews.total).toBeGreaterThan(0);
    expect(snapshot.searchRankings.length).toBeGreaterThan(0);

    // The line the guest module refuses to cross: feedback must not become a
    // dossier the assistant can be asked to read out.
    expect(serialised).not.toMatch(/9876500\d{3}/);
    expect(serialised).not.toMatch(/9990000\d{3}/);
    expect(serialised).not.toMatch(/Repeat Rhea/);
  });

  test('states that the rankings were typed in and the reviews are first-party', async () => {
    const snapshot = await service.getSnapshot(restaurantId);
    expect(snapshot.notes.join(' ')).toMatch(/typed in by hand/i);
    expect(snapshot.notes.join(' ')).toMatch(/first-party/i);
  });
});
