const repo = require('./compliance.repository');
const checklist = require('../modules/compliance/checklist');
const testing = require('../modules/compliance/testing');
const expiry = require('../modules/compliance/expiry');
const library = require('../modules/sops/library');
const drift = require('../modules/sops/drift');
const { validateTimezone } = require('../shared/timezone');
const db = require('../shared/db');
const { ValidationError, NotFoundError } = require('../shared/errors');

const HYGIENE_HISTORY = 14;
const SHIFT_WINDOW_DAYS = 7;

/**
 * A DATE column arrives from pg as a JS Date and serialises to JSON as a full
 * UTC timestamp — "2026-09-15T18:30:00.000Z" for what the operator entered as
 * 16 September. Every consumer (the page, the evidence pack, the Yumzy tool)
 * wants the plain date, so it is normalised once here rather than sliced in
 * three places. Caught on live output.
 */
const asDate = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? String(d).slice(0, 10) : date.toISOString().slice(0, 10);
};

const tzFor = (restaurantId) =>
  db.query(`SELECT value FROM settings WHERE restaurant_id = $1 AND key = 'timezone'`, [restaurantId])
    .then((r) => validateTimezone(r.rows[0]?.value, 'UTC'));

/**
 * Start of the restaurant's local day, as an instant.
 *
 * "Has today's checklist been signed?" has to mean the restaurant's today. A
 * UTC day boundary would mark an 11pm IST sign-off as belonging to tomorrow.
 */
async function startOfLocalDay(restaurantId) {
  const tz = await tzFor(restaurantId);
  const { rows } = await db.query(
    `SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS start`, [tz],
  );
  return rows[0].start;
}

// ── Hygiene checklist ──────────────────────────────────────────────────────

async function submitHygieneChecklist(restaurantId, checkedIds, signedBy) {
  // A checklist with no name on it is not evidence of anything.
  if (!signedBy || !String(signedBy).trim()) {
    throw new ValidationError('A sign-off needs the name of the person signing');
  }
  const checked = checklist.sanitizeChecked(checkedIds, checklist.CHECKLIST_ITEMS);
  return repo.createDoc(restaurantId, {
    docType: 'hygiene_checklist',
    title: `Hygiene checklist — ${new Date().toISOString().slice(0, 10)}`,
    metadata: { checked },
    signedBy: String(signedBy).trim(),
    signedAt: new Date(),
  });
}

async function getHygiene(restaurantId) {
  const [docs, since] = await Promise.all([
    repo.listDocs(restaurantId, 'hygiene_checklist', HYGIENE_HISTORY),
    startOfLocalDay(restaurantId),
  ]);
  const records = docs.map((d) => checklist.parseRecord(d, checklist.CHECKLIST_ITEMS));
  const today = records.find((r) => new Date(r.date) >= new Date(since)) || null;

  return {
    items: checklist.CHECKLIST_ITEMS,
    today,
    history: records,
    repeatFailures: checklist.repeatFailures(records, checklist.CHECKLIST_ITEMS),
  };
}

// ── Shift checklists ───────────────────────────────────────────────────────

async function submitShiftChecklist(restaurantId, shift, checkedIds, signedBy) {
  if (!checklist.SHIFTS.includes(shift)) {
    throw new ValidationError(`shift must be one of: ${checklist.SHIFTS.join(', ')}`);
  }
  if (!signedBy || !String(signedBy).trim()) {
    throw new ValidationError('A sign-off needs the name of the person signing');
  }
  const items = checklist.SHIFT_ITEMS[shift];
  return repo.createDoc(restaurantId, {
    docType: 'shift_checklist',
    title: `${shift[0].toUpperCase()}${shift.slice(1)} checklist — ${new Date().toISOString().slice(0, 10)}`,
    metadata: { shift, checked: checklist.sanitizeChecked(checkedIds, items) },
    signedBy: String(signedBy).trim(),
    signedAt: new Date(),
  });
}

async function getShiftChecklists(restaurantId) {
  const [docs, since] = await Promise.all([
    repo.listDocs(restaurantId, 'shift_checklist', 60),
    startOfLocalDay(restaurantId),
  ]);

  const today = {};
  for (const doc of docs) {
    const shift = doc.metadata?.shift;
    if (!checklist.SHIFTS.includes(shift)) continue;
    if (new Date(doc.created_at) < new Date(since)) continue;
    if (!today[shift]) today[shift] = checklist.parseRecord(doc, checklist.SHIFT_ITEMS[shift]);
  }

  const cutoff = Date.now() - SHIFT_WINDOW_DAYS * 86400000;
  const recent = docs.filter((d) => new Date(d.created_at).getTime() >= cutoff);

  return {
    items: checklist.SHIFT_ITEMS,
    today,
    coverage: checklist.shiftCoverage(recent, SHIFT_WINDOW_DAYS),
  };
}

// ── Licence, certificates, tests ───────────────────────────────────────────

