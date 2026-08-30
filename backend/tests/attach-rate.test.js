const { buildAttachRate } = require('../src/modules/menu/attach-rate');

/**
 * Attach rate is items-per-order by category with a delta against the prior
 * window. The tests pin the decimal that matters, the tag on high-margin
 * categories, and the abstention when a window has no orders to divide by.
 */
describe('buildAttachRate', () => {
  const totals = [{ period: 'cur', totalOrders: 100 }, { period: 'prev', totalOrders: 100 }];
  const categoryRows = [
    { period: 'cur',  category: 'Desserts',  items: 10, ordersWith: 9 },
    { period: 'prev', category: 'Desserts',  items: 13, ordersWith: 12 },
    { period: 'cur',  category: 'Mains',     items: 140, ordersWith: 98 },
    { period: 'prev', category: 'Mains',     items: 138, ordersWith: 97 },
  ];

  test('computes attach per order and the delta vs the prior window', () => {
    const { categories } = buildAttachRate({ categoryRows, totals });
    const dess = categories.find((c) => c.category === 'Desserts');
    expect(dess.attach).toBe(0.1);       // 10 / 100
    expect(dess.prevAttach).toBe(0.13);  // 13 / 100
    expect(dess.delta).toBe(-0.03);
    expect(dess.trend).toBe('down');
    expect(dess.penetration).toBe(0.09); // 9 baskets of 100
  });

  test('tags high-margin categories by name', () => {
    const { categories, highMargin } = buildAttachRate({ categoryRows, totals });
    expect(categories.find((c) => c.category === 'Desserts').highMargin).toBe(true);
    expect(categories.find((c) => c.category === 'Mains').highMargin).toBe(false);
    expect(highMargin.map((c) => c.category)).toEqual(['Desserts']);
  });

  test('abstains on the delta when there is no prior window', () => {
    const { categories, summary } = buildAttachRate({
      categoryRows: categoryRows.filter((r) => r.period === 'cur'),
      totals: [{ period: 'cur', totalOrders: 100 }],
    });
    const dess = categories.find((c) => c.category === 'Desserts');
    expect(dess.attach).toBe(0.1);
    expect(dess.prevAttach).toBeNull();
    expect(dess.delta).toBeNull();
    expect(dess.trend).toBeNull();
    expect(summary.hasPrior).toBe(false);
  });

  test('sorts by current attach, highest first', () => {
    const { categories } = buildAttachRate({ categoryRows, totals });
    expect(categories[0].category).toBe('Mains'); // 1.4 attach
    expect(categories[categories.length - 1].category).toBe('Desserts');
  });
});
