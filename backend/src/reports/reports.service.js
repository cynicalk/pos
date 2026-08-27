const repo = require('./reports.repository');
const stocktakeRepo = require('../stocktake/stocktake.repository');
const { ValidationError, NotFoundError } = require('../shared/errors');
const { validateTimezone } = require('../shared/timezone');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
// A row is flagged when actual exceeds recipe by more than this %, or when it
// consumed product with no corresponding sales at all.
const FLAG_PCT_OF_THEO = 10;

const VALID_GROUPS   = ['day', 'week', 'month'];
const VALID_CHANNELS = new Set(['dining', 'takeaway', 'delivery']);

function parseDate(dateStr, field = 'date') {
  if (!dateStr) throw new ValidationError(`${field} is required (YYYY-MM-DD)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  const d = new Date(dateStr);
  if (isNaN(d)) throw new ValidationError(`${field} is not a valid date`);
  return dateStr;
}


function validateGroup(g) {
  if (!VALID_GROUPS.includes(g)) {
    throw new ValidationError(`group must be one of: ${VALID_GROUPS.join(', ')}`);
  }
  return g;
}

function validateChannel(ch) {
  if (!ch || ch === 'all') return null;
  if (!VALID_CHANNELS.has(ch)) throw new ValidationError(`channel must be one of: ${[...VALID_CHANNELS].join(', ')}`);
  return ch;
}

function validateRange(from, to) {
  if (from > to) throw new ValidationError('from must be on or before to');
  const days = (new Date(to) - new Date(from)) / 86_400_000;
  if (days > 366) throw new ValidationError('Date range cannot exceed 366 days');
}

async function getDailySummary(dateStr, tzStr = 'UTC', restaurantId, channelRaw) {
  const date    = parseDate(dateStr);
  const tz      = validateTimezone(tzStr);
  const channel = validateChannel(channelRaw);
  const [summary, byCategory, topItems, hourly, cancelled] = await Promise.all([
    repo.getDailySummary(date, tz, restaurantId, channel),
    repo.getRevenueByCategory(date, tz, restaurantId, channel),
    repo.getTopItems(date, tz, 10, restaurantId, channel),
    repo.getHourlySales(date, tz, restaurantId, channel),
    repo.getDailyCancelled(date, tz, restaurantId, channel),
  ]);
  const f = (v) => parseFloat(v ?? 0);
  return {
    date, byCategory, topItems, hourly,
    summary: {
      total_orders:      parseInt(summary.total_orders, 10)     || 0,
      total_revenue:     f(summary.total_revenue),
      returning_orders:  parseInt(summary.returning_orders, 10) || 0,
      new_orders:        parseInt(summary.new_orders, 10)       || 0,
      avg_serve_minutes: Math.round(f(summary.avg_serve_minutes)),
      cancelled_orders:  cancelled.cancelled_orders              || 0,
    },
  };
}

async function getTrends(fromStr, toStr, tzStr = 'UTC', groupStr = 'day', restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const group   = validateGroup(groupStr);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const rows = await repo.getTrends(from, to, tz, group, restaurantId, channel);
  return {
    from, to, group,
    rows: rows.map((r) => ({
      period:  r.period,
      orders:  r.orders,
      revenue: parseFloat(r.revenue),
    })),
  };
}

async function getItemProfitability(fromStr, toStr, tzStr = 'UTC', limitRaw, restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const limit   = Math.min(parseInt(limitRaw, 10) || 50, 200);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const rows = await repo.getItemProfitability(from, to, tz, limit, restaurantId, channel);
  return {
    from, to,
    items: rows.map((r) => {
      const revenue      = parseFloat(r.revenue);
      const costPerUnit  = r.cost_per_unit != null ? parseFloat(r.cost_per_unit) : null;
      const sellingPrice = parseFloat(r.selling_price);
      const totalCost    = costPerUnit != null ? costPerUnit * r.total_sold : null;
      const profit       = totalCost   != null ? revenue - totalCost : null;
      const marginPct    = profit != null && revenue > 0 ? (profit / revenue) * 100 : null;
      return {
        id:            r.id,
        name:          r.name,
        category:      r.category,
        selling_price: sellingPrice,
        total_sold:    r.total_sold,
        revenue,
        cost_per_unit: costPerUnit,
        total_cost:    totalCost,
        profit,
        margin_pct:    marginPct != null ? parseFloat(marginPct.toFixed(2)) : null,
      };
    }),
  };
}

async function getStaffPerformance(fromStr, toStr, tzStr = 'UTC', restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const rows = await repo.getStaffPerformance(from, to, tz, restaurantId, channel);
  return {
    from, to,
    staff: rows.map((r) => ({
      id:              r.id,
      name:            r.name,
      email:           r.email,
      role:            r.role,
      orders_created:  r.orders_created,
      revenue_handled: parseFloat(r.revenue_handled),
    })),
  };
}

async function getItemsByPeriod(fromStr, toStr, tzStr = 'UTC', groupStr = 'day', limitRaw, restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const group   = validateGroup(groupStr);
  const limit   = Math.min(parseInt(limitRaw, 10) || 8, 20);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const rows = await repo.getItemsByPeriod(from, to, tz, group, limit, restaurantId, channel);
  return {
    from, to, group,
    rows: rows.map((r) => ({
      period:     r.period,
      name:       r.name,
      total_sold: r.total_sold,
      revenue:    parseFloat(r.revenue),
    })),
  };
}

async function getStaffByPeriod(fromStr, toStr, tzStr = 'UTC', groupStr = 'day', restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const group   = validateGroup(groupStr);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const rows = await repo.getStaffByPeriod(from, to, tz, group, restaurantId, channel);
  return {
    from, to, group,
    rows: rows.map((r) => ({
      period:          r.period,
      name:            r.name,
      orders_created:  r.orders_created,
      revenue_handled: parseFloat(r.revenue_handled),
    })),
  };
}

async function getSalesSummaryReport(fromStr, toStr, tzStr = 'UTC', restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const [summary, byChannel] = await Promise.all([
    repo.getSalesSummary(from, to, tz, restaurantId, channel),
    repo.getRevenueByChannel(from, to, tz, restaurantId), // always all channels
  ]);
  const f = (v) => parseFloat(v ?? 0);
  return {
    from, to,
    summary: {
      total_orders:            parseInt(summary.total_orders, 10) || 0,
      total_revenue:           f(summary.total_revenue),
      subtotal:                f(summary.subtotal),
      tax_amount:              f(summary.tax_amount),
      service_charge:          f(summary.service_charge),
      discount_amount:         f(summary.discount_amount),
      coupon_discount_amount:  f(summary.coupon_discount_amount),
      loyalty_discount_amount: f(summary.loyalty_discount_amount),
      packaging_fee:           f(summary.packaging_fee),
      total_items_sold:        parseInt(summary.total_items_sold, 10) || 0,
    },
    byChannel: byChannel.map((r) => ({
      channel:         r.channel,
      orders:          r.orders,
      revenue:         f(r.revenue),
      avg_order_value: f(r.avg_order_value),
    })),
  };
}

async function getCollectionReport(fromStr, toStr, tzStr = 'UTC', restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const [byMethod, byCounter] = await Promise.all([
    repo.getCollectionByMethod(from, to, tz, restaurantId, channel),
    repo.getCollectionByCounter(from, to, tz, restaurantId, channel),
  ]);
  return {
    from, to,
    byMethod:  byMethod.map((r)  => ({ method: r.method, orders: r.orders, amount: parseFloat(r.amount) })),
    byCounter: byCounter.map((r) => ({ counter_name: r.counter_name, email: r.email, role: r.role, orders: r.orders, amount: parseFloat(r.amount) })),
  };
}

async function getItemGroupsReport(fromStr, toStr, tzStr = 'UTC', limitRaw, restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const limit   = Math.min(parseInt(limitRaw, 10) || 100, 200);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const [byGroup, topItems] = await Promise.all([
    repo.getRevenueByItemGroup(from, to, tz, restaurantId, channel),
    repo.getTopSellingItems(from, to, tz, limit, restaurantId, channel),
  ]);
  return {
    from, to,
    byGroup:  byGroup.map((r)  => ({ item_group: r.item_group, orders: r.orders, items_sold: r.items_sold, revenue: parseFloat(r.revenue) })),
    topItems: topItems.map((r) => ({ id: r.id, name: r.name, category: r.category, total_sold: r.total_sold, revenue: parseFloat(r.revenue) })),
  };
}

async function getTableWiseSalesReport(fromStr, toStr, tzStr = 'UTC', restaurantId) {
  const from = parseDate(fromStr, 'from');
  const to   = parseDate(toStr,   'to');
  const tz   = validateTimezone(tzStr);
  validateRange(from, to);

  const rows = await repo.getTableWiseSales(from, to, tz, restaurantId);
  return {
    from, to,
    tables: rows.map((r) => ({
      table_number:    r.table_number,
      orders:          r.orders,
      revenue:         parseFloat(r.revenue),
      avg_order_value: parseFloat(r.avg_order_value),
    })),
  };
}

async function getNCSalesReport(fromStr, toStr, tzStr = 'UTC', restaurantId, channelRaw) {
  const from    = parseDate(fromStr, 'from');
  const to      = parseDate(toStr,   'to');
  const tz      = validateTimezone(tzStr);
  const channel = validateChannel(channelRaw);
  validateRange(from, to);

  const rows = await repo.getNCSales(from, to, tz, restaurantId, channel);
  const totalValue = rows.reduce((s, r) => s + parseFloat(r.order_value || 0), 0);
  return {
    from, to,
    summary: { total_cancelled: rows.length, total_value_cancelled: totalValue },
    orders: rows.map((r) => ({
      id:           r.id,
      channel:      r.channel,
      created_at:   r.created_at,
      created_by:   r.created_by,
      table_number: r.table_number,
      order_value:  parseFloat(r.order_value || 0),
    })),
  };
}

// Theoretical-vs-actual food-cost variance, bounded by two finalized stock
// counts. actual usage = opening count + purchases − closing count; theoretical
// usage = recipe × units sold. Each ingredient's dollar variance is decomposed
// into a price component (market/procurement) and a usage component
// (over-portioning, waste, yield, theft) — they sum to the total.
async function getFoodCostVariance(closingCountId, openingCountIdRaw, restaurantId) {
  if (!UUID_RE.test(closingCountId || '')) throw new ValidationError('closingCountId is required');
  const openingCountId = openingCountIdRaw && UUID_RE.test(openingCountIdRaw) ? openingCountIdRaw : null;

  const closing = await stocktakeRepo.getCountHeader(closingCountId, restaurantId);
  if (!closing) throw new NotFoundError('Closing stock count');
  if (closing.status !== 'finalized') throw new ValidationError('Closing count must be finalized first');

  let opening;
  if (openingCountId) {
    opening = await stocktakeRepo.getCountHeader(openingCountId, restaurantId);
    if (!opening) throw new NotFoundError('Opening stock count');
    if (opening.status !== 'finalized') throw new ValidationError('Opening count must be finalized first');
  } else {
    opening = await repo.getLatestFinalizedCountBefore(restaurantId, closing.counted_at);
  }
  if (!opening) throw new ValidationError('No earlier finalized count found — finalize an opening count before this one');
  if (new Date(opening.counted_at) >= new Date(closing.counted_at)) {
    throw new ValidationError('Opening count must be earlier than the closing count');
  }

  const t0 = opening.counted_at;
  const t1 = closing.counted_at;

  const [openLines, closeLines, theo, purchases, sales] = await Promise.all([
    stocktakeRepo.getCountLines(opening.id),
    stocktakeRepo.getCountLines(closing.id),
    repo.getTheoreticalUsage(restaurantId, t0, t1),
    repo.getPurchasesByIngredient(restaurantId, t0, t1),
    repo.getSalesTotal(restaurantId, t0, t1),
  ]);

  const openMap  = new Map(openLines.map((l) => [l.ingredient_id, l]));
  const theoMap  = new Map(theo.map((r) => [r.ingredient_id, parseFloat(r.theo_qty)]));
  const purchMap = new Map(purchases.map((r) => [r.ingredient_id, {
    qty: parseFloat(r.purch_qty), avgCost: r.avg_cost != null ? parseFloat(r.avg_cost) : null,
  }]));

  let uncounted = 0;
  const rows = [];

  // The closing count defines the ingredient universe (it pre-populates every
  // active ingredient). Rows whose closing qty was never entered can't yield an
  // actual figure, so they're reported as uncounted rather than guessed.
  for (const line of closeLines) {
    if (line.counted_qty == null) { uncounted += 1; continue; }

    const standardPrice = parseFloat(line.latest_unit_cost) || 0;
    const openQty   = openMap.get(line.ingredient_id)?.counted_qty != null
      ? parseFloat(openMap.get(line.ingredient_id).counted_qty) : 0;
    const closeQty  = parseFloat(line.counted_qty);
    const purch     = purchMap.get(line.ingredient_id);
    const purchQty  = purch?.qty ?? 0;
    const actualPrice = purch?.avgCost ?? standardPrice;
    const theoQty   = theoMap.get(line.ingredient_id) ?? 0;

    const actualQty = openQty + purchQty - closeQty;
    const theoCost   = theoQty * standardPrice;
    const actualCost = actualQty * actualPrice;
    const dollarVar  = actualCost - theoCost;
    const usageVar   = (actualQty - theoQty) * standardPrice;
    const priceVar   = (actualPrice - standardPrice) * actualQty;

    const variancePctOfTheo = theoCost > 0 ? (dollarVar / theoCost) * 100 : null;
    let flag = null;
    if (dollarVar < -0.01) flag = 'negative';                                  // actual < theoretical → data-integrity alert
    else if (variancePctOfTheo != null && variancePctOfTheo >= FLAG_PCT_OF_THEO) flag = 'high';
    else if (theoCost <= 0 && actualCost > 0) flag = 'high';                   // consumed with no sales

    rows.push({
      ingredient_id:   line.ingredient_id,
      ingredient_name: line.ingredient_name,
      unit:            line.unit,
      standard_price:  round2(standardPrice),
      actual_price:    round2(actualPrice),
      opening_qty:     round3(openQty),
      purchase_qty:    round3(purchQty),
      closing_qty:     round3(closeQty),
      theoretical_qty: round3(theoQty),
      actual_qty:      round3(actualQty),
      theoretical_cost: round2(theoCost),
      actual_cost:      round2(actualCost),
      quantity_variance: round3(actualQty - theoQty),
      dollar_variance:   round2(dollarVar),
      price_variance:    round2(priceVar),
      usage_variance:    round2(usageVar),
      variance_pct_of_theo: variancePctOfTheo != null ? round2(variancePctOfTheo) : null,
      flag,
    });
  }

  rows.sort((a, b) => Math.abs(b.dollar_variance) - Math.abs(a.dollar_variance));

  const theoreticalCost = round2(rows.reduce((s, r) => s + r.theoretical_cost, 0));
  const actualCost      = round2(rows.reduce((s, r) => s + r.actual_cost, 0));
  const totalVariance   = round2(actualCost - theoreticalCost);

  return {
    opening: { id: opening.id, label: opening.label, counted_at: opening.counted_at },
    closing: { id: closing.id, label: closing.label, counted_at: closing.counted_at },
    totals: {
      sales:                round2(sales),
      theoretical_cost:     theoreticalCost,
      actual_cost:          actualCost,
      total_variance:       totalVariance,
      theoretical_pct:      sales > 0 ? round2((theoreticalCost / sales) * 100) : null,
      actual_pct:           sales > 0 ? round2((actualCost / sales) * 100) : null,
      variance_pct_of_sales: sales > 0 ? round2((totalVariance / sales) * 100) : null,
      uncounted_ingredients: uncounted,
    },
    rows,
  };
}

module.exports = { getDailySummary, getTrends, getItemProfitability, getStaffPerformance, getItemsByPeriod, getStaffByPeriod, getSalesSummaryReport, getCollectionReport, getItemGroupsReport, getTableWiseSalesReport, getNCSalesReport, getFoodCostVariance };
