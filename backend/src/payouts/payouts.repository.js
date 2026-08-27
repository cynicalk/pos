const db = require('../shared/db');

/* Settlement persistence (MERGE_PLAN.md Phase 8). */

const getContract = (restaurantId, platform) =>
  db.query(
    'SELECT platform, commission_rate FROM platform_contracts WHERE restaurant_id = $1 AND platform = $2',
    [restaurantId, platform],
  ).then((r) => r.rows[0]);

const listContracts = (restaurantId) =>
  db.query(
    `SELECT platform, commission_rate, updated_at
       FROM platform_contracts WHERE restaurant_id = $1 ORDER BY platform`,
    [restaurantId],
  ).then((r) => r.rows);

const upsertContract = (restaurantId, platform, rate, userId) =>
  db.query(
    `INSERT INTO platform_contracts (restaurant_id, platform, commission_rate, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (restaurant_id, platform) DO UPDATE
       SET commission_rate = EXCLUDED.commission_rate,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING platform, commission_rate, updated_at`,
    [restaurantId, platform, rate, userId || null],
  ).then((r) => r.rows[0]);

const listSettlements = (restaurantId, limit) =>
  db.query(
    `SELECT id, platform, file_name, period_start, period_end, gross_sales,
            commission, net_payout, recoverable, rows_read, rows_rejected,
            findings, created_at
       FROM settlements
      WHERE restaurant_id = $1
      ORDER BY period_start DESC NULLS LAST, created_at DESC
      LIMIT $2`,
    [restaurantId, limit],
  ).then((r) => r.rows);

const getSettlement = (restaurantId, id) =>
  db.query('SELECT * FROM settlements WHERE restaurant_id = $1 AND id = $2', [restaurantId, id])
    .then((r) => r.rows[0]);

const listSettlementOrders = (restaurantId, settlementId) =>
  db.query(
    `SELECT * FROM settlement_orders
      WHERE restaurant_id = $1 AND settlement_id = $2
      ORDER BY ABS(variance) DESC, order_date`,
    [restaurantId, settlementId],
  ).then((r) => r.rows);

/**
 * Persist a settlement and its orders in one transaction.
 *
 * Order rows carry ON CONFLICT DO NOTHING against the (restaurant, platform
 * order id) unique index, so re-uploading an overlapping file does not
 * double-count. `inserted` reports how many rows were actually new, which is the
 * number the operator needs to see — "imported 200 orders" when 180 were
 * already present would badly misrepresent what just happened.
 */
function saveSettlement(restaurantId, { parsed, report, fileName, userId }) {
  // db.withTransaction rather than a hand-rolled BEGIN/COMMIT: the shared
  // helper already gets the rollback-and-release path right, and a second copy
  // of that pattern is a second place to leak a client from.
  return db.withTransaction(async (client) => {
    const { rows: [settlement] } = await client.query(
      `INSERT INTO settlements
         (restaurant_id, platform, file_name, period_start, period_end,
          gross_sales, commission, tds, tcs, penalties, discounts, refunds,
          net_payout, recoverable, rows_read, rows_rejected, findings, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        restaurantId, parsed.platform, fileName,
        parsed.periodStart, parsed.periodEnd,
        parsed.totals.grossSales, parsed.totals.totalCommission,
        parsed.totals.totalTds, parsed.totals.totalTcs,
        parsed.totals.totalPenalties, parsed.totals.totalDiscounts,
        parsed.totals.totalRefunds, parsed.totals.netPayout,
        report.totalRecoverable, parsed.orders.length, parsed.rejected.length,
        JSON.stringify(report.findings), userId || null,
      ],
    );

    const varianceById = new Map(
      report.arithmetic.discrepancies.map((d) => [d.platformOrderId, d.variance]),
    );

    let inserted = 0;
    for (const o of parsed.orders) {
      const { rowCount } = await client.query(
        `INSERT INTO settlement_orders
           (settlement_id, restaurant_id, platform_order_id, order_date, gross_amount,
            commission, tds, tcs, sla_penalty, discount_restaurant, discount_platform,
            refund_amount, net_amount, status, variance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (restaurant_id, platform_order_id) DO NOTHING`,
        [
          settlement.id, restaurantId, o.platformOrderId, o.orderDate, o.grossAmount,
          o.commission, o.tds, o.tcs, o.slaPenalty, o.discountRestaurant,
          o.discountPlatform, o.refundAmount, o.netAmount, o.status,
          varianceById.get(o.platformOrderId) || 0,
        ],
      );
      inserted += rowCount;
    }

    return { settlement, inserted, duplicates: parsed.orders.length - inserted };
  });
}

/** POS revenue over the settlement period, for the coverage comparison. */
const getPosRevenue = (restaurantId, from, to) =>
  db.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS revenue,
            COUNT(DISTINCT o.id)::int  AS order_count
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1
        AND o.created_at::date BETWEEN $2 AND $3`,
    [restaurantId, from, to],
  ).then((r) => r.rows[0]);

module.exports = {
  getContract,
  listContracts,
  upsertContract,
  listSettlements,
  getSettlement,
  listSettlementOrders,
  saveSettlement,
  getPosRevenue,
};