async function saveLicence(restaurantId, { number, validUntil, validFrom }) {
  if (!number || !String(number).trim()) throw new ValidationError('A licence number is required');
  if (!validUntil) throw new ValidationError('A licence needs an expiry date');
  return repo.createDoc(restaurantId, {
    docType: 'fssai_license',
    title: `FSSAI licence ${String(number).trim()}`,
    metadata: { number: String(number).trim(), subject: 'fssai' },
    validFrom: validFrom || null,
    validUntil,
  });
}

async function saveStaffCert(restaurantId, { userId, certType, holderName, validUntil }) {
  if (!holderName) throw new ValidationError('A certificate needs the name of its holder');
  if (!validUntil) throw new ValidationError('A certificate needs an expiry date');
  const type = certType || 'food_handler';
  return repo.createDoc(restaurantId, {
    docType: 'staff_cert',
    title: `${holderName} — ${type.replace(/_/g, ' ')}`,
    // `subject` is what makes a renewal supersede the record it replaces
    // instead of both sitting in the pack, one of them permanently expired.
    metadata: {
      userId: userId || null, certType: type, holderName,
      subject: `${userId || holderName}:${type}`,
    },
    validUntil,
  });
}

async function recordTest(restaurantId, { testType, signedBy, notes }) {
  const type = testing.TEST_TYPES.find((t) => t.id === testType);
  if (!type) {
    throw new ValidationError(
      `testType must be one of: ${testing.TEST_TYPES.map((t) => t.id).join(', ')}`,
    );
  }
  const signedAt = new Date();
  return repo.createDoc(restaurantId, {
    docType: 'test_record',
    title: `${type.label} — ${signedAt.toISOString().slice(0, 10)}`,
    metadata: { testType: type.id, subject: type.id, notes: notes || null },
    signedBy: signedBy || null,
    signedAt,
    validUntil: new Date(signedAt.getTime() + type.cadenceDays * 86400000)
      .toISOString().slice(0, 10),
  });
}

const getTestingCalendar = async (restaurantId) =>
  testing.buildTestingCalendar(await repo.listDocs(restaurantId, 'test_record', 200));

// ── Overview + evidence pack ───────────────────────────────────────────────

/**
 * One compliance snapshot, and the single source for both the page and the
 * Yumzy compliance tool — so the assistant and the screen can never disagree
 * about whether this kitchen is compliant.
 */
async function getOverview(restaurantId) {
  const [licenceDoc, certDocs, calendar, hygiene, shifts, stalled] = await Promise.all([
    repo.getLatestDoc(restaurantId, 'fssai_license'),
    repo.listDocs(restaurantId, 'staff_cert', 200),
    getTestingCalendar(restaurantId),
    getHygiene(restaurantId),
    getShiftChecklists(restaurantId),
    repo.countRecentStalledAlerts(restaurantId),
  ]);

  const licence = {
    onFile: Boolean(licenceDoc),
    number: licenceDoc?.metadata?.number || null,
    validUntil: asDate(licenceDoc?.valid_until),
    ...expiry.expiryStatus(licenceDoc?.valid_until),
  };

  // Newest certificate per holder+type, so a renewal supersedes the old row.
  const bySubject = new Map();
  for (const doc of certDocs) {
    const key = doc.metadata?.subject || doc.id;
    if (!bySubject.has(key)) bySubject.set(key, doc);
  }
  const certs = [...bySubject.values()].map((doc) => ({
    id: doc.id,
    holderName: doc.metadata?.holderName || doc.title,
    certType: doc.metadata?.certType || 'unknown',
    validUntil: asDate(doc.valid_until),
    ...expiry.expiryStatus(doc.valid_until),
  }));

  const findings = drift.detectDrift({
    shiftCoverage: shifts.coverage,
    hygieneRecords: hygiene.history,
    repeatFails: hygiene.repeatFailures,
    testingCalendar: calendar,
    stalledAlerts: stalled,
  });

  return {
    licence,
    certs,
    testing: calendar,
    hygiene: {
      today: hygiene.today,
      itemCount: hygiene.items.length,
      history: hygiene.history.slice(0, 7),
    },
    shifts,
    drift: findings,
    // Worst-wins across licence and certificates, with 'unknown' outranking
    // 'valid': a missing expiry date is not a pass.
    headline: expiry.worstStatus([licence.state, ...certs.map((c) => c.state)]),
  };
}

/**
 * The audit evidence pack: what an inspector would ask for, with the gaps
 * NAMED rather than omitted. A pack listing only what exists tells the operator
 * nothing about what they will be asked for and cannot produce.
 */
