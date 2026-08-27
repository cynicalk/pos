const repo = require('./guestmenu.repository');
const dietary = require('../modules/menu/dietary');
const translate = require('../modules/menu/translate');
const llm = require('../ai/llm.client');
const { ValidationError, NotFoundError } = require('../shared/errors');

/*
 * Guest surface (MERGE_PLAN.md Phase 7) — the menu card a guest sees after
 * scanning the table QR, plus the operator's dietary declarations behind it.
 *
 * The load-bearing decision: **the guest path never calls a model.**
 * Translations are read from cache and dietary verdicts are derived from
 * declared data. A guest at a table waiting on a local 7B is the Phase 6
 * insights hang all over again, except this time with a person sitting in the
 * restaurant looking at a spinner.
 */

// One translation pass covers this many dishes. Same reasoning as the review
// classifier's batch cap: a whole menu in one prompt is where a small model
// starts losing its place and returns a list of the wrong length.
const TRANSLATE_BATCH = 15;

// Operator-initiated, so waiting is expected — but bounded, and well under the
// dashboard's own ceiling for this call.
const TRANSLATE_TIMEOUT_MS = 60_000;

/* ── The guest menu card ─────────────────────────────────────────────────── */

/**
 * The menu as a guest sees it: localised, with dietary verdicts attached.
 *
 * Filtering happens here rather than in SQL because the verdict is derived, not
 * stored — and deriving it in SQL would mean the "one undeclared ingredient
 * makes the dish unknown" rule living in two places, which is how the guest
 * page and the operator page end up disagreeing about whether a dish is vegan.
 */
async function getGuestMenu(restaurantId, { language = null, diet = null, avoid = [] } = {}) {
  const lang = language && translate.isSupported(language) ? language : null;
  const avoidList = (Array.isArray(avoid) ? avoid : [avoid])
    .filter((a) => dietary.KNOWN_ALLERGENS.includes(a));

  if (diet && !dietary.DIETS.includes(diet)) {
    throw new ValidationError(`diet must be one of: ${dietary.DIETS.join(', ')}`);
  }

  const rows = await repo.getMenuWithDietary(restaurantId);

  const dishes = rows.map((row) => {
    const verdict = dietary.deriveDishDietary(row.ingredients || [], row.has_recipe);
    const localised = lang
      ? translate.localise(row, lang)
      : { name: row.name, description: row.description, translated: false };

    return {
      id: row.id,
      name: localised.name,
      description: localised.description,
      translated: localised.translated,
      // Kept alongside the localised name so a guest can read the dish in their
      // own language and still say the English name to the staff.
      originalName: row.name,
      price: Number(row.price),
      category: row.category,
      diet: verdict.diet,
      dietLabel: dietary.DIET_LABELS[verdict.diet],
      allergens: verdict.allergens,
      // The honest third state. A dish is not "allergen-free"; it is either
      // known to contain these, or not fully declared.
      dietaryComplete: verdict.complete,
      dietaryReason: verdict.reason,
      // Ingredient disclosure — the dish's actual recipe, which the POS has
      // had all along. Names only: quantities are the operator's costing, not
      // the guest's business.
      ingredients: (row.ingredients || []).map((i) => i.name),
      _verdict: verdict,
    };
  });

  const filtered = (diet || avoidList.length)
    ? dishes.filter((d) => dietary.matchesFilter(d._verdict, { diet, avoid: avoidList }))
    : dishes;

  return {
    language: lang,
    languages: translate.MENU_LANGUAGES,
    filters: { diet, avoid: avoidList },
    allergenOptions: dietary.KNOWN_ALLERGENS,
    dishes: filtered.map(({ _verdict, ...rest }) => rest),
    // Stated to the guest, not hidden from them: how many dishes could not be
    // included in the answer because nobody has declared what is in them. A
    // filter that quietly hides half the menu is worse than one that says so.
    total: dishes.length,
    shown: filtered.length,
    undeclaredDishes: dishes.filter((d) => !d.dietaryComplete).length,
  };
}

/* ── Operator: dietary declarations ──────────────────────────────────────── */

