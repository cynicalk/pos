process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod-32chars';

jest.mock('../src/settings/settings.repository', () => ({ getValue: jest.fn() }));

const jwt = require('jsonwebtoken');
const repo = require('../src/settings/settings.repository');
const { featureForApiPath } = require('../src/shared/feature-routes');
const { featureGate, bustFeatureFlags } = require('../src/shared/middleware/featureGate');

/**
 * The server-side toggle gate. The mapping is data, so it's pinned directly; the
 * middleware is pinned on the three outcomes that matter: an off feature is 403,
 * an on (or unmapped) one passes, and a call it can't identify a tenant for is
 * left for the normal auth to reject — the gate never invents its own 401.
 */

describe('featureForApiPath', () => {
  test('maps a dedicated router to its toggle key', () => {
    expect(featureForApiPath('/api/reviews/summary')).toBe('/reviews');
    expect(featureForApiPath('/api/reputation')).toBe('/rankings');
    expect(featureForApiPath('/api/procurement/orders')).toBe('/procurement');
  });

  test('gates forecast and prep at the section level', () => {
    expect(featureForApiPath('/api/forecast/demand')).toBe('group:forecasting');
    expect(featureForApiPath('/api/prep/forecast')).toBe('group:forecasting');
  });

  test('leaves ungated routes alone', () => {
    expect(featureForApiPath('/api/menu')).toBeNull();
    expect(featureForApiPath('/api/orders')).toBeNull();
    expect(featureForApiPath('/api/settings')).toBeNull();
  });
});

describe('featureGate middleware', () => {
  const tokenFor = (restaurantId) => jwt.sign({ userId: 'u', role: 'admin', restaurantId }, process.env.JWT_SECRET);
  const run = (req) => new Promise((resolve) => {
    const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve({ res, nextErr: undefined, nexted: false }); } };
    featureGate(req, res, (err) => resolve({ res, nextErr: err, nexted: true }));
  });

  afterEach(() => { repo.getValue.mockReset(); });

  test('blocks a switched-off feature with 403 feature_disabled', async () => {
    const rid = 'r-off';
    bustFeatureFlags(rid);
    repo.getValue.mockResolvedValue(JSON.stringify({ '/reviews': false }));
    const { res, nexted } = await run({ path: '/api/reviews/x', cookies: { pos_token: tokenFor(rid) }, headers: {} });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'feature_disabled', feature: '/reviews' });
  });

  test('passes an enabled feature through', async () => {
    const rid = 'r-on';
    bustFeatureFlags(rid);
    repo.getValue.mockResolvedValue(JSON.stringify({ '/coupons': false })); // a different feature off
    const { nexted, nextErr } = await run({ path: '/api/reviews/x', cookies: { pos_token: tokenFor(rid) }, headers: {} });
    expect(nexted).toBe(true);
    expect(nextErr).toBeUndefined();
  });

  test('does not touch an unmapped route (no flag lookup at all)', async () => {
    const { nexted } = await run({ path: '/api/menu', cookies: { pos_token: tokenFor('r-x') }, headers: {} });
    expect(nexted).toBe(true);
    expect(repo.getValue).not.toHaveBeenCalled();
  });

  test('lets a token-less call fall through to auth rather than inventing a 401', async () => {
    const { nexted } = await run({ path: '/api/reviews/x', cookies: {}, headers: {} });
    expect(nexted).toBe(true);
    expect(repo.getValue).not.toHaveBeenCalled();
  });
});