async function getEvidencePack(restaurantId) {
  const overview = await getOverview(restaurantId);
  const docs = await repo.listDocs(restaurantId, null, 200);

  const gaps = [];
  if (!overview.licence.onFile) gaps.push('No FSSAI licence on file.');
  else if (overview.licence.state === 'expired') gaps.push('The FSSAI licence has expired.');
  if (overview.certs.length === 0) gaps.push('No staff certificates recorded.');
  for (const cert of overview.certs.filter((c) => c.state === 'expired')) {
    gaps.push(`${cert.holderName}: ${cert.certType.replace(/_/g, ' ')} has expired.`);
  }
  for (const test of overview.testing.filter((t) => t.state === 'never' || t.state === 'overdue')) {
    gaps.push(`${test.label}: ${test.state === 'never' ? 'never recorded' : 'overdue'}.`);
  }
  if (!overview.hygiene.today) gaps.push('No hygiene checklist signed off today.');

  return {
    generatedAt: new Date().toISOString(),
    headline: overview.headline,
    licence: overview.licence,
    certs: overview.certs,
    testing: overview.testing,
    hygiene: overview.hygiene,
    shifts: overview.shifts,
    drift: overview.drift,
    documents: docs.map((d) => ({
      id: d.id,
      docType: d.doc_type,
      title: d.title,
      validUntil: asDate(d.valid_until),
      signedBy: d.signed_by,
      createdAt: d.created_at,
    })),
    gaps,
  };
}

/** Plain-text snapshot, for grounding the assistant. */
function renderSnapshot(overview) {
  const lines = ['FSSAI LICENCE'];
  lines.push(overview.licence.onFile
    ? `Number ${overview.licence.number}, expires ${overview.licence.validUntil} — ${overview.licence.state}.`
    : 'No licence on file.');

  lines.push('', `STAFF CERTIFICATES (${overview.certs.length})`);
  if (!overview.certs.length) lines.push('None recorded.');
  for (const c of overview.certs) {
    lines.push(`- ${c.holderName}: ${c.certType.replace(/_/g, ' ')} — ${c.state}`
      + (c.validUntil ? ` (expires ${c.validUntil})` : ''));
  }

  lines.push('', 'TESTING CALENDAR');
  for (const t of overview.testing) {
    lines.push(`- ${t.label}: ${t.state}`
      + (t.nextDue ? ` (next due ${String(t.nextDue).slice(0, 10)})` : ''));
  }

  lines.push('', 'HYGIENE');
  lines.push(overview.hygiene.today
    ? `Signed off today by ${overview.hygiene.today.signedBy}, `
      + `${overview.hygiene.today.checkedIds.length} of ${overview.hygiene.itemCount} items passed.`
    : 'Not signed off today.');

  lines.push('', 'SHIFT SIGN-OFFS');
  lines.push(`${overview.shifts.coverage.totalSignoffs} in the last `
    + `${overview.shifts.coverage.windowDays} days, covering `
    + `${overview.shifts.coverage.daysCovered} days.`);

  lines.push('', 'DRIFT FINDINGS');
  if (!overview.drift.length) lines.push('None.');
  for (const f of overview.drift) lines.push(`- [${f.severity}] ${f.signal}: ${f.detail}`);

  return lines.join('\n');
}

const getSnapshotText = async (restaurantId) => renderSnapshot(await getOverview(restaurantId));

// ── SOPs ───────────────────────────────────────────────────────────────────

const getSopLibrary = async (restaurantId) =>
  library.buildLibrary(await repo.listSops(restaurantId));

async function getSopHistory(restaurantId, slug) {
  if (!library.SLUGS.includes(slug)) throw new NotFoundError('SOP');
  return {
    slug,
    template: library.templateFor(slug),
    versions: await repo.getSopVersions(restaurantId, slug),
  };
}

async function saveSop(restaurantId, { slug, title, content, source }, userId) {
  const topic = library.templateFor(slug);
  if (!topic) throw new NotFoundError('SOP');
  if (!content || !String(content).trim()) throw new ValidationError('An SOP needs content');
  return repo.insertSopVersion(restaurantId, {
    slug,
    title: title || topic.title,
    content: String(content).trim(),
    source: ['template', 'ai', 'manual'].includes(source) ? source : 'manual',
    createdBy: userId,
  });
}

/** Adopt the built-in template as a real version — the zero-effort start. */
async function adoptTemplate(restaurantId, slug, userId) {
  const topic = library.templateFor(slug);
  if (!topic) throw new NotFoundError('SOP');
  return repo.insertSopVersion(restaurantId, {
    slug,
    title: topic.title,
    content: topic.template,
    source: 'template',
    createdBy: userId,
  });
}

const getDrift = async (restaurantId) => (await getOverview(restaurantId)).drift;

module.exports = {
  HYGIENE_HISTORY, SHIFT_WINDOW_DAYS,
  submitHygieneChecklist, getHygiene,
  submitShiftChecklist, getShiftChecklists,
  saveLicence, saveStaffCert, recordTest, getTestingCalendar,
  getOverview, getEvidencePack, renderSnapshot, getSnapshotText,
  getSopLibrary, getSopHistory, saveSop, adoptTemplate, getDrift,
  listDocs: repo.listDocs, deleteDoc: repo.deleteDoc,
};
