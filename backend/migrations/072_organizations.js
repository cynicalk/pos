/*
 * 072_organizations
 *
 * The tenancy layer above `restaurants`, ported from the ops back-office
 * (Organization / Outlet / OwnerOutlet) as Phase 0 of the merge — see
 * MERGE_PLAN.md §4. A restaurant row IS an outlet; this migration gives every
 * outlet a parent org so multi-outlet operators can roll numbers up without
 * changing what a single-outlet deployment sees today.
 *
 * Backfill is one org per existing restaurant, named after it. That keeps every
 * current deployment behaving identically — one org, one outlet — while making
 * the second outlet a data change rather than a schema change.
 *
 * `owner_outlets` is the per-user outlet grant. Deliberately NOT a new role:
 * the ops app distinguished owner (whole org) from manager (granted outlets
 * only), but POS already has four roles wired through admin.service, the role
 * dropdowns and the tests. Adding a fifth to express this would churn all of
 * that. The equivalent rule, with no new role:
 *
 *   admin with NO grant rows  → every outlet in the org  (the owner case)
 *   admin WITH grant rows     → only the granted outlets (the manager case)
 *   non-admin roles           → their own restaurant_id only, unchanged
 *
 * Nothing reads this table yet; the group rollup in Phase 7 is its first
 * consumer. It ships now so the boundary has one definition from the start
 * rather than being retrofitted across thirty call sites later.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS organizations (
      id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    ALTER TABLE restaurants
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
  `);

  // One org per existing restaurant. Done row-by-row because each restaurant
  // needs its OWN generated org id — a set-based INSERT ... SELECT can't hand
  // the new ids back to the matching restaurant rows.
  pgm.sql(`
    DO $$
    DECLARE
      r      RECORD;
      new_id UUID;
    BEGIN
      FOR r IN SELECT id, name FROM restaurants WHERE organization_id IS NULL LOOP
        INSERT INTO organizations (name) VALUES (r.name) RETURNING id INTO new_id;
        UPDATE restaurants SET organization_id = new_id WHERE id = r.id;
      END LOOP;
    END $$;
  `);

  // A restaurant created without an org gets its own — which is what signing up
  // actually means: a single-outlet operator IS their own organization. Doing it
  // in a trigger rather than at the five existing `INSERT INTO restaurants` call
  // sites (admin, auth, restaurants repositories, the seed, the test helper)
  // makes the NOT NULL below impossible to violate, instead of merely
  // conventional — and Phase 7 adds more insert sites.
  //
  // Adding a second outlet to an EXISTING org passes organization_id explicitly;
  // the trigger only fills a NULL, so it stays out of the way in that case.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION restaurants_ensure_organization()
    RETURNS TRIGGER AS $$
    DECLARE
      new_org UUID;
    BEGIN
      IF NEW.organization_id IS NULL THEN
        INSERT INTO organizations (name) VALUES (NEW.name) RETURNING id INTO new_org;
        NEW.organization_id := new_org;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER restaurants_ensure_organization_trg
      BEFORE INSERT ON restaurants
      FOR EACH ROW EXECUTE FUNCTION restaurants_ensure_organization();
  `);

  pgm.sql(`
    ALTER TABLE restaurants ALTER COLUMN organization_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS restaurants_organization_idx
      ON restaurants (organization_id);

    CREATE TABLE IF NOT EXISTS owner_outlets (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
      restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, restaurant_id)
    );

    CREATE INDEX IF NOT EXISTS owner_outlets_user_idx ON owner_outlets (user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS owner_outlets;
    DROP TRIGGER IF EXISTS restaurants_ensure_organization_trg ON restaurants;
    DROP FUNCTION IF EXISTS restaurants_ensure_organization();
    DROP INDEX IF EXISTS restaurants_organization_idx;
    ALTER TABLE restaurants DROP COLUMN IF EXISTS organization_id;
    DROP TABLE IF EXISTS organizations;
  `);
};
