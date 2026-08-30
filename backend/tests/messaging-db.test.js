/*
 * Outbox SQL coverage. The pure suite (outbox.test.js) checks the status policy;
 * this checks the round trip the policy rides on — that enqueue persists the
 * right status and reason, that skipped and queued survive apart, and that the
 * summary the screen leads with counts them correctly.
 */
const db = require('../src/shared/db');
const service = require('../src/messaging/messaging.service');
const { createRestaurant, deleteRestaurant } = require('./helpers');

let restaurantId;

beforeAll(async () => {
  restaurantId = await createRestaurant('Outbox Test Co');
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('enqueue', () => {
  test('a message to an opted-in recipient is queued, pending the channel', async () => {
    const row = await service.enqueue(restaurantId, {
      kind: 'waitlist_ready', recipient: '9990001111', recipientName: 'Asha',
      body: 'Your table is ready', optIn: true,
    });
    expect(row.status).toBe('queued');

    const { messages } = await service.getOutbox(restaurantId, { status: 'queued' });
    const m = messages.find((x) => x.id === row.id);
    expect(m.recipient).toBe('9990001111');
    expect(m.status_reason).toMatch(/pending channel/i);
  });

  test('a recipient who has not opted in is skipped, not sent, with the reason', async () => {
    const row = await service.enqueue(restaurantId, {
      kind: 'winback', recipient: '9990002222', body: 'We miss you', optIn: false,
    });
    expect(row.status).toBe('skipped');

    const { messages } = await service.getOutbox(restaurantId, { status: 'skipped' });
    const m = messages.find((x) => x.id === row.id);
    expect(m.status_reason).toMatch(/opted in/i);
  });

  test('a message with no recipient is skipped, not a crash', async () => {
    // recipient is nullable precisely so this is recordable, not a NOT NULL throw.
    const row = await service.enqueue(restaurantId, {
      kind: 'winback', recipient: null, body: 'orphan', optIn: true,
    });
    expect(row.status).toBe('skipped');
    const { messages } = await service.getOutbox(restaurantId, {});
    expect(messages.find((x) => x.id === row.id).status_reason).toMatch(/no recipient/i);
  });
});

describe('the outbox summary', () => {
  test('counts queued (pending) apart from skipped, and totals them', async () => {
    const { summary } = await service.getOutbox(restaurantId, {});
    // From the three enqueues above: 1 queued, 2 skipped.
    expect(summary.queued).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.sent).toBe(0);
    expect(summary.pendingChannel).toBe(1);
    expect(summary.total).toBe(3);
  });

  test('a bad status filter returns nothing rather than everything', async () => {
    // The router rejects unknown statuses; the repo itself simply matches none.
    const { messages } = await service.getOutbox(restaurantId, { status: 'delivered' });
    expect(messages).toEqual([]);
  });
});
