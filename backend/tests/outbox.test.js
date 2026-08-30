const outbox = require('../src/modules/messaging/outbox');

/**
 * The outbox's value is that it never lies about a message's fate, so the tests
 * pin the two distinctions that carry the honesty: skipped is not failed, and a
 * queued message is pending, not delivered.
 */
describe('canTransition', () => {
  test('a queued message may be sent, failed, or skipped', () => {
    expect(outbox.canTransition('queued', 'sent')).toBe(true);
    expect(outbox.canTransition('queued', 'failed')).toBe(true);
    expect(outbox.canTransition('queued', 'skipped')).toBe(true);
  });

  test('a sent message is terminal', () => {
    expect(outbox.canTransition('sent', 'failed')).toBe(false);
    expect(outbox.canTransition('sent', 'queued')).toBe(false);
  });

  test('a failed message can be re-queued for retry, a skipped one cannot', () => {
    expect(outbox.canTransition('failed', 'queued')).toBe(true);
    expect(outbox.canTransition('skipped', 'queued')).toBe(false);
  });

  test('an unknown status is rejected', () => {
    expect(outbox.canTransition('queued', 'delivered')).toBe(false);
  });
});

describe('summarize', () => {
  test('separates queued (pending) from sent, and counts skipped apart from failed', () => {
    const s = outbox.summarize([
      { status: 'queued' }, { status: 'queued' }, { status: 'sent' },
      { status: 'skipped' }, { status: 'failed' },
    ]);
    expect(s.total).toBe(5);
    expect(s.queued).toBe(2);
    expect(s.sent).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.failed).toBe(1);
    // The headline while no channel is connected: what is really waiting.
    expect(s.pendingChannel).toBe(2);
  });

  test('an empty outbox summarizes to all zeros, not undefined', () => {
    expect(outbox.summarize([])).toEqual({
      total: 0, queued: 0, sent: 0, failed: 0, skipped: 0, pendingChannel: 0,
    });
  });
});
