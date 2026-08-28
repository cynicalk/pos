const db = require('../shared/db');

/*
 * Guest-surface data access (MERGE_PLAN.md Phase 7) — dietary declarations,
 * ingredient disclosure, and cached menu translations.
 */

/**
 * Available dishes with their recipe ingredients and declarations.
 *
 * One query, aggregating ingredients per dish, rather than a query per dish:
 * this is on the path a guest hits after scanning a QR code at the table, and
 * a menu of eighty dishes must not be eighty round trips.
 *
 * `has_recipe` is separate from an empty ingredient array on purpose. A dish
 * with no recipe and a dish whose recipe is empty are different problems with
 * different fixes, and modules/menu/dietary.js reports them differently.
 */
const getMenuWithDietary = (restaurantId) =>
  db.query(
    `SELECT mi.id,
            mi.name,
            mi.description,
            mi.price,
            mi.category,
            mi.translations,
            (mi.recipe_id IS NOT NULL) AS has_recipe,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'name',      ing.name,
                        'allergens', ing.allergens,
                        'diet',      ing.diet
                      ) ORDER BY ing.name)
                 FROM recipe_ingredients ri
                 JOIN ingredients ing ON ing.id = ri.ingredient_id
                WHERE ri.recipe_id = mi.recipe_id),
              '[]'::json
            ) AS ingredients
       FROM menu_items mi
      WHERE mi.restaurant_id = $1
        AND mi.available = true
        AND mi.archived_at IS NULL
      ORDER BY mi.category NULLS LAST, mi.name`,
    [restaurantId],
  ).then((r) => r.rows);

/**
 * Available dishes with their recipe lines and per-ingredient nutrition.
 *
 * Same one-query-per-menu discipline as getMenuWithDietary, but carries the
 * recipe quantity and yield the nutrition explosion needs, plus each
 * ingredient's per-unit macros (NULL where undeclared — the module treats that
 * as "cannot vouch", not zero). Line quantities are the operator's costing data
 * and never leave the server.
 */
const getMenuWithNutrition = (restaurantId) =>
  db.query(
    `SELECT mi.id,
            mi.name,
            mi.category,
            (mi.recipe_id IS NOT NULL) AS has_recipe,
            r.yield_quantity::float8 AS yield,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'ingredientName', ing.name,
                        'quantity',       ri.quantity::float8,
                        'kcalPerUnit',    ing.kcal_per_unit::float8,
                        'proteinPerUnit', ing.protein_g_per_unit::float8,
                        'carbsPerUnit',   ing.carbs_g_per_unit::float8,
                        'fatPerUnit',     ing.fat_g_per_unit::float8
                      ) ORDER BY ing.name)
                 FROM recipe_ingredients ri
                 JOIN ingredients ing ON ing.id = ri.ingredient_id
                WHERE ri.recipe_id = mi.recipe_id),
              '[]'::json
            ) AS lines
       FROM menu_items mi
       LEFT JOIN recipes r ON r.id = mi.recipe_id
      WHERE mi.restaurant_id = $1
        AND mi.available = true
        AND mi.archived_at IS NULL
      ORDER BY mi.category NULLS LAST, mi.name`,
    [restaurantId],
  ).then((r) => r.rows);

/** Ingredients an operator still has to classify. */
const listIngredientDeclarations = (restaurantId) =>
  db.query(
    `SELECT id, name, allergens, diet, dietary_declared_at
       FROM ingredients
      WHERE restaurant_id = $1 AND is_active = true
      ORDER BY (diet IS NULL OR allergens IS NULL) DESC, name`,
    [restaurantId],
  ).then((r) => r.rows);

/**
 * Record a declaration.
 *
 * `allergens` is written as given — including an empty array, which is a real
 * statement ("I checked; it contains none of these") and must be storable
 * distinctly from NULL ("nobody has looked").
 */
const setIngredientDeclaration = (restaurantId, ingredientId, { allergens, diet, userId }) =>
  db.query(
    `UPDATE ingredients
        SET allergens = $3::text[],
            diet = $4,
            dietary_declared_at = now(),
            dietary_declared_by = $5
      WHERE restaurant_id = $1 AND id = $2
      RETURNING id, name, allergens, diet, dietary_declared_at`,
    [restaurantId, ingredientId, allergens, diet, userId || null],
  ).then((r) => r.rows[0] || null);

/** Dishes with no cached translation for this language yet. */
const listUntranslated = (restaurantId, language, limit) =>
  db.query(
    `SELECT id, name, description
       FROM menu_items
      WHERE restaurant_id = $1
        AND available = true
        AND archived_at IS NULL
        AND NOT (translations ? $2)
      ORDER BY name
      LIMIT $3`,
    [restaurantId, language, limit],
  ).then((r) => r.rows);

/**
 * Merge one language's entry into the cached translations.
 *
 * jsonb_set with create_if_missing, so adding Tamil never disturbs the Hindi
 * already cached — a whole-column overwrite here would silently drop every
 * other language each time one was regenerated.
 */
const cacheTranslation = (restaurantId, itemId, language, entry) =>
  db.query(
    `UPDATE menu_items
        SET translations = jsonb_set(
              COALESCE(translations, '{}'::jsonb),
              ARRAY[$3::text],
              $4::jsonb,
              true
            )
      WHERE restaurant_id = $1 AND id = $2
      RETURNING id`,
    [restaurantId, itemId, language, JSON.stringify(entry)],
  ).then((r) => r.rows[0] || null);

/**
 * How complete each language's translation is.
 *
 * CROSS JOIN against the supplied language list rather than against whatever
 * keys happen to be in the JSON, so a language nobody has translated yet still
 * comes back as 0 of 40 instead of vanishing from the list. An operator needs
 * to see the language they have not done, which is exactly the row a
 * key-derived query would omit.
 */
const getTranslationCoverage = (restaurantId, languageCodes) =>
  db.query(
    `WITH live AS (
       SELECT id, translations FROM menu_items
        WHERE restaurant_id = $1 AND available = true AND archived_at IS NULL
     ),
     langs AS (SELECT unnest($2::text[]) AS code)
     SELECT langs.code,
            COUNT(live.id) FILTER (WHERE live.translations ? langs.code)::int AS translated,
            (SELECT COUNT(*) FROM live)::int AS total
       FROM langs
       LEFT JOIN live ON true
      GROUP BY langs.code
      ORDER BY langs.code`,
    [restaurantId, languageCodes],
  ).then((r) => r.rows);

module.exports = {
  getMenuWithDietary,
  getMenuWithNutrition,
  listIngredientDeclarations,
  setIngredientDeclaration,
  listUntranslated,
  cacheTranslation,
  getTranslationCoverage,
};
