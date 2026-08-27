const db = require('../shared/db');

const WITH_INGREDIENTS = `
  SELECT r.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id',              ri.id,
          'ingredient_id',   ri.ingredient_id,
          'ingredient_name', i.name,
          'quantity',        ri.quantity,
          'unit',            ri.unit,
          'cost_per_unit',   ri.cost_per_unit
        ) ORDER BY i.name
      ) FILTER (WHERE ri.id IS NOT NULL),
      '[]'::json
    ) AS ingredients
  FROM recipes r
  LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
  LEFT JOIN ingredients i ON i.id = ri.ingredient_id
`;

const getAll = (restaurantId) =>
  db
    .query(`${WITH_INGREDIENTS} WHERE r.restaurant_id = $1 GROUP BY r.id ORDER BY r.name`, [restaurantId])
    .then((r) => r.rows);

const getById = (id, restaurantId) =>
  db
    .query(`${WITH_INGREDIENTS} WHERE r.id = $1 AND r.restaurant_id = $2 GROUP BY r.id`, [id, restaurantId])
    .then((r) => r.rows[0]);

const create = ({ restaurantId, name, yieldQuantity, yieldUnit, prepTimeSec, notes, ingredients }) =>
  db.withTransaction(async (client) => {
    const {
      rows: [recipe],
    } = await client.query(
      `INSERT INTO recipes (restaurant_id, name, yield_quantity, yield_unit, prep_time_sec, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [restaurantId, name, yieldQuantity || 1, yieldUnit || 'piece', prepTimeSec || null, notes || null],
    );
    for (const ing of ingredients || []) {
      await client.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, cost_per_unit)
         VALUES ($1, $2, $3, $4, $5)`,
        [recipe.id, ing.ingredientId, ing.quantity, ing.unit, ing.costPerUnit || 0],
      );
    }
    return recipe;
  });

const update = async (id, { name, yieldQuantity, yieldUnit, prepTimeSec, notes, ingredients }, restaurantId) => {
  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE recipes SET
         name           = COALESCE($1, name),
         yield_quantity = COALESCE($2, yield_quantity),
         yield_unit     = COALESCE($3, yield_unit),
         prep_time_sec  = COALESCE($4, prep_time_sec),
         notes          = COALESCE($5, notes),
         updated_at     = NOW()
       WHERE id = $6 AND restaurant_id = $7`,
      [name ?? null, yieldQuantity ?? null, yieldUnit ?? null, prepTimeSec ?? null, notes ?? null, id, restaurantId],
    );
    if (ingredients !== undefined) {
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);
      for (const ing of ingredients) {
        await client.query(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, cost_per_unit)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, ing.ingredientId, ing.quantity, ing.unit, ing.costPerUnit || 0],
        );
      }
    }
  });
  return getById(id, restaurantId);
};

const remove = (id, restaurantId) =>
  db
    .query('DELETE FROM recipes WHERE id = $1 AND restaurant_id = $2 RETURNING *', [id, restaurantId])
    .then((r) => r.rows[0]);

const saveCostSnapshot = ({ recipeId, restaurantId, totalCost, sellingPrice, triggeredBy }) => {
  const grossMargin = parseFloat((sellingPrice - totalCost).toFixed(4));
  const marginPct =
    sellingPrice > 0 ? parseFloat(((grossMargin / sellingPrice) * 100).toFixed(2)) : 0;
  return db
    .query(
      `INSERT INTO cost_snapshots (recipe_id, restaurant_id, total_cost, selling_price, gross_margin, margin_pct, triggered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [recipeId, restaurantId, totalCost, sellingPrice, grossMargin, marginPct, triggeredBy || 'MANUAL'],
    )
    .then((r) => r.rows[0]);
};

const getSnapshots = (recipeId, restaurantId, limit = 20) =>
  db
    .query(
      `SELECT * FROM cost_snapshots WHERE recipe_id = $1 AND restaurant_id = $2
       ORDER BY snapped_at DESC LIMIT $3`,
      [recipeId, restaurantId, limit],
    )
    .then((r) => r.rows);

module.exports = { getAll, getById, create, update, remove, saveCostSnapshot, getSnapshots };
