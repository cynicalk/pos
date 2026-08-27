const db = require('../shared/db');

// Daily waste totals over a period, bucketed in the restaurant's timezone so the
// series lines up with the (also-local) weather days for correlation.
const getDailyWasteSeries = (restaurantId, from, to, tz = 'UTC') =>
  db.query(
    `SELECT (logged_at AT TIME ZONE $4)::date::text AS day,
            SUM(quantity)   AS quantity,
            SUM(total_cost) AS cost
     FROM waste_logs
     WHERE restaurant_id = $1
       AND (logged_at AT TIME ZONE $4)::date >= $2::date
       AND (logged_at AT TIME ZONE $4)::date <= $3::date
     GROUP BY 1
     ORDER BY 1`,
    [restaurantId, from, to, tz],
  ).then((r) => r.rows);

const getTopItems = (restaurantId, from, to, tz = 'UTC', limit = 8) =>
  db.query(
    `SELECT i.name AS ingredient, i.unit,
            SUM(wl.quantity)   AS quantity,
            SUM(wl.total_cost) AS cost,
            COUNT(*)::int      AS events
     FROM waste_logs wl
     JOIN ingredients i ON i.id = wl.ingredient_id
     WHERE wl.restaurant_id = $1
       AND (wl.logged_at AT TIME ZONE $4)::date >= $2::date
       AND (wl.logged_at AT TIME ZONE $4)::date <= $3::date
     GROUP BY i.id, i.name, i.unit
     ORDER BY cost DESC
     LIMIT $5`,
    [restaurantId, from, to, tz, limit],
  ).then((r) => r.rows);

const getReasonBreakdown = (restaurantId, from, to, tz = 'UTC') =>
  db.query(
    `SELECT reason, COUNT(*)::int AS events, SUM(total_cost) AS cost
     FROM waste_logs
     WHERE restaurant_id = $1
       AND (logged_at AT TIME ZONE $4)::date >= $2::date
       AND (logged_at AT TIME ZONE $4)::date <= $3::date
     GROUP BY reason
     ORDER BY cost DESC`,
    [restaurantId, from, to, tz],
  ).then((r) => r.rows);

const saveInsight = ({ restaurantId, periodStart, periodEnd, weatherData, correlationScores, analysis, recommendations, generatedBy }) =>
  db.query(
    `INSERT INTO waste_insights
       (restaurant_id, period_start, period_end, weather_data, correlation_scores, analysis, recommendations, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      restaurantId, periodStart, periodEnd,
      weatherData ? JSON.stringify(weatherData) : null,
      correlationScores ? JSON.stringify(correlationScores) : null,
      analysis || null,
      recommendations ? JSON.stringify(recommendations) : null,
      generatedBy || 'cron',
    ],
  ).then((r) => r.rows[0]);

const getLatestInsight = (restaurantId) =>
  db.query(
    'SELECT * FROM waste_insights WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 1',
    [restaurantId],
  ).then((r) => r.rows[0] || null);

module.exports = { getDailyWasteSeries, getTopItems, getReasonBreakdown, saveInsight, getLatestInsight };
