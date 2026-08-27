const repo = require('./shift.repository');

// "Since" defaults to 24 hours ago when no prior count exists — avoids timezone math
// and covers any shift pattern (morning, evening, overnight).
function defaultSince() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

async function getSummary(restaurantId) {
  const lastCount = await repo.getLastCount(restaurantId);
  const since = lastCount ? new Date(lastCount.counted_at) : defaultSince();
  const cashData = await repo.getCashSince(restaurantId, since);

  return {
    since,
    lastCountAt: lastCount?.counted_at || null,
    expectedCash: parseFloat(cashData.cash_total || 0),
    orderCount: parseInt(cashData.order_count || 0, 10),
  };
}

async function recordCount({ restaurantId, countedBy, actualCash, notes, denominations }) {
  const summary = await getSummary(restaurantId);
  const variance = parseFloat(actualCash) - summary.expectedCash;
  return repo.create({
    restaurantId,
    countedBy,
    expectedCash: summary.expectedCash,
    actualCash: parseFloat(actualCash),
    variance,
    notes,
    denominations,
  });
}

async function getHistory(restaurantId) {
  return repo.getHistory(restaurantId);
}

module.exports = { getSummary, recordCount, getHistory };
