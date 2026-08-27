const checklist = require('../src/modules/compliance/checklist');
const testing = require('../src/modules/compliance/testing');
const expiry = require('../src/modules/compliance/expiry');
const library = require('../src/modules/sops/library');
const drift = require('../src/modules/sops/drift');
const expiries = require('../src/modules/rules/expiries');

// Compliance and SOPs (MERGE_PLAN.md Phase 5). Pure — the SQL half is covered
// in compliance-db.test.js.

describe('expiry status', () => {
  const NOW = new Date('2026-08-27T00:00:00Z').getTime();
  const inDays = (d) => new Date(NOW + d * 86400000).toISOString().slice(0, 10);

  test('separates "no date on file" from "in date"', () => {
    // The failure this guards: collapsing unknown into valid lets a missing
    // record pass an audit view as a healthy one.
    expect(expiry.expiryStatus(null, NOW).state).toBe('unknown');
    expect(expiry.expiryStatus(inDays(200), NOW).state).toBe('valid');
  });

  test('warns far enough ahead to actually renew', () => {
    // FSSAI renewals routinely take 30-60 days, so a 7-day warning is useless.
    expect(expiry.EXPIRY_WARNING_DAYS).toBe(60);
    expect(expiry.expiryStatus(inDays(45), NOW).state).toBe('expiring');
    expect(expiry.expiryStatus(inDays(61), NOW).state).toBe('valid');
  });

  test('reports a lapsed date as expired with days elapsed', () => {
    const s = expiry.expiryStatus(inDays(-5), NOW);
    expect(s.state).toBe('expired');
    expect(s.daysToExpiry).toBe(-5);
  });

  test('unknown outranks valid when rolling up', () => {
    // A pack with one undated certificate is not "compliant", it is "we cannot
    // tell". Reporting green there is the failure a pack exists to prevent.
    expect(expiry.worstStatus(['valid', 'valid'])).toBe('valid');
    expect(expiry.worstStatus(['valid', 'unknown'])).toBe('unknown');
    expect(expiry.worstStatus(['unknown', 'expired'])).toBe('expired');
    expect(expiry.worstStatus(['valid', 'expiring'])).toBe('expiring');
    expect(expiry.worstStatus([])).toBe('unknown');
  });
});

describe('checklists', () => {
  test('discards ticks that are not real items', () => {
    // A client cannot invent a passing tick.
    const clean = checklist.sanitizeChecked(
      ['surfaces', 'not_a_real_item', 'water'], checklist.CHECKLIST_ITEMS,
    );
    expect(clean).toEqual(['surfaces', 'water']);
  });

  test('deduplicates repeated ticks', () => {
    expect(checklist.sanitizeChecked(
      ['surfaces', 'surfaces'], checklist.CHECKLIST_ITEMS,
    )).toEqual(['surfaces']);
  });

  test('reports what was missed, not just what passed', () => {
    const record = checklist.parseRecord(
      { id: '1', created_at: '2026-08-26', signed_by: 'Arjun', metadata: { checked: ['surfaces'] } },
      checklist.CHECKLIST_ITEMS,
    );
    expect(record.allPassed).toBe(false);
    expect(record.missed).toHaveLength(checklist.CHECKLIST_ITEMS.length - 1);
    expect(record.missed[0]).toHaveProperty('label');
  });

  test('counts which item keeps failing across sign-offs', () => {
    const records = [
      { checkedIds: checklist.CHECKLIST_ITEMS.map((i) => i.id).filter((i) => i !== 'pest_check') },
      { checkedIds: checklist.CHECKLIST_ITEMS.map((i) => i.id).filter((i) => i !== 'pest_check') },
      { checkedIds: checklist.CHECKLIST_ITEMS.map((i) => i.id) },
    ];
    const fails = checklist.repeatFailures(records, checklist.CHECKLIST_ITEMS);
    expect(fails[0]).toMatchObject({ id: 'pest_check', fails: 2 });
  });

  test('coverage counts distinct days, not sign-off count', () => {
    // Two sign-offs on one day is one day covered — otherwise a single busy
    // day could paper over a week of silence.
    const cov = checklist.shiftCoverage([
      { created_at: '2026-08-26T09:00:00Z' },
      { created_at: '2026-08-26T22:00:00Z' },
      { created_at: '2026-08-25T09:00:00Z' },
    ], 7);
    expect(cov.daysCovered).toBe(2);
    expect(cov.totalSignoffs).toBe(3);
  });
});

