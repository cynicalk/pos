/*
 * Phase 7 guest-surface pure tests (MERGE_PLAN.md).
 *
 * These are the highest-stakes assertions in the codebase. A guest with a nut
 * allergy reads a dietary filter and makes a medical decision with it, so every
 * test here is written from the same question: can this ever say "safe" when it
 * does not know?
 */

const {
  KNOWN_ALLERGENS, deriveDishDietary, matchesFilter, declarationCoverage,
} = require('../src/modules/menu/dietary');
const translate = require('../src/modules/menu/translate');

const ing = (name, diet, allergens) => ({ name, diet, allergens });

describe('deriving a dish verdict', () => {
  test('a fully declared vegan dish is vegan', () => {
    const v = deriveDishDietary([
      ing('Chickpeas', 'vegan', []),
      ing('Tomato', 'vegan', []),
    ]);
    expect(v.diet).toBe('vegan');
    expect(v.allergens).toEqual([]);
    expect(v.complete).toBe(true);
  });

  test('the least restrictive ingredient decides the dish', () => {
    // One splash of ghee makes a vegan dish vegetarian.
    const v = deriveDishDietary([
      ing('Chickpeas', 'vegan', []),
      ing('Ghee', 'vegetarian', ['dairy']),
    ]);
    expect(v.diet).toBe('vegetarian');
    expect(v.allergens).toEqual(['dairy']);
  });

  test('one piece of chicken makes the whole dish non-vegetarian', () => {
    const v = deriveDishDietary([
      ing('Rice', 'vegan', []),
      ing('Chicken', 'non_vegetarian', []),
    ]);
    expect(v.diet).toBe('non_vegetarian');
  });

  test('allergens are the union across ingredients, deduplicated', () => {
    const v = deriveDishDietary([
      ing('Paneer', 'vegetarian', ['dairy']),
      ing('Cream', 'vegetarian', ['dairy']),
      ing('Cashew', 'vegan', ['nuts']),
    ]);
    expect(v.allergens).toEqual(['dairy', 'nuts']);
  });

  test('ONE undeclared ingredient collapses the dish to unknown', () => {
    // The central safety rule. "Vegetarian, contains dairy" while one
    // ingredient is a mystery is the confident-but-wrong answer.
    const v = deriveDishDietary([
      ing('Paneer', 'vegetarian', ['dairy']),
      ing('Mystery masala', null, null),
    ]);
    expect(v.diet).toBe('unknown');
    expect(v.complete).toBe(false);
    expect(v.undeclared).toEqual(['Mystery masala']);
  });

  test('an ingredient with a diet but no allergen list is still undeclared', () => {
    const v = deriveDishDietary([ing('Flour', 'vegan', null)]);
    expect(v.complete).toBe(false);
  });

  test('allergens found so far are still reported on an incomplete dish', () => {
    // A true positive stays useful. It is the ABSENCE of an allergen that
    // cannot be promised.
    const v = deriveDishDietary([
      ing('Peanut oil', 'vegan', ['peanuts']),
      ing('Mystery masala', null, null),
    ]);
    expect(v.allergens).toEqual(['peanuts']);
    expect(v.complete).toBe(false);
  });

  test('a dish with no recipe is unknown, not allergen-free', () => {
    const v = deriveDishDietary([], false);
    expect(v.diet).toBe('unknown');
    expect(v.complete).toBe(false);
    expect(v.reason).toBe('no_recipe');
  });

  test('an empty recipe is reported differently from a missing one', () => {
    // Different problems, different fixes.
    expect(deriveDishDietary([], true).reason).toBe('empty_recipe');
    expect(deriveDishDietary([], false).reason).toBe('no_recipe');
  });

  test('an allergen outside the known vocabulary is ignored, not passed through', () => {
    const v = deriveDishDietary([ing('Something', 'vegan', ['dairy', 'msg'])]);
    expect(v.allergens).toEqual(['dairy']);
  });
});

