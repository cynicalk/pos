const nutrition = require('../src/modules/menu/nutrition');

/**
 * Nutrition is a recipe explosion the operator can trust only if it never fills
 * a gap with a guess. These pin the two things that matter: the arithmetic is
 * the same per-serving explosion the prep sheet does, and a dish missing any
 * component of that arithmetic reports nothing rather than a partial number.
 */

// A line with full nutrition, per the ingredient's unit.
const line = (name, quantity, kcal, protein, carbs, fat) => ({
  ingredientName: name,
  quantity,
  kcalPerUnit: kcal,
  proteinPerUnit: protein,
  carbsPerUnit: carbs,
  fatPerUnit: fat,
});

// A line whose ingredient nobody entered nutrition for.
const undeclaredLine = (name, quantity) => ({
  ingredientName: name, quantity, kcalPerUnit: null, proteinPerUnit: null, carbsPerUnit: null, fatPerUnit: null,
});

describe('buildDishNutrition', () => {
  test('sums per-serving macros from the recipe explosion', () => {
    // 0.2 kg chicken (1650 kcal/kg) + 0.15 kg rice (3600 kcal/kg), yield 1.
    const dish = {
      id: 'd1', name: 'Chicken Rice', hasRecipe: true, yield: 1,
      lines: [line('Chicken', 0.2, 1650, 310, 0, 36), line('Rice', 0.15, 3600, 75, 800, 6)],
    };
    const n = nutrition.buildDishNutrition(dish);
    expect(n.complete).toBe(true);
    // 0.2*1650 + 0.15*3600 = 330 + 540 = 870
    expect(n.perServing.kcal).toBe(870);
    // 0.2*310 + 0.15*75 = 62 + 11.25 = 73.25 → 73.3
    expect(n.perServing.protein).toBe(73.3);
    expect(n.perServing.carbs).toBe(120); // 0.15*800
    expect(n.declaredCount).toBe(2);
  });

  test('divides recipe quantity by yield to get per serving', () => {
    // Same ingredients but the recipe yields 4 servings — quarter the numbers.
    const dish = {
      id: 'd2', name: 'Batch Dish', hasRecipe: true, yield: 4,
      lines: [line('Chicken', 0.8, 1650, 310, 0, 36)],
    };
    const n = nutrition.buildDishNutrition(dish);
    expect(n.perServing.kcal).toBe(330); // 0.8/4 * 1650
  });

  test('a missing or zero yield is treated as one serving', () => {
    const dish = {
      id: 'd3', name: 'Per Portion', hasRecipe: true, yield: null,
      lines: [line('Egg', 2, 78, 6.3, 0.6, 5.3)],
    };
    expect(nutrition.buildDishNutrition(dish).perServing.kcal).toBe(156);
  });

  test('one undeclared ingredient makes the whole dish report nothing', () => {
    const dish = {
      id: 'd4', name: 'Chef Special', hasRecipe: true, yield: 1,
      lines: [line('Rice', 0.15, 3600, 75, 800, 6), undeclaredLine('House Masala', 0.02)],
    };
    const n = nutrition.buildDishNutrition(dish);
    expect(n.complete).toBe(false);
    expect(n.reason).toBe('undeclared_ingredients');
    expect(n.perServing).toBeNull();
    expect(n.missing).toEqual(['House Masala']);
    expect(n.declaredCount).toBe(1);
    expect(n.ingredientCount).toBe(2);
  });

  test('a dish with no recipe is unknown, not zero', () => {
    const n = nutrition.buildDishNutrition({ id: 'd5', name: 'Mystery', hasRecipe: false, lines: [] });
    expect(n.complete).toBe(false);
    expect(n.reason).toBe('no_recipe');
    expect(n.perServing).toBeNull();
  });

  test('a dish flagged with a recipe but no lines is empty_recipe', () => {
    const n = nutrition.buildDishNutrition({ id: 'd6', name: 'Empty', hasRecipe: true, lines: [] });
    expect(n.reason).toBe('empty_recipe');
    expect(n.complete).toBe(false);
  });
});

describe('buildMenuNutrition coverage', () => {
  const menu = [
    { id: 'a', name: 'Complete', hasRecipe: true, yield: 1, lines: [line('Rice', 0.1, 3600, 75, 800, 6)] },
    { id: 'b', name: 'Undeclared', hasRecipe: true, yield: 1, lines: [undeclaredLine('X', 0.1)] },
    { id: 'c', name: 'No Recipe', hasRecipe: false, lines: [] },
  ];

  test('coverage is over dishes that have a recipe, not the whole menu', () => {
    const { coverage } = nutrition.buildMenuNutrition(menu);
    expect(coverage.total).toBe(3);
    expect(coverage.withRecipe).toBe(2); // a and b
    expect(coverage.complete).toBe(1);   // only a
    expect(coverage.noRecipe).toBe(1);   // c
    expect(coverage.pct).toBe(50);       // 1 of 2 costed dishes
  });

  test('no dishes at all yields a null pct rather than a fabricated 0 or 100', () => {
    expect(nutrition.buildMenuNutrition([]).coverage.pct).toBeNull();
  });
});

describe('dishNutritionForGuest', () => {
  test('returns the per-serving figure only when complete, else null', () => {
    const complete = { id: 'a', name: 'C', hasRecipe: true, yield: 1, lines: [line('Rice', 0.1, 3600, 75, 800, 6)] };
    const incomplete = { id: 'b', name: 'I', hasRecipe: false, lines: [] };
    expect(nutrition.dishNutritionForGuest(complete)).toEqual({ kcal: 360, protein: 7.5, carbs: 80, fat: 0.6 });
    expect(nutrition.dishNutritionForGuest(incomplete)).toBeNull();
  });
});
