/**
 * Testing Calendar — ported from `modules/compliance/testing.ts`.
 *
 * Each completed test is a compliance_doc, so records flow into the evidence
 * pack alongside everything else rather than living in their own silo.
 */

const TEST_TYPES = [
  { id: 'water_potability',   label: 'Water potability test', cadenceDays: 180 },
  { id: 'food_sample_lab',    label: 'Food sample lab test',  cadenceDays: 180 },
  { id: 'pest_control',       label: 'Pest control service',  cadenceDays: 90 },
  { id: 'kitchen_deep_clean', label: 'Kitchen deep clean',    cadenceDays: 30 },
];

const DUE_SOON_DAYS = 14;

/**
 * @param records compliance_docs of type 'test_record', newest first, each with
 *                metadata.testType and a signed_at/created_at
 */
function buildTestingCalendar(records, now = Date.now()) {
  return TEST_TYPES.map((type) => {
    const latest = (records || []).find((r) => r.metadata?.testType === type.id);

    // 'never' is its own state rather than 'overdue'. A test that has never been
    // run and one that lapsed last week need different words: "start doing this"
    // versus "you are late". Both are red; only one is a lapse.
    if (!latest) {
      return { ...type, lastDone: null, nextDue: null, state: 'never' };
    }

    const lastDone = new Date(latest.signed_at || latest.created_at);
    const nextDue = new Date(lastDone.getTime() + type.cadenceDays * 86400000);
    const daysToDue = Math.floor((nextDue.getTime() - now) / 86400000);

    let state = 'ok';
    if (daysToDue < 0) state = 'overdue';
    else if (daysToDue <= DUE_SOON_DAYS) state = 'due_soon';

    return {
      ...type,
      lastDone: lastDone.toISOString(),
      nextDue: nextDue.toISOString(),
      daysToDue,
      state,
    };
  });
}

module.exports = { TEST_TYPES, DUE_SOON_DAYS, buildTestingCalendar };
