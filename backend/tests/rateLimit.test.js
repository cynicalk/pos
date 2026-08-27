const request = require('supertest');
const express = require('express');
const { rateLimit } = require('../src/shared/middleware/rateLimit');

// Each call to rateLimit() creates an independent bucket Map, so tests
// don't share state with each other or with auth/admin limiters.

function makeApp({ windowMs = 60_000, max = 3, key } = {}) {
  const app = express();
  const opts = { windowMs, max };
  if (key !== undefined) opts.key = key;
  app.get('/test', rateLimit(opts), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimit — in-memory', () => {
  it('allows requests up to the limit', async () => {
    const app = makeApp({ max: 3 });
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 on the request that exceeds the limit', async () => {
    const app = makeApp({ max: 3 });
    for (let i = 0; i < 3; i++) await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error');
  });

  it('sends a Retry-After header when blocked', async () => {
    const app = makeApp({ max: 1 });
    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('keeps blocking until the window resets', async () => {
    const app = makeApp({ max: 1, windowMs: 200 });
    await request(app).get('/test');
    // Blocked immediately
    expect((await request(app).get('/test')).status).toBe(429);
    // Still blocked mid-window
    expect((await request(app).get('/test')).status).toBe(429);
    // Passes after window expires
    await new Promise((r) => setTimeout(r, 220));
    expect((await request(app).get('/test')).status).toBe(200);
  });

  it('skips limiting when key() returns falsy', async () => {
    const app = express();
    app.get('/test', rateLimit({ windowMs: 60_000, max: 1, key: () => null }), (_req, res) =>
      res.json({ ok: true }),
    );
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/test')).status).toBe(200);
    }
  });

  it('counts independently per key', async () => {
    const app = express();
    // Key is a custom header value
    app.get(
      '/test',
      rateLimit({ windowMs: 60_000, max: 2, key: (req) => req.headers['x-id'] }),
      (_req, res) => res.json({ ok: true }),
    );
    // Alice uses 2 of her 2 — fine
    await request(app).get('/test').set('x-id', 'alice');
    await request(app).get('/test').set('x-id', 'alice');
    // Alice hits limit
    expect((await request(app).get('/test').set('x-id', 'alice')).status).toBe(429);
    // Bob is unaffected
    expect((await request(app).get('/test').set('x-id', 'bob')).status).toBe(200);
  });
});
