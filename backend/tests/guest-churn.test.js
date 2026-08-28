const churn = require('../src/modules/guests/churn');

/**
 * Churn is predicted from each guest's own cadence, so the tests pin the two
 * things that matter: it measures the rhythm correctly, and it refuses to invent
 * one where there isn't enough history.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-28T12:00:00Z').getTime();
const ago = (d) => new Date(NOW - d * DAY).toISOString();

// A guest visiting every ~7 days, last seen `lastAgo` days ago.
const weekly = (id, lastAgo, spend = 5000) => ({
  customerId: id, phone: `9${id}`, name: id, totalSpend: spend,
  orderDates: [ago(lastAgo + 21), ago(lastAgo + 14), ago(lastAgo + 7), ago(lastAgo)],
});

describe('churn cadence & status', () => {
  test('a weekly guest seen 5 days ago is active', () => {
    const { guests } = churn.buildChurnPredictions([weekly('a', 5)], NOW);
    const g = guests[0];
    expect(g.cadenceDays).toBe(7);
    expect(g.status).toBe('active');       // 5/7 < 1
    expect(g.regularity).toBe('regular');
  });

  test('the same guest gone 9 days is due, 15 overdue, 30 likely lost', () => {
    const due = churn.buildChurnPredictions([weekly('a', 9)], NOW).guests[0];
    const over = churn.buildChurnPredictions([weekly('a', 15)], NOW).guests[0];
    const lost = churn.buildChurnPredictions([weekly('a', 30)], NOW).guests[0];
    expect(due.status).toBe('due');          // 9/7  ≈ 1.3
    expect(over.status).toBe('overdue');     // 15/7 ≈ 2.1
    expect(lost.status).toBe('likely_lost'); // 30/7 ≈ 4.3
  });

  test('predicted next order is the last visit plus the cadence', () => {
    const g = churn.buildChurnPredictions([weekly('a', 3)], NOW).guests[0];
    // last visit was 3 days ago, cadence 7 → predicted 4 days from now.
    expect(g.daysUntilPredicted).toBe(4);
  });

  test('abstains on a guest with too few visits', () => {
    const thin = { customerId: 'b', phone: '9b', name: 'b', totalSpend: 1000, orderDates: [ago(20), ago(5)] };
    const out = churn.buildChurnPredictions([thin], NOW);
    expect(out.predictableGuests).toBe(0);
    expect(out.insufficientHistory).toBe(1);
    // Not in any risk bucket — no cadence, no verdict.
    expect(out.atRisk).toHaveLength(0);
  });
});

describe('churn segments', () => {
  test('at-risk are the overdue and lost, ranked by spend', () => {
    const out = churn.buildChurnPredictions([
      weekly('small', 20, 2000),
      weekly('big', 20, 9000),
      weekly('fine', 3, 8000),
    ], NOW);
    expect(out.atRiskCount).toBe(2);
    expect(out.atRisk.map((g) => g.customerId)).toEqual(['big', 'small']); // by spend
    expect(out.atRiskHistoricSpend).toBe(11000);
    // The active guest is not at risk despite a high spend.
    expect(out.atRisk.find((g) => g.customerId === 'fine')).toBeUndefined();
  });

  test('value at risk is historic spend, never a projection', () => {
    const out = churn.buildChurnPredictions([weekly('a', 25, 4200)], NOW);
    expect(out.atRiskHistoricSpend).toBe(4200); // exactly what they spent
  });
});
