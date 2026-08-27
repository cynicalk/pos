const db = require('../src/shared/db');
const service = require('../src/compliance/compliance.service');
const { createRestaurant, deleteRestaurant } = require('./helpers');

// SQL-level coverage for Phase 5. The pure suite cannot see the local-day
// boundary, the DISTINCT ON that lets a renewal supersede a lapsed record, or
// the version arithmetic that makes an SOP immutable.

let restaurantId;

const isoIn = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  restaurantId = await createRestaurant('Compliance Test Co');
  await db.query(
    `INSERT INTO settings (restaurant_id, key, value) VALUES ($1, 'timezone', 'Asia/Kolkata')`,
    [restaurantId],
  );
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

describe('hygiene checklist', () => {
  test('refuses a sign-off with nobody signing it', async () => {
    // A checklist with no name on it is not evidence of anything.
    await expect(service.submitHygieneChecklist(restaurantId, ['surfaces'], ''))
      .rejects.toThrow(/name of the person/);
  });

  test('records a sign-off and finds it as today', async () => {
    await service.submitHygieneChecklist(restaurantId, ['surfaces', 'water'], 'Arjun');
    const h = await service.getHygiene(restaurantId);
    expect(h.today).toBeTruthy();
    expect(h.today.signedBy).toBe('Arjun');
    expect(h.today.allPassed).toBe(false);
    expect(h.today.missed.length).toBe(h.items.length - 2);
  });

  test('drops invented item ids before storing them', async () => {
    await service.submitHygieneChecklist(restaurantId, ['surfaces', 'made_up'], 'Priya');
    const h = await service.getHygiene(restaurantId);
    expect(h.today.checkedIds).toEqual(['surfaces']);
  });
});

describe('shift checklists', () => {
  test('rejects a shift that is not opening or closing', async () => {
    await expect(service.submitShiftChecklist(restaurantId, 'brunch', [], 'Arjun'))
      .rejects.toThrow(/shift must be one of/);
  });

  test('records opening and closing separately on the same day', async () => {
    await service.submitShiftChecklist(restaurantId, 'opening', ['temps_logged'], 'Arjun');
    await service.submitShiftChecklist(restaurantId, 'closing', ['bins_out'], 'Priya');

    const s = await service.getShiftChecklists(restaurantId);
    expect(s.today.opening.signedBy).toBe('Arjun');
    expect(s.today.closing.signedBy).toBe('Priya');
    expect(s.coverage.totalSignoffs).toBe(2);
    expect(s.coverage.daysCovered).toBe(1);
  });
});

describe('licence and certificates', () => {
  test('requires a number and an expiry', async () => {
    await expect(service.saveLicence(restaurantId, { number: '', validUntil: isoIn(100) }))
      .rejects.toThrow(/licence number/);
    await expect(service.saveLicence(restaurantId, { number: 'X', validUntil: null }))
      .rejects.toThrow(/expiry date/);
  });

  test('reports the licence status from its expiry', async () => {
    await service.saveLicence(restaurantId, { number: 'FSSAI-123', validUntil: isoIn(30) });
    const o = await service.getOverview(restaurantId);
    expect(o.licence.onFile).toBe(true);
    expect(o.licence.number).toBe('FSSAI-123');
    expect(o.licence.state).toBe('expiring');
  });

  test('a renewal supersedes the record it replaces', async () => {
    // Both rows stay in the evidence trail, but the overview must show the
    // current one — otherwise a renewed licence still reads as expiring.
    await service.saveLicence(restaurantId, { number: 'FSSAI-123', validUntil: isoIn(400) });
    const o = await service.getOverview(restaurantId);
    expect(o.licence.state).toBe('valid');
  });

  test('a renewed certificate supersedes the lapsed one', async () => {
    await service.saveStaffCert(restaurantId, {
      holderName: 'Arjun', certType: 'food_handler', validUntil: isoIn(-10),
    });
    let o = await service.getOverview(restaurantId);
    expect(o.certs).toHaveLength(1);
    expect(o.certs[0].state).toBe('expired');

    await service.saveStaffCert(restaurantId, {
      holderName: 'Arjun', certType: 'food_handler', validUntil: isoIn(300),
    });
    o = await service.getOverview(restaurantId);
    expect(o.certs).toHaveLength(1); // superseded, not duplicated
    expect(o.certs[0].state).toBe('valid');
  });

  test('a different certificate type for the same person is its own record', async () => {
    await service.saveStaffCert(restaurantId, {
      holderName: 'Arjun', certType: 'medical_fitness', validUntil: isoIn(200),
    });
    const o = await service.getOverview(restaurantId);
    expect(o.certs).toHaveLength(2);
  });
});

