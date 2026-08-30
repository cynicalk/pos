/*
 * Phase 7 pure-logic tests (MERGE_PLAN.md).
 *
 * The thing worth guarding here is what happens to a MISSING figure. A rollup
 * that treats "no data" as zero puts the outlet that opened last week at the
 * top of every ranking, and the operator drives to the wrong site.
 */

const {
  buildComparison, buildTotals, rankOutlets, mergeAttention, averageOf,
} = require('../src/modules/group/rollup');

const outlets = [
  { id: 'a', name: 'Andheri' },
  { id: 'b', name: 'Bandra' },
  { id: 'c', name: 'Colaba' },
];

describe('averageOf', () => {
  test('averages only the values that are present', () => {
    expect(averageOf([4, null, 6])).toEqual({ value: 5, reporting: 2 });
  });

  test('reports nothing rather than zero when nobody answered', () => {
    expect(averageOf([null, null])).toEqual({ value: null, reporting: 0 });
  });

  test('ignores non-finite values that slipped through', () => {
    expect(averageOf([4, NaN, 6])).toEqual({ value: 5, reporting: 2 });
  });
});

describe('buildComparison', () => {
  test('an outlet with no orders has no cancellation rate, not a rate of zero', () => {
    const [row] = buildComparison([outlets[0]], {});
    expect(row.orders).toBe(0);
    expect(row.cancellationPct).toBeNull();
    expect(row.foodCostPct).toBeNull();
    expect(row.avgRating).toBeNull();
  });

  test('computes cancellation rate from the outlet own totals', () => {
    const [row] = buildComparison([outlets[0]], {
      orders: { a: { total_orders: 200, cancelled_orders: 30, lost_revenue: 4000 } },
    });
    expect(row.cancellationPct).toBe(15);
  });

  test('food cost carries the share of sold lines it is based on', () => {
    const [row] = buildComparison([outlets[0]], {
      foodCost: {
        a: {
          food_cost: 3000, item_revenue: 10000, items_costed: 40, items_total: 100,
        },
      },
    });
    expect(row.foodCostPct).toBe(30);
    expect(row.foodCostCoveragePct).toBe(40);
  });

  test('an outlet selling nothing costed reports no food-cost percentage', () => {
    const [row] = buildComparison([outlets[0]], {
      foodCost: {
        a: {
          food_cost: 0, item_revenue: 0, items_costed: 0, items_total: 12,
        },
      },
    });
    expect(row.foodCostPct).toBeNull();
    expect(row.foodCostCoveragePct).toBe(0);
  });

  test('unquantified findings are counted, not priced at zero', () => {
    const [row] = buildComparison([outlets[0]], {
      actions: { a: { open_actions: 11, at_stake: 4200, unquantified: 9 } },
    });
    expect(row.openActions).toBe(11);
    expect(row.atStake).toBe(4200);
    expect(row.unquantifiedActions).toBe(9);
  });

  test('same-store growth compares this window to the prior one', () => {
    const [row] = buildComparison([outlets[0]], {
      growth: { a: { current_revenue: 11000, prior_revenue: 10000 } },
    });
    expect(row.salesGrowthPct).toBe(10);
  });

  test('an outlet with no prior trade has no growth figure, not 0%', () => {
    const [row] = buildComparison([outlets[0]], {
      growth: { a: { current_revenue: 8000, prior_revenue: 0 } },
    });
    expect(row.salesGrowthPct).toBeNull();
  });

  test('sales per labour hour divides revenue by logged hours', () => {
    const [row] = buildComparison([outlets[0]], {
      revenue: { a: { revenue: 48000 } },
      labour: { a: { labour_hours: 120 } },
    });
    expect(row.salesPerLabourHour).toBe(400);
    expect(row.labourHours).toBe(120);
  });

  test('no roster logged means no productivity figure, not an infinite one', () => {
    const [row] = buildComparison([outlets[0]], {
      revenue: { a: { revenue: 48000 } },
      labour: { a: { labour_hours: 0 } },
    });
    expect(row.salesPerLabourHour).toBeNull();
  });
});

