const db = require('../shared/db');

// Compliance evidence and SOPs. Every query is tenant-scoped on restaurant_id.

// ── Documents ──────────────────────────────────────────────────────────────

const listDocs = (restaurantId, docType, limit = 100) =>
  db.query(`
    SELECT * FROM compliance_docs
    WHERE restaurant_id = $1
      AND ($2::text IS NULL OR doc_type = $2)
    ORDER BY created_at DESC
    LIMIT $3
  `, [restaurantId, docType || null, limit]).then((r) => r.rows);

const createDoc = (restaurantId, d) =>
  db.query(`
    INSERT INTO compliance_docs
      (restaurant_id, doc_type, title, file_url, metadata, valid_from, valid_until, signed_by, signed_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::date, $7::date, $8, $9)
    RETURNING *
  `, [
    restaurantId, d.docType, d.title, d.fileUrl || null,
    JSON.stringify(d.metadata || {}),
    d.validFrom || null, d.validUntil || null,
    d.signedBy || null, d.signedAt || null,
  ]).then((r) => r.rows[0]);

const deleteDoc = (id, restaurantId) =>
  db.query(
    `DELETE FROM compliance_docs WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
    [id, restaurantId],
  ).then((r) => r.rows[0]);

/** The newest document of a type — the current licence, the latest test. */
const getLatestDoc = (restaurantId, docType) =>
  db.query(`
    SELECT * FROM compliance_docs
    WHERE restaurant_id = $1 AND doc_type = $2
    ORDER BY created_at DESC LIMIT 1
  `, [restaurantId, docType]).then((r) => r.rows[0]);

/** Docs signed on the current local day, for "has today been done". */
const getDocsSince = (restaurantId, docType, since) =>
  db.query(`
    SELECT * FROM compliance_docs
    WHERE restaurant_id = $1 AND doc_type = $2 AND created_at >= $3
    ORDER BY created_at DESC
  `, [restaurantId, docType, since]).then((r) => r.rows);

/**
 * Everything with an expiry date, newest per subject.
 *
 * DISTINCT ON keeps only the most recent record per subject key, so a renewed
 * certificate supersedes the lapsed one it replaced instead of both firing.
 */
const getExpiringDocs = (restaurantId) =>
  db.query(`
    SELECT DISTINCT ON (doc_type, COALESCE(metadata->>'subject', metadata->>'userId', id::text))
           id, doc_type, title, valid_until, metadata, created_at
    FROM compliance_docs
    WHERE restaurant_id = $1 AND valid_until IS NOT NULL
    ORDER BY doc_type,
             COALESCE(metadata->>'subject', metadata->>'userId', id::text),
             created_at DESC
  `, [restaurantId]).then((r) => r.rows);

/** Stalled-table alerts in the last week — a drift input. */
const countRecentStalledAlerts = (restaurantId) =>
  db.query(`
    SELECT COUNT(*)::int AS n FROM actions
    WHERE restaurant_id = $1
      AND dedupe_key LIKE 'stalled_table:%'
      AND created_at >= now() - INTERVAL '7 days'
  `, [restaurantId]).then((r) => Number(r.rows[0]?.n || 0));

// ── SOPs ───────────────────────────────────────────────────────────────────

const listSops = (restaurantId) =>
  db.query(
    `SELECT id, slug, title, content, version, source, created_at
     FROM sops WHERE restaurant_id = $1 ORDER BY slug, version DESC`,
    [restaurantId],
  ).then((r) => r.rows);

const getSopVersions = (restaurantId, slug) =>
  db.query(
    `SELECT id, slug, title, content, version, source, created_at
     FROM sops WHERE restaurant_id = $1 AND slug = $2 ORDER BY version DESC`,
    [restaurantId, slug],
  ).then((r) => r.rows);

/**
 * Save a new immutable revision.
 *
 * The version is chosen inside the INSERT from the current maximum, so two
 * concurrent saves cannot both claim the same number — the unique constraint
 * would reject the loser rather than one silently overwriting the other.
 */
const insertSopVersion = (restaurantId, { slug, title, content, source, createdBy }) =>
  db.query(`
    -- Both uses of $2 are cast to text. Postgres deduces ONE type per parameter
    -- across a statement, so an uncast slug column insert types it varchar and
    -- then conflicts with the comparison in the subquery below:
    -- "inconsistent types deduced for parameter $2". Same trap as
    -- tables.repository.updateStatus and actions.repository.updateStatus.
    INSERT INTO sops (restaurant_id, slug, title, content, version, source, created_by)
    SELECT $1, $2::text, $3, $4,
           COALESCE((SELECT MAX(version) FROM sops
                      WHERE restaurant_id = $1 AND slug = $2::text), 0) + 1,
           $5, $6
    RETURNING *
  `, [restaurantId, slug, title, content, source, createdBy || null]).then((r) => r.rows[0]);

const getRestaurantContext = (restaurantId) =>
  db.query(`
    SELECT r.name,
           (SELECT COUNT(*)::int FROM menu_items m
             WHERE m.restaurant_id = r.id AND m.archived_at IS NULL) AS menu_items,
           (SELECT COUNT(DISTINCT m.category) FROM menu_items m
             WHERE m.restaurant_id = r.id AND m.archived_at IS NULL) AS categories,
           (SELECT COUNT(*)::int FROM users u
             WHERE u.restaurant_id = r.id AND u.is_active IS NOT false) AS staff_count
    FROM restaurants r WHERE r.id = $1
  `, [restaurantId]).then((r) => r.rows[0]);

module.exports = {
  listDocs, createDoc, deleteDoc, getLatestDoc, getDocsSince, getExpiringDocs,
  countRecentStalledAlerts,
  listSops, getSopVersions, insertSopVersion, getRestaurantContext,
};
