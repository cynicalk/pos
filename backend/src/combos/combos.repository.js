const db = require('../shared/db');

const WITH_ITEMS = `
  SELECT c.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id',          ci.id,
          'menu_item_id', ci.menu_item_id,
          'item_name',   mi.name,
          'item_price',  mi.price,
          'quantity',    ci.quantity,
          'sort_order',  ci.sort_order
        ) ORDER BY ci.sort_order
      ) FILTER (WHERE ci.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM combo_meals c
  LEFT JOIN combo_items ci ON ci.combo_id = c.id
  LEFT JOIN menu_items  mi ON mi.id = ci.menu_item_id
`;

const getAll = (restaurantId) =>
  db
    .query(`${WITH_ITEMS} WHERE c.restaurant_id = $1 GROUP BY c.id ORDER BY c.name`, [restaurantId])
    .then((r) => r.rows);

const getById = (id, restaurantId) =>
  db
    .query(`${WITH_ITEMS} WHERE c.id = $1 AND c.restaurant_id = $2 GROUP BY c.id`, [id, restaurantId])
    .then((r) => r.rows[0]);

const create = async ({ restaurantId, name, sku, price, validFrom, validUntil, items }) => {
  const comboId = await db.withTransaction(async (client) => {
    const {
      rows: [combo],
    } = await client.query(
      `INSERT INTO combo_meals (restaurant_id, name, sku, price, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [restaurantId, name, sku || null, price, validFrom || null, validUntil || null],
    );
    for (let i = 0; i < (items || []).length; i++) {
      const item = items[i];
      await client.query(
        `INSERT INTO combo_items (combo_id, menu_item_id, quantity, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [combo.id, item.menuItemId, item.quantity || 1, item.sortOrder ?? i],
      );
    }
    return combo.id;
  });
  return getById(comboId, restaurantId);
};

const update = async (id, { name, sku, price, isActive, validFrom, validUntil, items }, restaurantId) => {
  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE combo_meals SET
         name        = COALESCE($1, name),
         sku         = COALESCE($2, sku),
         price       = COALESCE($3, price),
         is_active   = COALESCE($4, is_active),
         valid_from  = COALESCE($5, valid_from),
         valid_until = COALESCE($6, valid_until)
       WHERE id = $7 AND restaurant_id = $8`,
      [name ?? null, sku ?? null, price ?? null, isActive ?? null, validFrom ?? null, validUntil ?? null, id, restaurantId],
    );
    if (items !== undefined) {
      await client.query('DELETE FROM combo_items WHERE combo_id = $1', [id]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await client.query(
          `INSERT INTO combo_items (combo_id, menu_item_id, quantity, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [id, item.menuItemId, item.quantity || 1, item.sortOrder ?? i],
        );
      }
    }
  });
  return getById(id, restaurantId);
};

module.exports = { getAll, getById, create, update };
