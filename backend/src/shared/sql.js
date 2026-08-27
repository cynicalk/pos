// Build a partial UPDATE SET clause from a { column: value } map.
// Entries whose value is `undefined` are skipped (the column keeps its current
// value); pass `null` explicitly to set a column NULL. `startIndex` is the first
// positional placeholder to use — set it past any params the WHERE clause
// already consumes (e.g. 3 when $1/$2 are the id/restaurant_id filters).
//
//   const { clause, values } = buildUpdateSet({ name, price }, 3);
//   if (!clause) return getById(id);          // nothing to update
//   db.query(`UPDATE t SET ${clause} WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
//            [id, restaurantId, ...values]);
function buildUpdateSet(columns, startIndex = 1) {
  const sets = [];
  const values = [];
  let i = startIndex;
  for (const [col, val] of Object.entries(columns)) {
    if (val === undefined) continue;
    sets.push(`${col} = $${i++}`);
    values.push(val);
  }
  return { clause: sets.join(", "), values };
}

module.exports = { buildUpdateSet };
