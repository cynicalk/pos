/**
 * Guest cohorts — retention triangle + cumulative LTV, pure.
 *
 * Groups guests by the month of their first visit, then for each month-offset
 * since, reports how many of the cohort came back (retention) and the cumulative
 * revenue per original guest (LTV). This is the standard cohort read: each row is
 * a starting month, each column a month later, so an operator sees whether newer
 * cohorts retain better or worse than older ones — the question a flat "repeat
 * rate" can't answer.
 *
 * Honest by construction: retention is against the cohort's OWN size (offset 0),
 * never a blended base; LTV divides by that same size; and the triangle only
 * fills the offsets each cohort has actually had the calendar time to reach — a
 * cohort one month old shows one column, not zeros pretending it churned.
 *
 * Input: [{ cohort:'YYYY-MM', month_offset, active_guests, revenue }]
 */
const round2 = (v) => Math.round(Number(v) * 100) / 100;

function buildCohorts(rows = []) {
  const byCohort = new Map();
  for (const r of rows) {
    if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, new Map());
    byCohort.get(r.cohort).set(Number(r.month_offset), { active: Number(r.active_guests), revenue: Number(r.revenue) });
  }

  const cohorts = [...byCohort.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cohort, offsets]) => {
      const size = offsets.get(0)?.active || 0;
      const maxOffset = Math.max(...offsets.keys());
      let cumulativeRevenue = 0;
      const months = [];
      for (let o = 0; o <= maxOffset; o += 1) {
        const cell = offsets.get(o);
        cumulativeRevenue += cell ? cell.revenue : 0;
        months.push({
          offset: o,
          activeGuests: cell ? cell.active : 0,
          retentionPct: size > 0 ? Math.round(((cell ? cell.active : 0) / size) * 1000) / 10 : null,
          cumulativeLtv: size > 0 ? round2(cumulativeRevenue / size) : null,
        });
      }
      return { cohort, size, months };
    });

  return {
    cohorts,
    maxOffset: cohorts.reduce((m, c) => Math.max(m, c.months.length - 1), 0),
    totalGuests: cohorts.reduce((s, c) => s + c.size, 0),
  };
}

module.exports = { buildCohorts };
