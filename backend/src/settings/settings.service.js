const repo = require('./settings.repository');
const { ValidationError, AppError } = require('../shared/errors');
const { validateTimezone } = require('../shared/timezone');

const ALLOWED_KEYS = new Set([
  'timezone', 'currency', 'tax_rate', 'service_charge', 'packaging_fee',
  'staff_assignment_enabled', 'reservations_enabled', 'loyalty_enabled',
  'loyalty_points_per_unit', 'loyalty_points_value',
  'cash_denominations', 'restaurant_open',
  'daily_revenue_target',
  'city', 'latitude', 'longitude', 'location_captured_at',
  // ETA / wait-time estimator (Phase 1). The running stat keys
  // (eta_avg_table_time, eta_category_stats) are intentionally NOT here —
  // they're system-managed and must not be writable through this API.
  'eta_enabled', 'eta_buffer_minutes', 'allow_extra_chair',
  'eta_reservation_block_enabled', 'eta_category_overrides',
]);

function validateCurrency(code) {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) {
    throw new ValidationError('Invalid currency code');
  }
}

function validateRate(value, name) {
  const n = parseFloat(value);
  if (isNaN(n) || n < 0 || n > 100) {
    throw new ValidationError(`${name} must be a number between 0 and 100`);
  }
}

async function getAll(restaurantId) {
  return repo.getAll(restaurantId);
}

/* ── Exchange rates (USD base) ──────────────────────────────────────────────
 * Fetched server-side from Frankfurter and cached in-process. The upstream
 * publishes once per working day, so we refetch at most every few hours and
 * fall back to the last known good rate if it's unreachable — the Settings
 * page degrades to a slightly stale figure rather than a hard error.            */
const FX_BASE   = 'USD';
const FX_API    = 'https://api.frankfurter.dev/v1';
const FX_TTL_MS = 6 * 60 * 60 * 1000;        // refetch after 6h
const fxCache   = new Map();                  // currency -> { rate, date, fetchedAt }

async function getFxRate(to) {
  validateCurrency(to);
  if (to === FX_BASE) {
    return { base: FX_BASE, rate: 1, date: new Date().toISOString().slice(0, 10) };
  }

  const cached = fxCache.get(to);
  if (cached && Date.now() - cached.fetchedAt < FX_TTL_MS) {
    return { base: FX_BASE, rate: cached.rate, date: cached.date };
  }

  try {
    const res = await fetch(`${FX_API}/latest?from=${FX_BASE}&to=${to}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rate = json.rates?.[to];
    if (!rate) throw new Error('rate missing from upstream response');
    fxCache.set(to, { rate, date: json.date, fetchedAt: Date.now() });
    return { base: FX_BASE, rate, date: json.date };
  } catch (err) {
    // Upstream down — serve last known good rather than failing the UI
    if (cached) return { base: FX_BASE, rate: cached.rate, date: cached.date, stale: true };
    console.error('[fx] rate fetch failed:', err.message);
    throw new AppError('Could not fetch exchange rate', 502);
  }
}

async function update(key, value, restaurantId) {
  if (!ALLOWED_KEYS.has(key)) {
    throw new ValidationError(`Unknown setting: ${key}`);
  }
  if (key === 'timezone') validateTimezone(value);
  if (key === 'currency') validateCurrency(value);
  if (key === 'tax_rate') validateRate(value, 'tax_rate');
  if (key === 'service_charge') validateRate(value, 'service_charge');
  if (key === 'packaging_fee') {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0) throw new ValidationError('packaging_fee must be a non-negative number');
  }
  if (key === 'staff_assignment_enabled') {
    if (value !== 'true' && value !== 'false') throw new ValidationError('staff_assignment_enabled must be true or false');
  }
  if (key === 'reservations_enabled') {
    if (value !== 'true' && value !== 'false') throw new ValidationError('reservations_enabled must be true or false');
  }
  if (key === 'loyalty_enabled') {
    if (value !== 'true' && value !== 'false') throw new ValidationError('loyalty_enabled must be true or false');
  }
  if (key === 'restaurant_open') {
    if (value !== 'true' && value !== 'false') throw new ValidationError('restaurant_open must be true or false');
  }
  if (key === 'loyalty_points_per_unit') {
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) throw new ValidationError('loyalty_points_per_unit must be a positive number');
  }
  if (key === 'loyalty_points_value') {
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) throw new ValidationError('loyalty_points_value must be a positive number');
  }
  if (key === 'daily_revenue_target') {
    if (value !== '' && value !== '0') {
      const n = parseFloat(value);
      if (isNaN(n) || n < 0) throw new ValidationError('daily_revenue_target must be a non-negative number');
    }
  }
  if (key === 'cash_denominations') {
    const parts = String(value).split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 0 || parts.some((n) => isNaN(n) || n <= 0)) {
      throw new ValidationError('cash_denominations must be a comma-separated list of positive numbers');
    }
  }
  // Restaurant location — used by the AI weather/waste-correlation feature.
  // Empty string clears the value; otherwise lat/long must be valid coordinates.
  if (key === 'city') {
    if (typeof value !== 'string' || value.length > 120) {
      throw new ValidationError('city must be a string of at most 120 characters');
    }
  }
  if (key === 'latitude' && value !== '') {
    const n = parseFloat(value);
    if (isNaN(n) || n < -90 || n > 90) throw new ValidationError('latitude must be between -90 and 90');
  }
  if (key === 'longitude' && value !== '') {
    const n = parseFloat(value);
    if (isNaN(n) || n < -180 || n > 180) throw new ValidationError('longitude must be between -180 and 180');
  }
  // When the saved coordinates were last set — shown in Settings so the operator
  // can tell whether the stored location is current. Empty clears it.
  if (key === 'location_captured_at' && value !== '') {
    if (typeof value !== 'string' || isNaN(Date.parse(value))) {
      throw new ValidationError('location_captured_at must be an ISO date string');
    }
  }
  // ── ETA / wait-time estimator ──────────────────────────────────────────────
  if (['eta_enabled', 'allow_extra_chair', 'eta_reservation_block_enabled'].includes(key)) {
    if (value !== 'true' && value !== 'false') throw new ValidationError(`${key} must be true or false`);
  }
  if (key === 'eta_buffer_minutes') {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0 || n > 120) throw new ValidationError('eta_buffer_minutes must be between 0 and 120');
  }
  if (key === 'eta_category_overrides') {
    // JSON map of { category: minutes }. Empty object clears all overrides.
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new ValidationError('eta_category_overrides must be valid JSON'); }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('eta_category_overrides must be a JSON object');
    }
    for (const [cat, mins] of Object.entries(parsed)) {
      const n = parseFloat(mins);
      if (typeof cat !== 'string' || cat.length > 100 || isNaN(n) || n < 0 || n > 240) {
        throw new ValidationError('Each override must map a category to 0–240 minutes');
      }
    }
  }
  await repo.set(restaurantId, key, value);
  return repo.getAll(restaurantId);
}

module.exports = { getAll, update, getFxRate };
