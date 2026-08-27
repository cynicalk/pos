/*
 * Local wall-clock helpers (src/shared/timezone.js).
 *
 * These exist because a restaurant's trading day is a *local* day and its
 * service hours are local hours, and this codebase has now been bitten by that
 * three separate times: DATE columns read back through `toISOString()` reported
 * the previous day in IST (fixed with `asDate` in Phases 5 and 8), and seed.js
 * built its order timestamps with a trailing `Z`, which put an Indian
 * restaurant's dinner service at half past one the following morning.
 *
 * The last of those is what these tests pin. A helper that is merely "about
 * right" reintroduces the bug on the one day of the year a zone changes offset.
 */

const {
  validateTimezone, utcFromLocal, localDate, shiftDate, tzOffsetMinutes,
} = require('../src/shared/timezone');

const IST = 'Asia/Kolkata';

/** What a wall clock in `tz` reads at a given instant. */
const reads = (instant, tz) => new Intl.DateTimeFormat('en-GB', {
  timeZone: tz, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
}).format(instant);

describe('utcFromLocal', () => {
  test('a local time reads back as that local time', () => {
    const dinner = utcFromLocal(2026, 8, 26, 20, 0, IST);
    expect(reads(dinner, IST)).toBe('26/08/2026, 20:00');
    expect(dinner.toISOString()).toBe('2026-08-26T14:30:00.000Z');
  });

  test('the bug it replaces: a trailing Z moves dinner into the next day', () => {
    // Exactly what seed.js used to build. Kept as a test so the shape of the
    // mistake is on record rather than only its fix.
    const naive = new Date('2026-08-26T20:00:00Z');
    expect(reads(naive, IST)).toBe('27/08/2026, 01:30');
    expect(localDate(naive, IST)).toBe('2026-08-27');

    // The helper puts it back on the day the operator meant.
    expect(localDate(utcFromLocal(2026, 8, 26, 20, 0, IST), IST)).toBe('2026-08-26');
  });

  test('midnight and the end of the evening stay on their own local day', () => {
    for (const hour of [0, 5, 12, 20, 23]) {
      const at = utcFromLocal(2026, 8, 26, hour, 30, IST);
      expect(localDate(at, IST)).toBe('2026-08-26');
    }
  });

  test('a half-hour offset is not rounded away', () => {
    // IST is UTC+5:30. A helper that only handled whole hours would be out by
    // thirty minutes here and nowhere else, which is the hardest kind to spot.
    expect(tzOffsetMinutes(new Date('2026-08-26T00:00:00Z'), IST)).toBe(330);
  });

  test('holds across a daylight-saving transition', () => {
    // London moves to BST overnight on 29 March 2026. Noon is noon on both
    // sides of it, and the stored instants differ by an hour.
    const before = utcFromLocal(2026, 3, 28, 12, 0, 'Europe/London');
    const after = utcFromLocal(2026, 3, 29, 12, 0, 'Europe/London');
    expect(reads(before, 'Europe/London')).toBe('28/03/2026, 12:00');
    expect(reads(after, 'Europe/London')).toBe('29/03/2026, 12:00');
    expect(before.toISOString()).toBe('2026-03-28T12:00:00.000Z');
    expect(after.toISOString()).toBe('2026-03-29T11:00:00.000Z');
  });

  test('defaults to UTC rather than to the machine it runs on', () => {
    // A seed that behaved differently on a developer's laptop than in CI would
    // be worse than one that is simply wrong everywhere.
    expect(utcFromLocal(2026, 8, 26, 20, 0).toISOString()).toBe('2026-08-26T20:00:00.000Z');
  });
});

describe('localDate', () => {
  test('reports the local day, not the UTC one', () => {
    // 18:45 UTC is already the next day in IST.
    expect(localDate(new Date('2026-08-26T18:45:00Z'), IST)).toBe('2026-08-27');
    expect(localDate(new Date('2026-08-26T18:45:00Z'), 'UTC')).toBe('2026-08-26');
  });
});

describe('shiftDate', () => {
  test('walks whole days without touching a timezone', () => {
    expect(shiftDate('2026-08-27', -1)).toBe('2026-08-26');
    expect(shiftDate('2026-08-27', -89)).toBe('2026-05-30');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('validateTimezone', () => {
  test('rejects junk, and only falls back when told to', () => {
    expect(validateTimezone('Asia/Kolkata')).toBe(IST);
    expect(validateTimezone(null, 'UTC')).toBe('UTC');
    expect(() => validateTimezone(null)).toThrow();
    expect(() => validateTimezone("'; DROP TABLE orders; --")).toThrow();
  });
});
