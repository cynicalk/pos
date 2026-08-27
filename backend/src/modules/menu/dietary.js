/**
 * Dish allergens and diet, derived from declared ingredients
 * (MERGE_PLAN.md Phase 7).
 *
 * Pure. Every rule in here bends the same way: **towards saying "we don't
 * know" rather than "it's fine".** A guest with a nut allergy reading a dietary
 * filter is making a medical decision with it, and the only acceptable failure
 * mode is being unhelpfully vague.
 *
 * So: one undeclared ingredient makes the whole dish unknown, a dish with no
 * recipe is unknown rather than empty, and an unknown dish never satisfies a
 * filter. That last one is worth stating plainly, because it is the rule people
 * are tempted to relax when the page looks sparse: filtering for "vegan" shows
 * dishes *known* to be vegan, never dishes not known to contain meat.
 */

// The vocabulary the operator declares against. A fixed list, so a filter can
// map onto declared data rather than onto free text where "nuts", "Nuts" and
// "tree nuts" are three different allergens.
const KNOWN_ALLERGENS = [
  'dairy', 'gluten', 'nuts', 'peanuts', 'soy',
  'eggs', 'shellfish', 'fish', 'sesame', 'mustard',
];

const DIETS = ['vegan', 'vegetarian', 'non_vegetarian'];

// Ordered least → most permissive. A dish is as permissive as its least
// restrictive ingredient: one piece of chicken makes the whole dish
// non-vegetarian, and a splash of ghee makes a vegan dish vegetarian.
const DIET_RANK = { vegan: 0, vegetarian: 1, non_vegetarian: 2 };

const DIET_LABELS = {
  vegan:           'Vegan',
  vegetarian:      'Vegetarian',
  non_vegetarian:  'Non-vegetarian',
  unknown:         'Not yet declared',
};

/**
 * Roll a recipe's ingredients up into one dish verdict.
 *
 * @param {Array<{name, allergens, diet}>} ingredients  as declared. `allergens`
 *        null means undeclared; `[]` means declared to contain none.
 * @param {boolean} hasRecipe  false when the dish has no recipe at all.
 */
function deriveDishDietary(ingredients = [], hasRecipe = true) {
  if (!hasRecipe) {
    return {
      diet: 'unknown',
      allergens: [],
      complete: false,
      // Named so the UI can say *why*, rather than showing a shrug with no
      // route to fixing it.
      reason: 'no_recipe',
      undeclared: [],
    };
  }

  if (!ingredients.length) {
    return {
      diet: 'unknown',
      allergens: [],
      complete: false,
      reason: 'empty_recipe',
      undeclared: [],
    };
  }

  const undeclared = ingredients
    .filter((i) => i.diet == null || i.allergens == null)
    .map((i) => i.name);

  const allergens = new Set();
  let worstDiet = 'vegan';

  for (const ing of ingredients) {
    for (const a of ing.allergens || []) {
      if (KNOWN_ALLERGENS.includes(a)) allergens.add(a);
    }
    if (ing.diet && DIET_RANK[ing.diet] > DIET_RANK[worstDiet]) {
      worstDiet = ing.diet;
    }
  }

  const complete = undeclared.length === 0;

  return {
    // A single unclassified ingredient collapses the whole dish to unknown.
    // Reporting "vegetarian, allergens: dairy" while one ingredient is a
    // mystery is precisely the confident-but-wrong answer this must not give.
    diet: complete ? worstDiet : 'unknown',
    // The allergens found so far are still worth showing on an incomplete
    // dish — they are true positives. What is NOT safe is the absence of one.
    allergens: [...allergens].sort(),
    complete,
    reason: complete ? null : 'undeclared_ingredients',
    undeclared,
  };
}

/**
 * Does this dish satisfy the guest's filter?
 *
 * `diet` filter is satisfied only by a dish KNOWN to meet it. `avoid` is
 * satisfied only by a dish whose allergen list is COMPLETE and excludes them —
 * an incomplete dish cannot promise the absence of anything.
 */
function matchesFilter(dish, { diet = null, avoid = [] } = {}) {
  if (diet) {
    if (!dish.complete) return false;
    if (DIET_RANK[dish.diet] === undefined) return false;
    // Asking for vegetarian includes vegan; asking for vegan does not include
    // vegetarian.
    if (DIET_RANK[dish.diet] > DIET_RANK[diet]) return false;
  }

  if (avoid.length) {
    if (!dish.complete) return false;
    if (avoid.some((a) => dish.allergens.includes(a))) return false;
  }

  return true;
}

/**
 * How much of the menu can actually answer a dietary question.
 *
 * Surfaced to the operator, not the guest: it is the number that turns "our
 * filters look broken" into "eleven ingredients need a minute of your time".
 */
function declarationCoverage(dishes = []) {
  const total = dishes.length;
  const complete = dishes.filter((d) => d.complete).length;
  const undeclared = new Set();
  for (const d of dishes) {
    for (const name of d.undeclared || []) undeclared.add(name);
  }
  return {
    total,
    complete,
    pct: total > 0 ? Math.round((complete / total) * 100) : null,
    undeclaredIngredients: [...undeclared].sort(),
  };
}

module.exports = {
  KNOWN_ALLERGENS,
  DIETS,
  DIET_RANK,
  DIET_LABELS,
  deriveDishDietary,
  matchesFilter,
  declarationCoverage,
};
