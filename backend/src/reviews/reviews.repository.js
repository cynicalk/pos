const db = require('../shared/db');

// `from`/`to`/`rating` may be null (no filter); `timezone` is an IANA name used
// to bucket created_at into the operator's local day for date-range filtering.
const list = (restaurantId, { from, to, rating, timezone }) =>
  db.query(
    `SELECT
       r.id,
       r.overall_rating,
       r.food_rating,
       r.service_rating,
       r.comment,
       r.created_at,
       r.customer_phone,
       r.loyalty_customer_id,
       t.number AS table_number,
       lc.name  AS customer_name
     FROM reviews r
     LEFT JOIN tables            t  ON t.id  = r.table_id
     LEFT JOIN loyalty_customers lc ON lc.id = r.loyalty_customer_id
     WHERE r.restaurant_id = $1
       AND ($2::text IS NULL OR (r.created_at AT TIME ZONE $3)::date >= $2::date)
       AND ($4::text IS NULL OR (r.created_at AT TIME ZONE $3)::date <= $4::date)
       AND ($5::int  IS NULL OR r.overall_rating >= $5)
     ORDER BY r.created_at DESC`,
    [restaurantId, from, timezone, to, rating],
  ).then((r) => r.rows);

module.exports = { list };