describe('filtering', () => {
  const vegan = deriveDishDietary([ing('Chickpeas', 'vegan', [])]);
  const vegetarian = deriveDishDietary([ing('Paneer', 'vegetarian', ['dairy'])]);
  const meat = deriveDishDietary([ing('Chicken', 'non_vegetarian', [])]);
  const unknown = deriveDishDietary([ing('Mystery', null, null)]);
  const nutty = deriveDishDietary([ing('Cashew', 'vegan', ['nuts'])]);

  test('asking for vegetarian includes vegan dishes', () => {
    expect(matchesFilter(vegan, { diet: 'vegetarian' })).toBe(true);
    expect(matchesFilter(vegetarian, { diet: 'vegetarian' })).toBe(true);
  });

  test('asking for vegan excludes vegetarian dishes', () => {
    expect(matchesFilter(vegetarian, { diet: 'vegan' })).toBe(false);
  });

  test('meat never satisfies a vegetarian filter', () => {
    expect(matchesFilter(meat, { diet: 'vegetarian' })).toBe(false);
  });

  test('an unknown dish NEVER satisfies a diet filter', () => {
    // The rule people are tempted to relax when the filtered page looks sparse.
    // "Not known to contain meat" is not "known to be vegetarian".
    expect(matchesFilter(unknown, { diet: 'vegetarian' })).toBe(false);
    expect(matchesFilter(unknown, { diet: 'non_vegetarian' })).toBe(false);
  });

  test('avoiding an allergen excludes dishes known to contain it', () => {
    expect(matchesFilter(nutty, { avoid: ['nuts'] })).toBe(false);
    expect(matchesFilter(vegan, { avoid: ['nuts'] })).toBe(true);
  });

  test('an incomplete dish cannot promise the absence of an allergen', () => {
    const partial = deriveDishDietary([
      ing('Rice', 'vegan', []),
      ing('Mystery', null, null),
    ]);
    expect(matchesFilter(partial, { avoid: ['nuts'] })).toBe(false);
  });

  test('no filter shows everything, including the unknowns', () => {
    // Unfiltered browsing must not hide dishes — the guest just is not being
    // promised anything about them.
    expect(matchesFilter(unknown, {})).toBe(true);
    expect(matchesFilter(unknown)).toBe(true);
  });

  test('every known allergen is filterable', () => {
    for (const allergen of KNOWN_ALLERGENS) {
      const dish = deriveDishDietary([ing('X', 'vegan', [allergen])]);
      expect(matchesFilter(dish, { avoid: [allergen] })).toBe(false);
    }
  });
});

describe('declaration coverage', () => {
  test('reports which ingredients are holding the menu back', () => {
    const dishes = [
      deriveDishDietary([ing('Rice', 'vegan', [])]),
      deriveDishDietary([ing('Rice', 'vegan', []), ing('Masala X', null, null)]),
      deriveDishDietary([ing('Masala X', null, null), ing('Masala Y', null, null)]),
    ];
    const c = declarationCoverage(dishes);
    expect(c.total).toBe(3);
    expect(c.complete).toBe(1);
    expect(c.pct).toBe(33);
    // Deduplicated across dishes: one ingredient, one job to do.
    expect(c.undeclaredIngredients).toEqual(['Masala X', 'Masala Y']);
  });

  test('an empty menu reports no percentage rather than zero', () => {
    expect(declarationCoverage([]).pct).toBeNull();
  });
});

describe('menu translation', () => {
  test('rejects a list of the wrong length', () => {
    // The dangerous failure: a short list shifts every translation onto the
    // wrong dish, putting the safe dish's name above the one with peanuts.
    expect(translate.parseTranslations('[{"name":"A","description":""}]', 2)).toBeNull();
  });

  test('rejects prose', () => {
    expect(translate.parseTranslations('Sure, here you go!', 1)).toBeNull();
  });

  test('rejects an entry with no name', () => {
    expect(translate.parseTranslations('[{"name":"","description":"x"}]', 1)).toBeNull();
  });

  test('accepts a well-formed list and trims it', () => {
    const parsed = translate.parseTranslations(
      '[{"name":" बिरयानी ","description":" चावल "}]', 1,
    );
    expect(parsed).toEqual([{ name: 'बिरयानी', description: 'चावल' }]);
  });

  test('tolerates a model wrapping the array in chatter', () => {
    const parsed = translate.parseTranslations(
      'Here: [{"name":"Dosa","description":"Crisp"}] done', 1,
    );
    expect(parsed[0].name).toBe('Dosa');
  });

  test('the prompt insists dish names stay orderable', () => {
    // Without this a model renders "Butter Naan" as "Pain au Beurre" and the
    // guest orders a dish the kitchen has never heard of.
    const prompt = translate.buildPrompt('fr');
    expect(prompt).toMatch(/transliterate/i);
    expect(prompt).toMatch(/recognisable/i);
  });

  test('the prompt forbids adding claims that are not in the original', () => {
    expect(translate.buildPrompt('hi')).toMatch(/do not add/i);
  });

  test('falls back to English per field, not per item', () => {
    const item = {
      name: 'Dosa',
      description: 'Crisp rice crepe',
      translations: { fr: { name: 'Dosa', description: '' } },
    };
    const out = translate.localise(item, 'fr');
    expect(out.name).toBe('Dosa');
    expect(out.description).toBe('Crisp rice crepe');
    expect(out.translated).toBe(true);
  });

  test('an untranslated item serves English and says so', () => {
    const out = translate.localise({ name: 'Dosa', description: 'X', translations: {} }, 'fr');
    expect(out.translated).toBe(false);
    expect(out.name).toBe('Dosa');
  });

  test('an unsupported language is not supported', () => {
    expect(translate.isSupported('fr')).toBe(true);
    expect(translate.isSupported('kl')).toBe(false);
  });
});
