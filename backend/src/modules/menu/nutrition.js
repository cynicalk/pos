/**
 * Per-serving dish nutrition — the honest half of a feature language models
 * make it tempting to fake.
 *
 * A model will produce a confident "540 kcal" for any dish name you hand it, and
 * a guest managing diabetes or counting macros would act on that number. So this
 * module does the opposite: it reports nutrition ONLY when it can be derived from
 * data the operator actually entered — a recipe, and per-unit nutrition on every
 * ingredient in it. One undeclared ingredient and the dish reports *nothing*
 * rather than a number that is nearly right but silently missing a component.
 *
 * The arithmetic mirrors the prep sheet's cost explosion (modules/forecast/prep):
 * a recipe yields `yield` servings, so a line contributes `quantity / yield` of
 * the ingredient per serving, and each ingredient's per-unit nutrition scales by
 * that. Nothing here is estimated; every calorie traces to a named ingredient.
 */

const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

// Map from the ingredient's per-unit columns to the output macro keys.
const PER_UNIT = {
  kcal: 'kcalPerUnit',
  protein: 'proteinPerUnit',
  carbs: 'carbsPerUnit',
  fat: 'fatPerUnit',
};

function hasAllNutrition(line) {
  return MACRO_KEYS.every((k) => {
    const v = line[PER_UNIT[k]];
    return v != null && Number.isFinite(Number(v));
  });
}

/**
 * Nutrition for one dish.
 *
 * @param dish { id, name, hasRecipe, yield, lines: [{ ingredientName, quantity,
 *               kcalPerUnit, proteinPerUnit, carbsPerUnit, fatPerUnit }] }
 * @returns { id, name, complete, reason, perServing|null, declaredCount,
 *            ingredientCount, missing: [names] }
 */
function buildDishNutrition(dish) {
  const lines = dish.lines || [];
  const base = { id: dish.id, name: dish.name, perServing: null, missing: [] };

  if (!dish.hasRecipe) {
    return {
      ...base, complete: false, reason: 'no_recipe', declaredCount: 0, ingredientCount: 0,
    };
  }
  if (!lines.length) {
    return {
      ...base, complete: false, reason: 'empty_recipe', declaredCount: 0, ingredientCount: 0,
    };
  }

  const missing = lines.filter((l) => !hasAllNutrition(l)).map((l) => l.ingredientName);
  const ingredientCount = lines.length;
  const declaredCount = ingredientCount - missing.length;

  if (missing.length) {
    // The whole point: a partial sum is not a smaller-but-honest number, it is a
    // wrong number presented as complete. So a dish missing any component reports
    // none of them, and names what is undeclared so the gap is a short to-do.
    return {
      ...base,
      complete: false,
      reason: 'undeclared_ingredients',
      declaredCount,
      ingredientCount,
      missing,
    };
  }

  // A recipe yields `yield` servings; a line's per-serving amount is its recipe
  // quantity over that yield. Missing or zero yield means "written per portion".
  const servings = Number(dish.yield) > 0 ? Number(dish.yield) : 1;
  const perServing = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  for (const line of lines) {
    const perServingQty = Number(line.quantity) / servings;
    for (const k of MACRO_KEYS) {
      perServing[k] += perServingQty * Number(line[PER_UNIT[k]]);
    }
  }

  return {
    ...base,
    complete: true,
    reason: null,
    declaredCount,
    ingredientCount,
    perServing: {
      kcal: Math.round(perServing.kcal),
      protein: Math.round(perServing.protein * 10) / 10,
      carbs: Math.round(perServing.carbs * 10) / 10,
      fat: Math.round(perServing.fat * 10) / 10,
    },
  };
}

/**
 * The whole menu, with a coverage figure the screen can lead with.
 *
 * Coverage is over dishes that HAVE a recipe — a dish with no recipe is an
 * unrelated gap (it has no cost or prep line either), so folding it into the
 * denominator would make the nutrition data look worse than it is. Both counts
 * are reported so the screen can say "31 of 34 costed dishes, and 6 dishes have
 * no recipe at all".
 */
function buildMenuNutrition(dishes) {
  const results = (dishes || []).map(buildDishNutrition);

  const withRecipe = results.filter((d) => d.reason !== 'no_recipe' && d.reason !== 'empty_recipe');
  const complete = results.filter((d) => d.complete);
  const noRecipe = results.filter((d) => d.reason === 'no_recipe' || d.reason === 'empty_recipe');

  return {
    dishes: results,
    coverage: {
      total: results.length,
      withRecipe: withRecipe.length,
      complete: complete.length,
      noRecipe: noRecipe.length,
      // Of the dishes that could have nutrition (they are costed), how many do.
      pct: withRecipe.length > 0
        ? Math.round((complete.length / withRecipe.length) * 100)
        : null,
    },
  };
}

/** The per-serving figure for one dish, or null — the shape the guest app wants. */
function dishNutritionForGuest(dish) {
  const n = buildDishNutrition(dish);
  return n.complete ? n.perServing : null;
}

module.exports = {
  buildDishNutrition,
  buildMenuNutrition,
  dishNutritionForGuest,
  MACRO_KEYS,
};
