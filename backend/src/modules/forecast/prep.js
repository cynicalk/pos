/**
 * Level 3 of the hierarchy — ingredient demand (docs/FORECASTING.md §III.3).
 *
 * "Explode through RecipeItem. Pure arithmetic, fully explainable: *180 covers
 * → 62 butter chicken → 9.3 kg chicken*. That third step is the product. Nobody
 * wants a forecast; they want a prep sheet and a purchase order."
 *
 * It is arithmetic, and that is the point — every kilo on this sheet can be
 * traced back through a named dish to a recipe the operator wrote. Nothing here
 * is estimated. The uncertainty all lives upstream in the total.
 *
 * Two things this refuses to do:
 *
 *   - **It does not silently drop a dish with no recipe.** A dish nobody has
 *     costed contributes nothing to the ingredient totals, and a prep sheet that
 *     quietly under-orders because a quarter of the menu is uncosted is worse
 *     than no prep sheet. Those dishes come back in `uncosted`, with the share
 *     of forecast volume they represent, so the screen can say how complete the
 *     sheet is.
 *
 *   - **It does not convert a rate into an order.** §III.5: "You cannot prep
 *     1.09 portions." Rounding to something executable is a decision that needs
 *     the newsvendor economics of §IV.1 — the cost of running out against the
 *     cost of binning it — and this deployment has no shelf-life or substitution
 *     data to compute that with. So the sheet reports the forecast quantity and
 *     says plainly that the prep decision is still the chef's.
 */

/**
 * Explode a per-dish forecast into ingredient quantities.
 *
 * @param items   [{ name, qty, lo, hi }] from item-mix.itemForecast
 * @param recipes Map<dishName, { yield, lines: [{ ingredientId, name, unit, quantity, unitCost }] }>
 *                `quantity` is per recipe yield, matching recipe_ingredients.
 */
function explode(items, recipes) {
  const byIngredient = new Map();
  const uncosted = [];
  let costedQty = 0;
  let totalQty = 0;

  for (const item of items) {
    totalQty += item.qty;
    const recipe = recipes.get(item.name);
    if (!recipe || !recipe.lines.length) {
      uncosted.push({ name: item.name, qty: item.qty });
      continue;
    }
    costedQty += item.qty;

    // A recipe yields `yield` servings, so a line's per-serving quantity is the
    // recipe quantity divided by that yield. A yield of zero or missing is
    // treated as one — the common case for a recipe written per portion.
    const servings = Number(recipe.yield) > 0 ? Number(recipe.yield) : 1;

    for (const line of recipe.lines) {
      const perServing = Number(line.quantity) / servings;
      const key = line.ingredientId;
      const existing = byIngredient.get(key) || {
        ingredientId: key,
        name: line.name,
        unit: line.unit,
        quantity: 0,
        lo: 0,
        hi: 0,
        cost: 0,
        fromDishes: [],
      };
      const qty = perServing * item.qty;
      existing.quantity += qty;
      existing.lo += perServing * (item.lo ?? item.qty);
      existing.hi += perServing * (item.hi ?? item.qty);
      existing.cost += qty * Number(line.unitCost || 0);
      existing.fromDishes.push({ dish: item.name, quantity: qty });
      byIngredient.set(key, existing);
    }
  }

  const ingredients = [...byIngredient.values()]
    .map((i) => ({
      ...i,
      // Biggest contributor first, so "why do I need nine kilos of chicken" is
      // answerable at a glance.
      fromDishes: i.fromDishes.sort((a, b) => b.quantity - a.quantity).slice(0, 4),
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    ingredients,
    uncosted: uncosted.sort((a, b) => b.qty - a.qty),
    // The share of forecast dish volume that made it onto the sheet. An
    // operator reading a prep list needs to know it covers four fifths of the
    // service, not all of it.
    coveragePct: totalQty > 0 ? (costedQty / totalQty) * 100 : 0,
    totalCost: ingredients.reduce((s, i) => s + i.cost, 0),
  };
}

/**
 * The variance of a sum is steadier than the variance of its parts (§III.3).
 *
 * "Lumpy and smooth dishes frequently share an ingredient... which is why
 * ingredient forecasts will be materially more accurate than dish forecasts.
 * Worth telling the operator." This reports how many dishes each ingredient
 * draws from, which is the visible form of that argument.
 */
function poolingDepth(ingredients) {
  if (!ingredients.length) return null;
  const depths = ingredients.map((i) => i.fromDishes.length);
  return depths.reduce((s, d) => s + d, 0) / depths.length;
}

module.exports = { explode, poolingDepth };