describe('testing calendar', () => {
  const NOW = new Date('2026-08-27T00:00:00Z').getTime();
  const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

  test('a test never run is "never", not "overdue"', () => {
    // Different words for different actions: "start doing this" vs "you are late".
    const cal = testing.buildTestingCalendar([], NOW);
    expect(cal.every((t) => t.state === 'never')).toBe(true);
    expect(cal.every((t) => t.nextDue === null)).toBe(true);
  });

  test('schedules the next date from the cadence', () => {
    const cal = testing.buildTestingCalendar([
      { metadata: { testType: 'pest_control' }, signed_at: daysAgo(10) },
    ], NOW);
    const pest = cal.find((t) => t.id === 'pest_control');
    expect(pest.state).toBe('ok');
    expect(pest.daysToDue).toBe(80); // 90-day cadence, done 10 days ago
  });

  test('flags due-soon and overdue', () => {
    const soon = testing.buildTestingCalendar([
      { metadata: { testType: 'kitchen_deep_clean' }, signed_at: daysAgo(20) },
    ], NOW).find((t) => t.id === 'kitchen_deep_clean');
    expect(soon.state).toBe('due_soon');

    const late = testing.buildTestingCalendar([
      { metadata: { testType: 'kitchen_deep_clean' }, signed_at: daysAgo(40) },
    ], NOW).find((t) => t.id === 'kitchen_deep_clean');
    expect(late.state).toBe('overdue');
    expect(late.daysToDue).toBeLessThan(0);
  });
});

describe('SOP library', () => {
  test('shows every topic even when none has been adopted', () => {
    // An unwritten SOP is the most important row on the page.
    const lib = library.buildLibrary([]);
    expect(lib).toHaveLength(library.SLUGS.length);
    expect(lib.every((s) => s.adopted === false && s.version === 0)).toBe(true);
    expect(lib.every((s) => s.content.length > 100)).toBe(true); // real procedures
  });

  test('the highest version is the active one', () => {
    const lib = library.buildLibrary([
      { slug: 'opening', title: 'Opening v1', content: 'old', version: 1, source: 'template' },
      { slug: 'opening', title: 'Opening v3', content: 'new', version: 3, source: 'manual' },
      { slug: 'opening', title: 'Opening v2', content: 'mid', version: 2, source: 'ai' },
    ]);
    const opening = lib.find((s) => s.slug === 'opening');
    expect(opening.version).toBe(3);
    expect(opening.content).toBe('new');
    expect(opening.versionCount).toBe(3);
    expect(opening.adopted).toBe(true);
  });

  test('an unknown slug has no template', () => {
    expect(library.templateFor('not-a-topic')).toBeNull();
  });
});

describe('drift detection', () => {
  test('flags checklists that are not being used at all', () => {
    const f = drift.detectDrift({
      shiftCoverage: { windowDays: 7, daysCovered: 0, totalSignoffs: 0 },
    });
    expect(f[0].signal).toBe('Shift checklists not in use');
  });

  test('flags partial coverage separately from none', () => {
    const f = drift.detectDrift({
      shiftCoverage: { windowDays: 7, daysCovered: 3, totalSignoffs: 4 },
    });
    expect(f[0].signal).toBe('Shift sign-offs missed');
    expect(f[0].detail).toContain('3 of the last 7');
  });

  test('a repeat hygiene failure outranks a missed sign-off', () => {
    const f = drift.detectDrift({
      shiftCoverage: { windowDays: 7, daysCovered: 3, totalSignoffs: 4 },
      hygieneRecords: [{}, {}, {}, {}],
      repeatFails: [{ id: 'pest_check', label: 'No pest activity observed', fails: 3 }],
    });
    expect(f[0].severity).toBe('high');
    expect(f[0].signal).toBe('Recurring hygiene failure');
  });

  test('the repeat threshold cannot exceed the sample size', () => {
    // Three misses out of two sign-offs must be impossible, not merely
    // unreachable — otherwise the rule is silently dead on a new restaurant.
    const f = drift.detectDrift({
      hygieneRecords: [{}, {}],
      repeatFails: [{ id: 'x', label: 'Item', fails: 2 }],
    });
    expect(f.some((x) => x.signal === 'Recurring hygiene failure')).toBe(true);
  });

  test('one miss on one sign-off is an incident, not a recurring failure', () => {
    // Caught on live output: a restaurant's first-ever sign-off with two items
    // unticked reported both as "missed on 1 of the last 1" recurring failures.
    const f = drift.detectDrift({
      hygieneRecords: [{}],
      repeatFails: [{ id: 'pest_check', label: 'No pest activity observed', fails: 1 }],
    });
    expect(f.some((x) => x.signal === 'Recurring hygiene failure')).toBe(false);
  });

  test('says nothing about hygiene when there are no sign-offs to judge', () => {
    const f = drift.detectDrift({ hygieneRecords: [], repeatFails: [] });
    expect(f.some((x) => x.signal === 'Recurring hygiene failure')).toBe(false);
  });

  test('picks up an overdue test and a drifting service pace', () => {
    const f = drift.detectDrift({
      testingCalendar: [{ label: 'Pest control service', state: 'overdue', daysToDue: -12, cadenceDays: 90 }],
      stalledAlerts: 5,
    });
    expect(f.map((x) => x.signal)).toEqual(
      expect.arrayContaining(['Scheduled test overdue', 'Service pace drifting']),
    );
    expect(f[0].severity).toBe('high'); // sorted worst-first
  });

  test('a quiet week produces no findings at all', () => {
    const f = drift.detectDrift({
      shiftCoverage: { windowDays: 7, daysCovered: 7, totalSignoffs: 14 },
      hygieneRecords: [{}], repeatFails: [],
      testingCalendar: [{ label: 'X', state: 'ok', daysToDue: 40 }],
      stalledAlerts: 0,
    });
    expect(f).toHaveLength(0);
  });
});

