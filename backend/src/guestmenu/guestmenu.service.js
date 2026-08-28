const repo = require('./guestmenu.repository');
const dietary = require('../modules/menu/dietary');
const nutrition = require('../modules/menu/nutrition');
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

// Dishes per model call. Small on purpose: a short list is where a small model
// keeps its place and returns the right length, and a failed chunk loses only a
// few dishes instead of the whole menu (each chunk saves on its own, the moment
// it comes back — so even a client timeout mid-run never loses what completed).
const TRANSLATE_CHUNK = 6;

// Dishes attempted per operator click. Bounded so the request fits the browser's
// own timeout on a slow local model; the note tells the operator to run it again
// to pick up the rest, and each run resumes exactly where the last left off.
const TRANSLATE_MAX_PER_RUN = 12;

// A cold just-in-time model load (LM Studio/Ollama load the model on first use)
// is worn once here so the chunks after it run warm. Best-effort — its failure
// is not fatal.
const TRANSLATE_WARMUP_MS = 60_000;

// Per-chunk budget. Generous because structured generation on a small local
// model is not fast; a chunk that overruns is simply left for the next run.
const TRANSLATE_CHUNK_MS = 60_000;


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

/* ── Operator + guest: nutrition ─────────────────────────────────────────── */

// Shape a nutrition row (has_recipe, lines already camelCased by the query) into
// the pure module's input. Kept here so the module stays free of the DB shape.
function toNutritionInput(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    hasRecipe: row.has_recipe,
    yield: row.yield,
    lines: row.lines || [],
  };
}

/**
 * Per-serving nutrition for the whole menu, derived from recipes and declared
 * per-ingredient macros. Never invents a number: a dish with an undeclared
 * ingredient reports nothing and names the gap.
 */
async function getNutrition(restaurantId) {
  const rows = await repo.getMenuWithNutrition(restaurantId);
  const built = nutrition.buildMenuNutrition(rows.map(toNutritionInput));
  return {
    ...built,
    dishes: built.dishes.map((d, i) => ({ ...d, category: rows[i].category })),
  };
}

/**
 * A map of dishId → per-serving nutrition (or null), for the guest surface to
 * hang on its ApiDish. Same derivation as the operator screen, so the two never
 * disagree about a dish.
 */
async function getGuestNutritionMap(restaurantId) {
  const rows = await repo.getMenuWithNutrition(restaurantId);
  const map = new Map();
  for (const row of rows) {
    map.set(row.id, nutrition.dishNutritionForGuest(toNutritionInput(row)));
  }
  return map;
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

  const pending = await repo.listUntranslated(restaurantId, language, TRANSLATE_MAX_PER_RUN);
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

  // Prime the model once so the first chunk is not paying a cold just-in-time
  // load inside its own timeout — that cold load is what silently failed before.
  await llm.warmup(TRANSLATE_WARMUP_MS);

  // Translate in small chunks, saving each that parses cleanly. A chunk is
  // still all-or-nothing WITHIN itself (a short or reordered list would misalign
  // those dishes), but one bad chunk no longer discards the whole menu.
  let translated = 0;
  let failedChunks = 0;
  // Attempt a chunk with schema-constrained output; if the server rejects the
  // response_format (some don't), fall back to a plain call — the parser handles
  // free-form JSON too, so the schema is a reliability bonus, not a requirement.
  const runChunk = async (chunk) => {
    const messages = [
      { role: 'system', content: translate.buildPrompt(language) },
      { role: 'user', content: translate.buildItemList(chunk) },
    ];
    const opts = { temperature: 0.2, maxTokens: 1600, retries: 1, timeoutMs: TRANSLATE_CHUNK_MS };
    try {
      const { content } = await llm.chat(messages, { ...opts, responseFormat: translate.RESPONSE_FORMAT });
      return translate.parseTranslations(content, chunk.length);
    } catch {
      try {
        const { content } = await llm.chat(messages, opts);
        return translate.parseTranslations(content, chunk.length);
      } catch {
        return null;
      }
    }
  };

  for (let i = 0; i < pending.length; i += TRANSLATE_CHUNK) {
    const chunk = pending.slice(i, i + TRANSLATE_CHUNK);
    const entries = await runChunk(chunk);

    if (!entries) { failedChunks += 1; continue; }
    for (let j = 0; j < chunk.length; j += 1) {
      await repo.cacheTranslation(restaurantId, chunk[j].id, language, entries[j]);
    }
    translated += chunk.length;
  }

  const stillPending = await repo.listUntranslated(restaurantId, language, TRANSLATE_MAX_PER_RUN);

  let note = null;
  if (translated === 0) {
    note = 'The model could not return a usable translation for any batch, so nothing was saved. '
      + 'Nothing was written to the wrong dish — try again; the model may just have been loading.';
  } else if (failedChunks > 0) {
    note = `Saved ${translated}. ${failedChunks} batch(es) didn't come back usable and were left `
      + 'for a retry — run it again to pick them up.';
  } else if (stillPending.length > 0) {
    note = `${stillPending.length} more to go — run it again to continue.`;
  }

  return { translated, remaining: stillPending.length, failedChunks, note };
}

module.exports = {
  getGuestMenu,
  getDeclarations,
  declareIngredient,
  getNutrition,
  getGuestNutritionMap,
  getTranslationStatus,
  translateMenu,
  TRANSLATE_CHUNK,
  TRANSLATE_MAX_PER_RUN,
};
