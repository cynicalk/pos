/**
 * Cross-Sell Map — ported from `src/modules/menu/cross-sell.ts`.
 *
 * Standard association-rule measures over order baskets:
 *   support    — share of baskets containing both items
 *   confidence — of baskets containing A, the share that also had B
 *   lift       — confidence against B's own base rate; above 1 means a real
 *                affinity rather than B simply being popular with everyone
 *
 * Lift is what makes this worth reading. Without it a bestseller like Butter
 * Naan appears to pair beautifully with everything, purely because it is in
 * most baskets.
 */

/** Below this, a pair's percentages are arithmetic on noise. */
const MIN_TOGETHER = 2;

/**
 * Pair-key separator: NUL, built with String.fromCharCode rather than embedded
 * as a literal control character, which would make this file read as binary to
 * grep, diff and review tools.
 *
 * It has to be something that cannot occur in a dish name. The source joined on
 * a space and recovered the names later with key.split(' '), which mangles
 * every multi-word dish — "Butter Naan" + "Paneer Tikka" came back as "Butter"
 * and "Naan" — and lets ("A B","C") collide with ("A","B C"). Real menus are
 * almost entirely multi-word, so that was wrong on essentially every pair it
 * produced. Names are also carried in the map value here, so nothing is ever
 * parsed back out of a key.
 */
const SEP = String.fromCharCode(0);

/**
 * @param lines  rows of { order_id, item_name }
 * @returns { pairs, baskets, multiItemBaskets }
 */
function buildCrossSellMap(lines, limit = 8) {
  // Group lines into baskets of distinct dish names.
  const baskets = new Map();
  for (const line of lines) {
    if (!line.item_name) continue;
    let basket = baskets.get(line.order_id);
    if (!basket) { basket = new Set(); baskets.set(line.order_id, basket); }
    basket.add(line.item_name);
  }

  const basketList = [...baskets.values()];
  const totalBaskets = basketList.length;
  const multiItemBaskets = basketList.filter((b) => b.size > 1).length;
  if (totalBaskets === 0) return { pairs: [], baskets: 0, multiItemBaskets: 0 };

  const itemCounts = new Map();
  const pairCounts = new Map();

  for (const basket of basketList) {
    const items = [...basket].sort();
    for (const item of items) {
      itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
    }
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const key = items[i] + SEP + items[j];
        const existing = pairCounts.get(key);
        if (existing) existing.together += 1;
        else pairCounts.set(key, { a: items[i], b: items[j], together: 1 });
      }
    }
  }

  const pairs = [];
  for (const { a, b, together } of pairCounts.values()) {
    if (together < MIN_TOGETHER) continue;
    const countA = itemCounts.get(a) ?? 0;
    const countB = itemCounts.get(b) ?? 0;
    if (countA === 0 || countB === 0) continue;

    const support = together / totalBaskets;
    const confidence = together / countA;
    const baseRateB = countB / totalBaskets;

    pairs.push({
      a, b, together,
      supportPct: support * 100,
      confidencePct: confidence * 100,
      lift: baseRateB > 0 ? confidence / baseRateB : 0,
    });
  }

  // Strongest genuine affinity first, then by how often it actually happens —
  // a lift of 9 seen twice is less actionable than a lift of 4 seen forty times.
  pairs.sort((x, y) => y.lift - x.lift || y.together - x.together);

  return { pairs: pairs.slice(0, limit), baskets: totalBaskets, multiItemBaskets };
}

module.exports = { MIN_TOGETHER, SEP, buildCrossSellMap };
