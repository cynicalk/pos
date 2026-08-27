const { kitchenStatusOf } = require('../src/guest/guest.service');

/**
 * The guest app shows a four-stage kitchen tracker — received → preparing →
 * ready → served — and reads exactly those strings (see the app's
 * lib/backend.ts fetchOrderStatus). kitchenStatusOf collapses the POS's order
 * status and per-item statuses into that vocabulary. These tests pin the
 * mapping, because a wrong verdict here is a guest staring at a stale tracker.
 */
describe('kitchenStatusOf', () => {
  test('a fresh order with pending items reads as received', () => {
    expect(kitchenStatusOf({ status: 'pending', items: [{ status: 'pending' }] }))
      .toBe('received');
  });

  test('any item preparing lifts the whole order to preparing', () => {
    expect(kitchenStatusOf({
      status: 'confirmed',
      items: [{ status: 'pending' }, { status: 'preparing' }],
    })).toBe('preparing');
  });

  test('order-level preparing counts even when item statuses lag', () => {
    expect(kitchenStatusOf({ status: 'preparing', items: [{ status: 'pending' }] }))
      .toBe('preparing');
  });

  test('any item ready shows ready — the table can expect a plate', () => {
    expect(kitchenStatusOf({
      status: 'preparing',
      items: [{ status: 'preparing' }, { status: 'ready' }],
    })).toBe('ready');
  });

  test('every item served (or cancelled) means served', () => {
    expect(kitchenStatusOf({
      status: 'confirmed',
      items: [{ status: 'served' }, { status: 'cancelled' }],
    })).toBe('served');
  });

  test('a paid order is served regardless of item rows', () => {
    expect(kitchenStatusOf({ status: 'paid', items: [{ status: 'pending' }] }))
      .toBe('served');
  });

  test('ready outranks preparing when both are present', () => {
    expect(kitchenStatusOf({
      status: 'preparing',
      items: [{ status: 'ready' }, { status: 'preparing' }],
    })).toBe('ready');
  });

  test('an order with no items falls back to received, not served', () => {
    // The all-served rule must not fire on an empty list (every() is vacuously
    // true) — an order the kitchen has not touched is "received".
    expect(kitchenStatusOf({ status: 'pending', items: [] })).toBe('received');
  });

  test('a missing order is null, so the endpoint can answer not-found', () => {
    expect(kitchenStatusOf(null)).toBeNull();
  });
});