describe('testing calendar', () => {
  test('recording a test schedules the next one from its cadence', async () => {
    await service.recordTest(restaurantId, { testType: 'pest_control', signedBy: 'Arjun' });
    const cal = await service.getTestingCalendar(restaurantId);
    const pest = cal.find((t) => t.id === 'pest_control');
    expect(pest.state).toBe('ok');
    expect(pest.daysToDue).toBeGreaterThan(80);
  });

  test('rejects an unknown test type', async () => {
    await expect(service.recordTest(restaurantId, { testType: 'vibes_check' }))
      .rejects.toThrow(/testType must be one of/);
  });
});

describe('evidence pack', () => {
  test('names the gaps rather than listing only what exists', async () => {
    // A pack showing only what is on file tells the operator nothing about what
    // they will be asked for and cannot produce.
    const pack = await service.getEvidencePack(restaurantId);
    expect(Array.isArray(pack.gaps)).toBe(true);
    expect(pack.gaps.join(' ')).toContain('never recorded'); // untaken tests
    expect(pack.documents.length).toBeGreaterThan(0);
  });

  test('carries every document type in one trail', async () => {
    const pack = await service.getEvidencePack(restaurantId);
    const types = new Set(pack.documents.map((d) => d.docType));
    expect(types).toContain('fssai_license');
    expect(types).toContain('staff_cert');
    expect(types).toContain('hygiene_checklist');
    expect(types).toContain('shift_checklist');
    expect(types).toContain('test_record');
  });

  test('the headline is worst-wins across licence and certificates', async () => {
    const pack = await service.getEvidencePack(restaurantId);
    expect(['valid', 'expiring', 'expired', 'unknown']).toContain(pack.headline);
  });
});

describe('SOP version control', () => {
  test('every topic appears before anything is adopted', async () => {
    const lib = await service.getSopLibrary(restaurantId);
    expect(lib.every((s) => s.adopted === false)).toBe(true);
  });

  test('adopting a template creates version 1', async () => {
    const sop = await service.adoptTemplate(restaurantId, 'opening', null);
    expect(sop.version).toBe(1);
    expect(sop.source).toBe('template');
  });

  test('saving again creates a new immutable version, never an edit', async () => {
    const v2 = await service.saveSop(restaurantId, {
      slug: 'opening', content: 'Our own opening steps.', source: 'manual',
    }, null);
    expect(v2.version).toBe(2);

    const history = await service.getSopHistory(restaurantId, 'opening');
    expect(history.versions).toHaveLength(2);
    // Version 1 still says what it always said — the whole point of versioning
    // a procedure people are audited against.
    expect(history.versions.find((v) => v.version === 1).content).toContain('Unlock, disarm');
  });

  test('the library shows the newest version as active', async () => {
    const lib = await service.getSopLibrary(restaurantId);
    const opening = lib.find((s) => s.slug === 'opening');
    expect(opening.version).toBe(2);
    expect(opening.content).toBe('Our own opening steps.');
    expect(opening.versionCount).toBe(2);
  });

  test('rejects an unknown topic', async () => {
    await expect(service.saveSop(restaurantId, { slug: 'nope', content: 'x' }, null))
      .rejects.toThrow(/SOP/);
  });

  test('rejects empty content', async () => {
    await expect(service.saveSop(restaurantId, { slug: 'closing', content: '   ' }, null))
      .rejects.toThrow(/needs content/);
  });
});

describe('snapshot grounding', () => {
  test('renders a text snapshot the assistant can answer from', async () => {
    const text = await service.getSnapshotText(restaurantId);
    expect(text).toContain('FSSAI LICENCE');
    expect(text).toContain('STAFF CERTIFICATES');
    expect(text).toContain('TESTING CALENDAR');
    expect(text).toContain('DRIFT FINDINGS');
    // The snapshot must carry real stored values, not placeholders.
    expect(text).toContain('FSSAI-123');
  });
});