describe('expiry rules', () => {
  const licenceRule = {
    id: 'r1', enabled: true, severity: 'high', rule_type: 'license_expiry',
    condition: { field: 'days_to_expiry', op: '<=', value: 60 },
    message_template: 'Licence {number} expires in {days_to_expiry} days ({expiry_date}).',
  };
  const certRule = {
    id: 'r2', enabled: true, severity: 'medium', rule_type: 'cert_expiry',
    condition: { field: 'days_to_expiry', op: '<=', value: 60 },
    message_template: "{holder}'s {cert_type} expires in {days_to_expiry} days ({expiry_date}).",
  };

  test('fires inside the renewal window', () => {
    const [a] = expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: '2026-09-10', daysToExpiry: 14 },
    });
    expect(a.title).toContain('14 days');
    expect(a.priority).toBe('high');
  });

  test('escalates an expired licence above a merely expiring one', () => {
    // Trading without a valid licence is the thing that closes a restaurant.
    const [a] = expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: '2026-08-01', daysToExpiry: -26 },
    });
    expect(a.priority).toBe('critical');
    expect(a.title).toContain('expired 26 days ago');
  });

  test('an expired record is worded in the past tense, never as a negative countdown', () => {
    // Caught on live output: the future-tense template rendered a lapsed
    // licence as "expires in -26 days".
    const [a] = expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: '2026-08-01', daysToExpiry: -26 },
    });
    expect(a.description).toContain('expired on 2026-08-01');
    expect(a.description).not.toContain('-26');
    expect(a.description).not.toMatch(/expires in/);
  });

  test('renders a Date object as an ISO date, not a JS toString', () => {
    // valid_until arrives from pg as a Date; String(d).slice(0,10) gave
    // "Wed Sep 16", which is neither readable back nor sortable.
    const [a] = expiries.evaluateLicenceExpiry([licenceRule], {
      licence: {
        onFile: true, number: 'ABC',
        validUntil: new Date('2026-09-16T00:00:00Z'), daysToExpiry: 14,
      },
    });
    expect(a.description).toContain('2026-09-16');
    expect(a.dedupeKey).toBe('license_expiry:2026-09-16');
  });

  test('says nothing when there is no expiry date to judge', () => {
    // 'unknown' is a different problem with a different fix — record the date.
    expect(expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: null, daysToExpiry: null },
    })).toHaveLength(0);
  });

  test('stays quiet on a licence with plenty of time left', () => {
    expect(expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: '2027-08-01', daysToExpiry: 339 },
    })).toHaveLength(0);
  });

  test('raises one alert per certificate, keyed to it', () => {
    const found = expiries.evaluateCertExpiry([certRule], {
      certs: [
        { id: 'c1', holderName: 'Arjun', certType: 'food_handler', validUntil: '2026-09-05', daysToExpiry: 9 },
        { id: 'c2', holderName: 'Priya', certType: 'medical_fitness', validUntil: '2026-08-01', daysToExpiry: -26 },
        { id: 'c3', holderName: 'Ravi', certType: 'food_handler', validUntil: '2027-01-01', daysToExpiry: 200 },
      ],
    });
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.dedupeKey)).toEqual(['cert_expiry:c1', 'cert_expiry:c2']);
    expect(found[1].priority).toBe('high'); // expired
    expect(found[0].description).toContain('food handler');
    expect(found[1].description).toContain('expired on');
    expect(found[1].description).not.toContain('-26');
  });

  test('a renewed licence retires the old alert via its key', () => {
    const before = expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: '2026-09-10', daysToExpiry: 14 },
    })[0];
    const after = expiries.evaluateLicenceExpiry([licenceRule], {
      licence: { onFile: true, number: 'ABC', validUntil: '2027-09-10', daysToExpiry: 379 },
    })[0];
    expect(before.dedupeKey).toBe('license_expiry:2026-09-10');
    expect(after).toBeUndefined(); // out of the window entirely
  });
});
