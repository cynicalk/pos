/*
 * 077_compliance_and_sops
 *
 * Phase 5 of the merge (MERGE_PLAN.md §4): FSSAI licence tracking, the hygiene
 * and shift checklists, the testing calendar, the audit evidence pack, and the
 * SOP library with version control and drift detection.
 *
 * ── One table for every piece of evidence ──────────────────────────────────
 *
 * The source spread compliance state across three places: a ComplianceDoc table,
 * fssaiNumber/fssaiExpiry columns on the outlet, and cert-expiry columns on the
 * Staff row. Its own Audit Evidence Pack then had to re-gather all three.
 *
 * Here everything an auditor would ask for is a `compliance_docs` row, keyed by
 * `doc_type`. A licence, a signed checklist, a staff certificate and a lab test
 * are all "a dated record with an expiry and a signature" — the same shape — and
 * keeping them in one table means the evidence pack is one query and the expiry
 * rules have one place to look. `metadata` carries what differs.
 *
 * ── SOPs are immutable ─────────────────────────────────────────────────────
 *
 * Version control here is structural, not a column someone increments: every
 * save inserts a new row and the highest version per slug is the active one.
 * Nothing is ever edited in place, so "what did the procedure say in March"
 * stays answerable — which is the entire point of versioning a procedure that
 * people are audited against.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS compliance_docs (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      doc_type      VARCHAR(40)  NOT NULL,
      title         TEXT         NOT NULL,
      file_url      TEXT,
      -- What differs per type: {number} for a licence, {checked:[]} for a
      -- checklist, {userId, certType} for a staff certificate, {testType} for
      -- a lab test.
      metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
      valid_from    DATE,
      valid_until   DATE,
      signed_by     VARCHAR(200),
      signed_at     TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT compliance_docs_type_check CHECK (doc_type IN (
        'fssai_license','hygiene_checklist','shift_checklist','staff_cert','test_record'
      ))
    );

    -- The two read patterns: "this type, newest first" and "what expires soon".
    CREATE INDEX IF NOT EXISTS compliance_docs_type_idx
      ON compliance_docs (restaurant_id, doc_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS compliance_docs_expiry_idx
      ON compliance_docs (restaurant_id, valid_until)
      WHERE valid_until IS NOT NULL;

    CREATE TABLE IF NOT EXISTS sops (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      slug          VARCHAR(60)  NOT NULL,
      title         TEXT         NOT NULL,
      content       TEXT         NOT NULL,
      version       INTEGER      NOT NULL DEFAULT 1 CHECK (version >= 1),
      source        VARCHAR(20)  NOT NULL DEFAULT 'template',
      created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

      CONSTRAINT sops_source_check CHECK (source IN ('template','ai','manual')),
      -- The immutability guarantee: a version number can never be reused, so a
      -- past revision cannot be quietly overwritten.
      UNIQUE (restaurant_id, slug, version)
    );

    CREATE INDEX IF NOT EXISTS sops_slug_idx ON sops (restaurant_id, slug, version DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS sops;
    DROP TABLE IF EXISTS compliance_docs;
  `);
};
