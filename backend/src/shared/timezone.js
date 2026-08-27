const { ValidationError } = require('./errors');

// Conservative IANA-ish identifier guard (letters, digits, / _ + -). Enough to
// keep the value safe to interpolate into `AT TIME ZONE $n` without allowing
// junk; Postgres still rejects an unknown zone name at query time.
const TZ_RE = /^[A-Za-z0-9/_+\-]+$/;

// Single source of truth for timezone validation (replaced 7 divergent copies).
// Strict by default: empty/null is invalid — use this where a blank tz must be
// rejected (e.g. saving the timezone setting). Pass a `fallback` to treat
// empty/null as that value — use for query filters that default to UTC.
function validateTimezone(tz, fallback) {
  if ((tz == null || tz === '') && fallback !== undefined) return fallback;
  if (typeof tz !== 'string' || !TZ_RE.test(tz)) {
    throw new ValidationError('Invalid timezone identifier');
  }
  return tz;
}

/**
 * How far `tz` is from UTC at a given instant, in minutes.
 *
 * Derived from Intl rather than from a table, so it is correct across DST
 * transitions for any zone without this file knowing the rules for any of them.
 */
function tzOffsetMinutes(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: validateTimezone(tz, 'UTC'), hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUTC - instant.getTime()) / 60000;
}

/**
 * The instant at which the wall clock in `tz` reads the given local time.
 *
 * A restaurant's trading day is a *local* day, and its service hours are local
 * wall-clock hours. Building `2026-08-26T20:00:00Z` for "eight in the evening"
 * puts an Indian restaurant's dinner service at half past one the next morning
 * — which is how seed.js came to write orders at 3 a.m. and split single
 * trading days across two dates.
 *
 * Two passes because the offset itself depends on the instant: the first guess
 * lands close enough that the second resolves the correct offset, including on
 * a DST boundary.
 */
function utcFromLocal(year, month, day, hour = 0, minute = 0, tz = 'UTC') {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = naive;
  for (let i = 0; i < 2; i++) {
    guess = naive - tzOffsetMinutes(new Date(guess), tz) * 60000;
  }
  return new Date(guess);
}

/** The local calendar date in `tz` for an instant, as `YYYY-MM-DD`. */
function localDate(instant, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: validateTimezone(tz, 'UTC'),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}

/** `YYYY-MM-DD` shifted by whole days, without going near a timezone. */
function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

module.exports = { validateTimezone, tzOffsetMinutes, utcFromLocal, localDate, shiftDate };
