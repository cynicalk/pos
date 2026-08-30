/**
 * Category attach rate — the "0.1 metric."
 *
 * The high-margin add-ons (desserts, drinks) rarely move the top line, so they
 * hide. But desserts-per-order sliding from 0.13 to 0.10 is real margin leaving
 * quietly, one rounded decimal at a time. This measures, per menu category:
 *   - attach     = items sold ÷ orders   (the per-order rate; the decimal to watch)
 *   - penetration = orders with the category ÷ orders  (how many baskets carry it)
 * and the change against the prior equal-length window, so a drift is visible
 * before it shows up in revenue.
 *
 * Honesty notes:
 *   - Orders and revenue basis is the same completed-payment definition the rest
 *     of Insights uses; a category with no orders in the window reads null, not 0.
 *   - "attach" is per *order*, not per cover — the POS does not yet hold a cover
 *     count on every bill. When covers land, the same shape becomes per-cover; the
 *     roadmap says so rather than dividing by a number we don't have.
 *   - High-margin categories are tagged by name so the screen can pin the two an
 *     operator most wants to lift, without hard-coding a taxonomy the menu doesn't have.
 */

const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

const HIGH_MARGIN = /bever|drink|dessert|sweet|coffee|shake|mocktail|lassi|beer|wine|cocktail/i;

/**
 * @param categoryRows [{ period:'cur'|'prev', category, items, ordersWith }]
 * @param totals       [{ period:'cur'|'prev', totalOrders }]
 */
function buildAttachRate({ categoryRows = [], totals = [] } = {}) {
  const totalBy = new Map(totals.map((t) => [t.period, Number(t.totalOrders) || 0]));
  const curTotal = totalBy.get('cur') || 0;
  const prevTotal = totalBy.get('prev') || 0;

  // Fold the flat rows into one entry per category with cur/prev sides.
  const byCat = new Map();
  for (const r of categoryRows) {
    const cat = r.category || 'Uncategorised';
    if (!byCat.has(cat)) byCat.set(cat, { category: cat, cur: null, prev: null });
    byCat.get(cat)[r.period] = { items: Number(r.items) || 0, ordersWith: Number(r.ordersWith) || 0 };
  }

  const rate = (items, total) => (total > 0 ? round3(items / total) : null);

  const categories = [...byCat.values()].map((c) => {
    const attach = c.cur ? rate(c.cur.items, curTotal) : (curTotal ? 0 : null);
    const penetration = c.cur ? rate(c.cur.ordersWith, curTotal) : (curTotal ? 0 : null);
    const prevAttach = c.prev ? rate(c.prev.items, prevTotal) : (prevTotal ? 0 : null);
    const delta = attach != null && prevAttach != null ? round3(attach - prevAttach) : null;
    return {
      category: c.category,
      highMargin: HIGH_MARGIN.test(c.category),
      items: c.cur?.items || 0,
      ordersWith: c.cur?.ordersWith || 0,
      attach,
      penetration,
      prevAttach,
      delta,
      // Direction is only meaningful once both windows have orders.
      trend: delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    };
  });

  // Highest attach first, but a category with no current orders sinks.
  categories.sort((a, b) => (b.attach ?? -1) - (a.attach ?? -1));

  return {
    categories,
    highMargin: categories.filter((c) => c.highMargin),
    summary: {
      orders: curTotal,
      prevOrders: prevTotal,
      categories: categories.length,
      hasPrior: prevTotal > 0,
    },
  };
}

module.exports = { buildAttachRate, HIGH_MARGIN };