async function getDeclarations(restaurantId) {
  const [ingredients, menu] = await Promise.all([
    repo.listIngredientDeclarations(restaurantId),
    repo.getMenuWithDietary(restaurantId),
  ]);

  const dishes = menu.map((row) => dietary.deriveDishDietary(row.ingredients || [], row.has_recipe));

  return {
    allergenOptions: dietary.KNOWN_ALLERGENS,
    dietOptions: dietary.DIETS,
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      // null and [] are different answers and stay different all the way out.
      allergens: i.allergens,
      diet: i.diet,
      declared: i.diet != null && i.allergens != null,
      declaredAt: i.dietary_declared_at,
    })),
    // The number that turns "our filters look broken" into a short to-do list.
    coverage: dietary.declarationCoverage(dishes),
  };
}

async function declareIngredient(restaurantId, ingredientId, payload, userId) {
  const { allergens, diet } = payload;

  if (!dietary.DIETS.includes(diet)) {
    throw new ValidationError(`diet must be one of: ${dietary.DIETS.join(', ')}`);
  }
  if (!Array.isArray(allergens)) {
    // Rejected rather than defaulted to []. Defaulting would let a malformed
    // request declare an ingredient allergen-free, which is the one direction
    // this must never fail in.
    throw new ValidationError('allergens must be an array (send [] for none)');
  }
  const unknown = allergens.filter((a) => !dietary.KNOWN_ALLERGENS.includes(a));
  if (unknown.length) {
    throw new ValidationError(`unknown allergen(s): ${unknown.join(', ')}`);
  }

  const saved = await repo.setIngredientDeclaration(restaurantId, ingredientId, {
    allergens, diet, userId,
  });
  if (!saved) throw new NotFoundError('Ingredient not found');
  return saved;
}

/* ── Operator: translation ───────────────────────────────────────────────── */

async function getTranslationStatus(restaurantId) {
  const coverage = await repo.getTranslationCoverage(
    restaurantId, translate.MENU_LANGUAGES.map((l) => l.code),
  );
  const byCode = Object.fromEntries(coverage.map((c) => [c.code, c]));

  return {
    languages: translate.MENU_LANGUAGES.map((l) => {
      const c = byCode[l.code] || { translated: 0, total: 0 };
      return {
        ...l,
        translated: c.translated,
        total: c.total,
        pct: c.total > 0 ? Math.round((c.translated / c.total) * 100) : null,
      };
    }),
  };
}

/**
 * Translate the dishes still missing this language, and cache them.
 *
 * Returns rather than throws when no model is reachable. The menu card serves
 * English in that case, which is a working menu — failing the request would
 * make the operator think something is broken when nothing is.
 */
async function translateMenu(restaurantId, language) {
  if (!translate.isSupported(language)) {
    throw new ValidationError(
      `language must be one of: ${translate.MENU_LANGUAGES.map((l) => l.code).join(', ')}`,
    );
  }

  const pending = await repo.listUntranslated(restaurantId, language, TRANSLATE_BATCH);
  if (!pending.length) {
    return { translated: 0, remaining: 0, note: 'Everything on the menu is already translated.' };
  }

  if (!(await llm.reachable(1500))) {
    return {
      translated: 0,
      remaining: pending.length,
      note: 'No AI model is reachable, so nothing was translated. The menu card serves English '
        + 'until one is — no placeholder text was written.',
    };
  }

  let entries;
  try {
    const { content } = await llm.chat([
      { role: 'system', content: translate.buildPrompt(language) },
      { role: 'user', content: translate.buildItemList(pending) },
    ], {
      temperature: 0.2,
      maxTokens: 1200,
      retries: 1,
      timeoutMs: TRANSLATE_TIMEOUT_MS,
    });
    entries = translate.parseTranslations(content, pending.length);
  } catch {
    entries = null;
  }

  if (!entries) {
    return {
      translated: 0,
      remaining: pending.length,
      note: 'The model did not return a usable translation for every dish, so none were saved. '
        + 'A partial list would have put each translation on the wrong dish.',
    };
  }

  for (let i = 0; i < pending.length; i += 1) {
    await repo.cacheTranslation(restaurantId, pending[i].id, language, entries[i]);
  }

  const stillPending = await repo.listUntranslated(restaurantId, language, TRANSLATE_BATCH);
  return {
    translated: pending.length,
    remaining: stillPending.length,
    note: stillPending.length > 0
      ? `${stillPending.length} more to go — run it again to continue.`
      : null,
  };
}

module.exports = {
  getGuestMenu,
  getDeclarations,
  declareIngredient,
  getTranslationStatus,
  translateMenu,
  TRANSLATE_BATCH,
};
