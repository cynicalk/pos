/*
 * Phase 7 guest-surface SQL coverage (MERGE_PLAN.md).
 *
 * The pure suite cannot see that NULL and [] survive the round trip through
 * Postgres as different answers, that jsonb_set does not clobber other
 * languages, or that the guest path never reaches a model.
 */

jest.mock('../src/ai/llm.client', () => ({
  reachable: jest.fn(async () => false),
  chat: jest.fn(async () => ({ content: '' })),
}));

const db = require('../src/shared/db');
const llm = require('../src/ai/llm.client');
const service = require('../src/guestmenu/guestmenu.service');
const repo = require('../src/guestmenu/guestmenu.repository');
const { createRestaurant, deleteRestaurant } = require('./helpers');

let restaurantId;
let paneerId;
let riceId;
let mysteryId;
let paneerDish;
let plainRice;
let mysteryDish;
let noRecipeDish;

const addIngredient = async (name) => {
  const { rows: [i] } = await db.query(
    `INSERT INTO ingredients (restaurant_id, name, unit) VALUES ($1, $2, 'kg') RETURNING id`,
    [restaurantId, name],
  );
  return i.id;
};

const addDish = async (name, ingredientIds) => {
  let recipeId = null;
  if (ingredientIds) {
    const { rows: [r] } = await db.query(
      `INSERT INTO recipes (restaurant_id, name, yield_quantity) VALUES ($1, $2, 1) RETURNING id`,
      [restaurantId, `${name} recipe`],
    );
    recipeId = r.id;
    for (const id of ingredientIds) {
      await db.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, cost_per_unit)
         VALUES ($1, $2, 1, 'kg', 10)`,
        [recipeId, id],
      );
    }
  }
  const { rows: [m] } = await db.query(
    `INSERT INTO menu_items (restaurant_id, name, price, category, available, recipe_id, description)
     VALUES ($1, $2, 200, 'Mains', true, $3, 'A dish') RETURNING id`,
    [restaurantId, name, recipeId],
  );
  return m.id;
};

beforeAll(async () => {
  restaurantId = await createRestaurant('Guest Menu Test Co');
  paneerId = await addIngredient('Paneer');
  riceId = await addIngredient('Rice');
  mysteryId = await addIngredient('House masala');

  paneerDish = await addDish('Paneer Butter Masala', [paneerId, riceId]);
  plainRice = await addDish('Steamed Rice', [riceId]);
  mysteryDish = await addDish('Chef Special', [riceId, mysteryId]);
  noRecipeDish = await addDish('Mystery Platter', null);
});

afterAll(async () => {
  await deleteRestaurant(restaurantId);
  await db.pool?.end?.();
});

beforeEach(() => {
  llm.reachable.mockResolvedValue(false);
  llm.chat.mockResolvedValue({ content: '' });
});

describe('declarations', () => {
  test('an empty allergen list is stored as a real answer, not as unknown', async () => {
    // The distinction the whole safety model rests on: [] means "I checked",
    // NULL means "nobody looked". They must survive the round trip apart.
    await service.declareIngredient(restaurantId, riceId, {
      allergens: [], diet: 'vegan',
    }, null);

    const rows = await repo.listIngredientDeclarations(restaurantId);
    const rice = rows.find((r) => r.id === riceId);
    expect(rice.allergens).toEqual([]);
    expect(rice.allergens).not.toBeNull();
    expect(rice.diet).toBe('vegan');

    const mystery = rows.find((r) => r.id === mysteryId);
    expect(mystery.allergens).toBeNull();
  });

  test('refuses a malformed allergen field rather than defaulting it to none', async () => {
    // Defaulting would let a bad request silently declare something
    // allergen-free — the one direction this must never fail in.
    await expect(service.declareIngredient(restaurantId, riceId, {
      allergens: 'dairy', diet: 'vegan',
    }, null)).rejects.toThrow(/must be an array/);
  });

  test('refuses an allergen outside the known vocabulary', async () => {
    await expect(service.declareIngredient(restaurantId, riceId, {
      allergens: ['msg'], diet: 'vegan',
    }, null)).rejects.toThrow(/unknown allergen/);
  });

  test('refuses an unknown diet', async () => {
    await expect(service.declareIngredient(restaurantId, riceId, {
      allergens: [], diet: 'pescatarian',
    }, null)).rejects.toThrow(/diet must be one of/);
  });

  test('another restaurant cannot declare our ingredient', async () => {
    const otherId = await createRestaurant('Someone Else GM');
    await expect(service.declareIngredient(otherId, riceId, {
      allergens: [], diet: 'vegan',
    }, null)).rejects.toThrow(/not found/i);
    await deleteRestaurant(otherId);
  });

  test('coverage names the ingredients still to be done', async () => {
    const d = await service.getDeclarations(restaurantId);
    expect(d.coverage.undeclaredIngredients).toContain('House masala');
    expect(d.coverage.total).toBe(4);
  });
});

describe('the guest menu card', () => {
  beforeAll(async () => {
    await service.declareIngredient(restaurantId, paneerId, {
      allergens: ['dairy'], diet: 'vegetarian',
    }, null);
    await service.declareIngredient(restaurantId, riceId, {
      allergens: [], diet: 'vegan',
    }, null);
    // House masala stays undeclared on purpose.
  });

  test('a fully declared dish reports its diet and allergens', async () => {
    const card = await service.getGuestMenu(restaurantId);
    const dish = card.dishes.find((d) => d.id === paneerDish);
    expect(dish.diet).toBe('vegetarian');
    expect(dish.allergens).toEqual(['dairy']);
    expect(dish.dietaryComplete).toBe(true);
  });

  test('ingredient disclosure lists what is in the dish, without quantities', async () => {
    const card = await service.getGuestMenu(restaurantId);
    const dish = card.dishes.find((d) => d.id === paneerDish);
    expect(dish.ingredients.sort()).toEqual(['Paneer', 'Rice']);
    // Costing is the operator's business, not the guest's.
    expect(JSON.stringify(dish)).not.toMatch(/cost_per_unit|quantity/);
  });

  test('one undeclared ingredient makes the dish unknown on the card', async () => {
    const card = await service.getGuestMenu(restaurantId);
    const dish = card.dishes.find((d) => d.id === mysteryDish);
    expect(dish.diet).toBe('unknown');
    expect(dish.dietaryComplete).toBe(false);
    expect(dish.dietaryReason).toBe('undeclared_ingredients');
  });

  test('a dish with no recipe is unknown, not allergen-free', async () => {
    const card = await service.getGuestMenu(restaurantId);
    const dish = card.dishes.find((d) => d.id === noRecipeDish);
    expect(dish.diet).toBe('unknown');
    expect(dish.dietaryReason).toBe('no_recipe');
  });

  test('a vegan filter returns only dishes KNOWN to be vegan', async () => {
    const card = await service.getGuestMenu(restaurantId, { diet: 'vegan' });
    const ids = card.dishes.map((d) => d.id);
    expect(ids).toContain(plainRice);
    expect(ids).not.toContain(paneerDish);
    // The undeclared ones must not slip in.
    expect(ids).not.toContain(mysteryDish);
    expect(ids).not.toContain(noRecipeDish);
  });

  test('avoiding dairy excludes the paneer dish and every undeclared one', async () => {
    const card = await service.getGuestMenu(restaurantId, { avoid: ['dairy'] });
    const ids = card.dishes.map((d) => d.id);
    expect(ids).not.toContain(paneerDish);
    expect(ids).not.toContain(mysteryDish);
    expect(ids).toContain(plainRice);
  });

  test('the card says how many dishes it could not vouch for', async () => {
    const card = await service.getGuestMenu(restaurantId, { diet: 'vegan' });
    expect(card.total).toBe(4);
    expect(card.shown).toBeLessThan(card.total);
    expect(card.undeclaredDishes).toBe(2);
  });

  test('an unknown diet filter is refused rather than ignored', async () => {
    await expect(service.getGuestMenu(restaurantId, { diet: 'keto' }))
      .rejects.toThrow(/diet must be one of/);
  });

  test('a nonsense allergen in the filter is dropped, not treated as a match', async () => {
    const card = await service.getGuestMenu(restaurantId, { avoid: ['unicorn'] });
    expect(card.filters.avoid).toEqual([]);
    expect(card.dishes.length).toBe(4);
  });

  test('the guest path never calls a model', async () => {
    // A guest sitting at a table must not wait on a local 7B — the Phase 6
    // insights hang, with a person in the restaurant watching a spinner.
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockClear();

    await service.getGuestMenu(restaurantId, { language: 'hi' });
    expect(llm.chat).not.toHaveBeenCalled();
    expect(llm.reachable).not.toHaveBeenCalled();
  });
});

describe('translation', () => {
  test('reports a language nobody has translated as zero, not as missing', async () => {
    const status = await service.getTranslationStatus(restaurantId);
    const hi = status.languages.find((l) => l.code === 'hi');
    expect(hi).toBeTruthy();
    expect(hi.translated).toBe(0);
    expect(hi.total).toBe(4);
    expect(hi.pct).toBe(0);
  });

  test('writes nothing and says so when no model is reachable', async () => {
    const result = await service.translateMenu(restaurantId, 'hi');
    expect(result.translated).toBe(0);
    expect(result.note).toMatch(/no ai model is reachable/i);

    // Crucially: no placeholder text was written.
    const card = await service.getGuestMenu(restaurantId, { language: 'hi' });
    expect(card.dishes.every((d) => d.translated === false)).toBe(true);
  });

  test('saves nothing when the model returns the wrong number of entries', async () => {
    llm.reachable.mockResolvedValue(true);
    llm.chat.mockResolvedValue({ content: '[{"name":"A","description":"B"}]' });

    const result = await service.translateMenu(restaurantId, 'hi');
    expect(result.translated).toBe(0);
    expect(result.note).toMatch(/wrong dish/);
  });

  test('caches a good translation and serves it', async () => {
    llm.reachable.mockResolvedValue(true);
    const four = JSON.stringify(
      Array.from({ length: 4 }, (_, i) => ({ name: `नाम${i}`, description: 'विवरण' })),
    );
    llm.chat.mockResolvedValue({ content: four });

    const result = await service.translateMenu(restaurantId, 'hi');
    expect(result.translated).toBe(4);

    const card = await service.getGuestMenu(restaurantId, { language: 'hi' });
    expect(card.dishes.every((d) => d.translated)).toBe(true);
    // The English name travels alongside so the guest can order out loud.
    expect(card.dishes.some((d) => d.originalName === 'Steamed Rice')).toBe(true);
  });

  test('adding a second language does not clobber the first', async () => {
    // jsonb_set with create_if_missing, not a whole-column overwrite.
    llm.reachable.mockResolvedValue(true);
    const four = JSON.stringify(
      Array.from({ length: 4 }, () => ({ name: 'Nom', description: 'Desc' })),
    );
    llm.chat.mockResolvedValue({ content: four });

    await service.translateMenu(restaurantId, 'fr');

    const hindi = await service.getGuestMenu(restaurantId, { language: 'hi' });
    expect(hindi.dishes.every((d) => d.translated)).toBe(true);

    const french = await service.getGuestMenu(restaurantId, { language: 'fr' });
    expect(french.dishes.every((d) => d.translated)).toBe(true);
  });

  test('a second pass has nothing left to translate', async () => {
    const result = await service.translateMenu(restaurantId, 'hi');
    expect(result.translated).toBe(0);
    expect(result.note).toMatch(/already translated/i);
  });

  test('an unsupported language is refused', async () => {
    await expect(service.translateMenu(restaurantId, 'kl'))
      .rejects.toThrow(/language must be one of/);
  });

  test('an unsupported language on the card falls back to English silently', async () => {
    const card = await service.getGuestMenu(restaurantId, { language: 'kl' });
    expect(card.language).toBeNull();
    expect(card.dishes.every((d) => d.translated === false)).toBe(true);
  });
});