describe('buildTotals', () => {
  const rows = () => buildComparison(outlets, {
    orders: {
      a: { total_orders: 100, cancelled_orders: 30 }, // 30%
      b: { total_orders: 900, cancelled_orders: 45 }, //  5%
      // c has no orders at all
    },
    revenue: { a: { revenue: 50000 }, b: { revenue: 450000 } },
    growth: {
      a: { current_revenue: 50000, prior_revenue: 40000 }, // +25%
      b: { current_revenue: 450000, prior_revenue: 500000 }, // -10%
      // c has no prior trade
    },
    labour: { a: { labour_hours: 125 }, b: { labour_hours: 900 } },
    ratings: {
      a: { avg_rating: '3.00', review_count: 10 },
      b: { avg_rating: '4.60', review_count: 10 },
    },
    actions: {
      a: { open_actions: 5, at_stake: 4000, unquantified: 4 },
      b: { open_actions: 1, at_stake: 0, unquantified: 1 },
    },
  });

  test('money and counts are summed', () => {
    const t = buildTotals(rows());
    expect(t.revenue).toBe(500000);
    expect(t.orders).toBe(1000);
    expect(t.openActions).toBe(6);
    expect(t.atStake).toBe(4000);
    expect(t.unquantifiedActions).toBe(5);
  });

  test('rates average per outlet, so a small bad site is not hidden by a big good one', () => {
    // Pooled: 75/1000 = 7.5%, which buries Andheri's 30%. Per outlet: 17.5%,
    // which is the number that makes someone go and look.
    const t = buildTotals(rows());
    expect(t.avgCancellationPct).toBe(17.5);
    expect(t.cancellationReporting).toBe(2);
  });

  test('an outlet with no data does not drag an average toward zero', () => {
    const t = buildTotals(rows());
    // Colaba has no rating. The average is 3.8 over two outlets, not 2.5 over
    // three, and the page is told it covers two.
    expect(t.avgRating).toBe(3.8);
    expect(t.ratingReporting).toBe(2);
    expect(t.outlets).toBe(3);
  });

  test('growth and SPLH average over the outlets that could report', () => {
    const t = buildTotals(rows());
    // +25% and -10% average to +7.5%, over the two outlets with a prior window.
    expect(t.avgSalesGrowthPct).toBe(7.5);
    expect(t.salesGrowthReporting).toBe(2);
    // 50000/125 = 400, 450000/900 = 500 → 450 across two outlets.
    expect(t.avgSalesPerLabourHour).toBe(450);
    expect(t.splhReporting).toBe(2);
  });

  test('an empty group reports nothing rather than zeroes', () => {
    const t = buildTotals([]);
    expect(t.outlets).toBe(0);
    expect(t.avgRating).toBeNull();
    expect(t.avgCancellationPct).toBeNull();
    expect(t.revenue).toBe(0);
  });
});

describe('rankOutlets', () => {
  const rows = buildComparison(outlets, {
    revenue: { a: { revenue: 10 }, b: { revenue: 999999 }, c: { revenue: 500 } },
    actions: {
      a: { open_actions: 2, at_stake: 100, unquantified: 1 },
      b: { open_actions: 9, at_stake: 90000, unquantified: 9 },
      c: { open_actions: 1, at_stake: 0, unquantified: 1 },
    },
  });

  test('urgency outranks size', () => {
    // Bandra has the money and the most findings; Andheri has the only
    // critical one. The page exists to send someone to Andheri.
    const ranked = rankOutlets(rows, {
      a: { urgent_actions: 3 },
      b: { urgent_actions: 0 },
      c: { urgent_actions: 0 },
    });
    expect(ranked[0].name).toBe('Andheri');
    expect(ranked[0].urgentActions).toBe(3);
  });

  test('rupees at stake break a tie on urgency', () => {
    const ranked = rankOutlets(rows, {
      a: { urgent_actions: 1 }, b: { urgent_actions: 1 }, c: { urgent_actions: 1 },
    });
    expect(ranked[0].name).toBe('Bandra');
  });

  test('outlets with nothing wrong sort last, by name', () => {
    const ranked = rankOutlets(rows, {});
    expect(ranked.map((r) => r.name)).toEqual(['Bandra', 'Andheri', 'Colaba']);
  });
});

describe('mergeAttention', () => {
  const item = (over) => ({
    id: 'i1',
    restaurant_id: 'a',
    outlet_name: 'Andheri',
    title: 'Something',
    description: 'Detail',
    priority: 'medium',
    rule_type: 'rating_drop',
    amount: null,
    created_at: new Date(),
    ...over,
  });

  test('every item keeps the outlet it came from', () => {
    const [merged] = mergeAttention([item()]);
    expect(merged.outletId).toBe('a');
    expect(merged.outletName).toBe('Andheri');
  });

  test('quantified findings rank above unquantified ones', () => {
    const merged = mergeAttention([
      item({ id: 'unpriced', amount: null, priority: 'critical' }),
      item({ id: 'priced', amount: 5000, priority: 'low' }),
    ]);
    expect(merged[0].id).toBe('priced');
  });

  test('priority breaks ties among unquantified findings', () => {
    const merged = mergeAttention([
      item({ id: 'low', priority: 'low' }),
      item({ id: 'critical', priority: 'critical' }),
      item({ id: 'medium', priority: 'medium' }),
    ]);
    expect(merged.map((m) => m.id)).toEqual(['critical', 'medium', 'low']);
  });

  test('an unquantified finding reports no amount, never zero', () => {
    const [merged] = mergeAttention([item({ amount: null })]);
    expect(merged.amount).toBeNull();
  });

  test('a genuine zero amount is preserved as zero', () => {
    const [merged] = mergeAttention([item({ amount: 0 })]);
    expect(merged.amount).toBe(0);
  });

  test('an empty group produces an empty queue', () => {
    expect(mergeAttention([])).toEqual([]);
    expect(mergeAttention()).toEqual([]);
  });
});
