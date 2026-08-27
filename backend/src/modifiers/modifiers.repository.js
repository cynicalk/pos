const db = require('../shared/db');

const getGroups = (restaurantId) =>
  db
    .query(
      `SELECT mg.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id',          mo.id,
               'label',       mo.label,
               'price_delta', mo.price_delta,
               'is_default',  mo.is_default
             ) ORDER BY mo.label
           ) FILTER (WHERE mo.id IS NOT NULL),
           '[]'::json
         ) AS options
       FROM modifier_groups mg
       LEFT JOIN modifier_options mo ON mo.group_id = mg.id
       WHERE mg.restaurant_id = $1
       GROUP BY mg.id
       ORDER BY mg.name`,
      [restaurantId],
    )
    .then((r) => r.rows);

const createGroup = ({ restaurantId, name, isRequired, minSelect, maxSelect }) =>
  db
    .query(
      `INSERT INTO modifier_groups (restaurant_id, name, is_required, min_select, max_select)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [restaurantId, name, isRequired ?? true, minSelect || 1, maxSelect || 1],
    )
    .then((r) => r.rows[0]);

const updateGroup = (id, { name, isRequired, minSelect, maxSelect }, restaurantId) =>
  db
    .query(
      `UPDATE modifier_groups SET
         name        = COALESCE($1, name),
         is_required = COALESCE($2, is_required),
         min_select  = COALESCE($3, min_select),
         max_select  = COALESCE($4, max_select)
       WHERE id = $5 AND restaurant_id = $6 RETURNING *`,
      [name ?? null, isRequired ?? null, minSelect ?? null, maxSelect ?? null, id, restaurantId],
    )
    .then((r) => r.rows[0]);

const deleteGroup = (id, restaurantId) =>
  db
    .query('DELETE FROM modifier_groups WHERE id = $1 AND restaurant_id = $2 RETURNING *', [id, restaurantId])
    .then((r) => r.rows[0]);

// Option ops are tenant-scoped through the parent group's restaurant_id
// (modifier_options has no restaurant_id of its own). Returns undefined when the
// group isn't owned by the caller's restaurant, so the service can 404.
const createOption = ({ groupId, label, priceDelta, isDefault }, restaurantId) =>
  db
    .query(
      `INSERT INTO modifier_options (group_id, label, price_delta, is_default)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM modifier_groups WHERE id = $1 AND restaurant_id = $5)
       RETURNING *`,
      [groupId, label, priceDelta || 0, isDefault || false, restaurantId],
    )
    .then((r) => r.rows[0]);

const deleteOption = (id, restaurantId) =>
  db
    .query(
      `DELETE FROM modifier_options mo
       USING modifier_groups mg
       WHERE mo.id = $1 AND mo.group_id = mg.id AND mg.restaurant_id = $2
       RETURNING mo.*`,
      [id, restaurantId],
    )
    .then((r) => r.rows[0]);

// Overrides are tenant-scoped through the recipe's restaurant_id.
const getOverrides = (recipeId, restaurantId) =>
  db
    .query(
      `SELECT rmo.*, mo.label AS option_label, i.name AS ingredient_name
       FROM recipe_modifier_overrides rmo
       JOIN recipes r          ON r.id  = rmo.recipe_id AND r.restaurant_id = $2
       JOIN modifier_options mo ON mo.id = rmo.option_id
       JOIN ingredients i      ON i.id  = rmo.ingredient_id
       WHERE rmo.recipe_id = $1`,
      [recipeId, restaurantId],
    )
    .then((r) => r.rows);

// All three referenced rows (recipe, option, ingredient) must belong to the
// caller's restaurant — prevents wiring another tenant's option/ingredient into
// a recipe, or writing an override onto another tenant's recipe.
const upsertOverride = ({ recipeId, optionId, ingredientId, quantity, unit }, restaurantId) =>
  db
    .query(
      `INSERT INTO recipe_modifier_overrides (recipe_id, option_id, ingredient_id, quantity, unit)
       SELECT $1, $2, $3, $4, $5
       WHERE EXISTS (SELECT 1 FROM recipes WHERE id = $1 AND restaurant_id = $6)
         AND EXISTS (
           SELECT 1 FROM modifier_options mo
           JOIN modifier_groups mg ON mg.id = mo.group_id
           WHERE mo.id = $2 AND mg.restaurant_id = $6
         )
         AND EXISTS (SELECT 1 FROM ingredients WHERE id = $3 AND restaurant_id = $6)
       ON CONFLICT (recipe_id, option_id, ingredient_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit
       RETURNING *`,
      [recipeId, optionId, ingredientId, quantity, unit, restaurantId],
    )
    .then((r) => r.rows[0]);

const deleteOverride = (recipeId, optionId, ingredientId, restaurantId) =>
  db.query(
    `DELETE FROM recipe_modifier_overrides rmo
     USING recipes r
     WHERE rmo.recipe_id = $1 AND rmo.option_id = $2 AND rmo.ingredient_id = $3
       AND r.id = rmo.recipe_id AND r.restaurant_id = $4`,
    [recipeId, optionId, ingredientId, restaurantId],
  );

module.exports = {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  createOption,
  deleteOption,
  getOverrides,
  upsertOverride,
  deleteOverride,
};
