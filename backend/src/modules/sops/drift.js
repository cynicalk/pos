/**
 * SOP Drift Detection — ported from `modules/sops/drift.ts`, kept pure.
 *
 * "Drift" is the logged operational record deviating from what the procedures
 * mandate: sign-offs not happening, the same hygiene item failing repeatedly,
 * scheduled tests running overdue, service pace slipping.
 *
 * Deterministic, never AI. Every finding is computed from records the
 * operator's own team created, which is what makes it defensible in front of
 * the person it describes. An LLM opinion about whether a kitchen is drifting
 * is not evidence.
 */

const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

const HYGIENE_WINDOW = 7;
const REPEAT_FAIL_THRESHOLD = 3;
// A pattern needs at least two occurrences, whatever the sample size. Scaling
// the threshold down to the sample alone meant a single miss on a restaurant's
// first-ever sign-off was reported as a "recurring failure" — caught on live
// output. One miss is an incident; two is a procedure that is not working.
const MIN_FAILS_FOR_PATTERN = 2;
const STALLED_ALERT_THRESHOLD = 3;

/**
 * @param inputs.shiftCoverage   { windowDays, daysCovered, totalSignoffs }
 * @param inputs.hygieneRecords  recent parsed hygiene checklists
 * @param inputs.repeatFails     [{ id, label, fails }] over those records
 * @param inputs.testingCalendar built testing calendar
 * @param inputs.stalledAlerts   count of stalled_table actions in the last week
 */
function detectDrift({ shiftCoverage, hygieneRecords = [], repeatFails = [], testingCalendar = [], stalledAlerts = 0 }) {
  const findings = [];

  // 1. Shift checklist coverage, against the opening/closing SOPs.
  if (shiftCoverage) {
    if (shiftCoverage.totalSignoffs === 0) {
      findings.push({
        signal: 'Shift checklists not in use',
        detail:
          `No opening or closing sign-off in the last ${shiftCoverage.windowDays} days. ` +
          'The opening and closing procedures have no evidence trail behind them.',
        severity: 'medium',
      });
    } else if (shiftCoverage.daysCovered < shiftCoverage.windowDays) {
      findings.push({
        signal: 'Shift sign-offs missed',
        detail:
          `Sign-offs on only ${shiftCoverage.daysCovered} of the last ` +
          `${shiftCoverage.windowDays} days (${shiftCoverage.totalSignoffs} in total).`,
        severity: 'medium',
      });
    }
  }

  // 2. The same hygiene item failing again and again, against the cleaning SOP.
  // Capped at the sample size so three misses out of two sign-offs is
  // impossible rather than silently unreachable, and floored at
  // MIN_FAILS_FOR_PATTERN so a lone miss is never called recurring.
  const threshold = Math.max(
    MIN_FAILS_FOR_PATTERN,
    Math.min(REPEAT_FAIL_THRESHOLD, hygieneRecords.length),
  );
  if (hygieneRecords.length >= MIN_FAILS_FOR_PATTERN) {
    for (const fail of repeatFails) {
      if (fail.fails >= threshold) {
        findings.push({
          signal: 'Recurring hygiene failure',
          detail:
            `"${fail.label}" was missed on ${fail.fails} of the last ` +
            `${hygieneRecords.length} hygiene sign-offs.`,
          severity: 'high',
        });
      }
    }
  }

  // 3. Overdue scheduled tests.
  for (const test of testingCalendar) {
    if (test.state === 'overdue') {
      findings.push({
        signal: 'Scheduled test overdue',
        detail: `${test.label} is past its due date by ${Math.abs(test.daysToDue)} days.`,
        severity: 'high',
      });
    } else if (test.state === 'never') {
      findings.push({
        signal: 'Scheduled test never recorded',
        detail: `${test.label} has no record at all. Its cadence is every ${test.cadenceDays} days.`,
        severity: 'medium',
      });
    }
  }

  // 4. Service pace, against the service standard.
  if (stalledAlerts >= STALLED_ALERT_THRESHOLD) {
    findings.push({
      signal: 'Service pace drifting',
      detail:
        `${stalledAlerts} stalled-table alerts in the last week — tables are waiting ` +
        'too long between being seated and ordering.',
      severity: 'medium',
    });
  }

  return findings.sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
}

module.exports = {
  HYGIENE_WINDOW, REPEAT_FAIL_THRESHOLD, MIN_FAILS_FOR_PATTERN, STALLED_ALERT_THRESHOLD,
  SEVERITY_RANK, detectDrift,
};
