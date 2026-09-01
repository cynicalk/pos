/**
 * Per-server performance shaping — pure. Turns the per-server order/revenue/item
 * aggregates into the figures an operator compares staff on: average order value,
 * items per order (an upsell/attach proxy), and each server's share of the dine-in
 * revenue. Rates are only formed where the server actually had orders; a server
 * with none has no AOV, not an AOV of zero.
 *
 * Input: [{ serverId, name, orders, revenue, items }]
 * Output: rows sorted by revenue, each with derived rates + revenue share, plus a
 * team total.
 */
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const n = (v) => Number(v || 0);

function buildStaffPerformance(rows = []) {
  const totalRevenue = rows.reduce((s, r) => s + n(r.revenue), 0);
  const totalOrders = rows.reduce((s, r) => s + n(r.orders), 0);

  const servers = rows
    .map((r) => {
      const orders = n(r.orders);
      const revenue = round2(r.revenue);
      return {
        serverId: r.serverId,
        name: r.name,
        orders,
        revenue,
        avgOrderValue: orders > 0 ? round2(revenue / orders) : null,
        itemsPerOrder: orders > 0 ? Math.round((n(r.items) / orders) * 100) / 100 : null,
        revenueSharePct: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    servers,
    totals: {
      servers: servers.length,
      orders: totalOrders,
      revenue: round2(totalRevenue),
      avgOrderValue: totalOrders > 0 ? round2(totalRevenue / totalOrders) : null,
    },
  };
}

module.exports = { buildStaffPerformance };
