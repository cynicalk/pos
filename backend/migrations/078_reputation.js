/*
 * Phase 6 — reputation and visibility (MERGE_PLAN.md).
 *
 * Three things land here, and one deliberately does not.
 *
 * 1. reviews gains theme/sentiment. The source kept these on an ingested
 *    Review row scraped from Swiggy/Zomato; POS reviews are first-party —
 *    left by a guest at a table — so the columns attach to the table we
 *    already have rather than arriving with a parallel review store.
 *
 * 2. review_replies persists a drafted response. The source drafted a reply
 *    for the operator to paste under a public platform review. POS reviews
 *    are not public and there is nowhere to post: the only route back to
 *    this guest is reviews.customer_phone. So the draft is a message TO the
 *    guest, and `marked_sent_at` is the operator saying they sent it — not
 *    the system claiming it did. There is no guest messaging channel wired
 *    (see waitlist.notify's WhatsApp stub), and the schema says so by having
 *    no `sent_via` or delivery state to lie with.
 *
 * 3. search_ranks + competitor_ratings are manual-entry tables, exactly as
 *    they were in the source — the operator reads their position off the
 *    platform and types it in. That is why they carry recorded_by: these are
 *    observations by a person, not measurements by the system, and a figure
 *    nobody can attribute is a figure nobody can check.
 *
 * NOT here: a guests table. Repeat rate and winback derive from
 * loyalty_customers and orders, which already hold the phone, the visits and
 * the spend. A second guest store would immediately disagree with the first.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS theme         TEXT
        CHECK (theme IN ('food_quality','delivery_packaging','service',
                         'value_for_money','hygiene','other')),
      ADD COLUMN IF NOT EXISTS sentiment     TEXT
        CHECK (sentiment IN ('positive','neutral','negative')),
      ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
      -- Which classifier produced the theme. Kept because the two disagree:
      -- a keyword hit and a model read of the same sentence are not equally
      -- trustworthy, and an operator asking "why is this tagged hygiene?"
      -- deserves to know which one answered.
      ADD COLUMN IF NOT EXISTS classified_by TEXT
        CHECK (classified_by IN ('keyword','model'));

    CREATE INDEX IF NOT EXISTS reviews_theme_idx
      ON reviews (restaurant_id, theme)
      WHERE theme IS NOT NULL;

    -- Unclassified reviews are the work queue for the classifier; indexing
    -- the absence keeps that scan cheap as the table grows.
    CREATE INDEX IF NOT EXISTS reviews_unclassified_idx
      ON reviews (restaurant_id, created_at)
      WHERE theme IS NULL;

    CREATE TABLE IF NOT EXISTS review_replies (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      -- One live draft per review. Redrafting overwrites; the operator is
      -- composing one message, not accumulating versions of it.
      review_id      UUID NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
      draft          TEXT NOT NULL,
      source         TEXT NOT NULL CHECK (source IN ('model','template','operator')),
      created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- Operator-asserted, never system-asserted. Null means "not sent as far
      -- as we know", which is also true of every draft the system created.
      marked_sent_at TIMESTAMPTZ,
      marked_sent_by UUID REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS review_replies_restaurant_idx
      ON review_replies (restaurant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS search_ranks (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      platform      TEXT NOT NULL,
      -- Normalised to lowercase/trimmed by the service so "Biryani" and
      -- "biryani " are one tracked query rather than two flat lines.
      query         TEXT NOT NULL,
      position      INTEGER NOT NULL CHECK (position >= 1),
      -- Nullable: platforms rarely show a result count, and inventing one to
      -- fill the column would make "position 4" look better or worse than it is.
      total_results INTEGER CHECK (total_results IS NULL OR total_results >= 1),
      recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS search_ranks_query_idx
      ON search_ranks (restaurant_id, platform, query, recorded_at);

    CREATE TABLE IF NOT EXISTS competitor_ratings (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      competitor_name TEXT NOT NULL,
      platform        TEXT NOT NULL,
      rating          NUMERIC(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
      recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS competitor_ratings_idx
      ON competitor_ratings (restaurant_id, platform, competitor_name, recorded_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS competitor_ratings;
    DROP TABLE IF EXISTS search_ranks;
    DROP TABLE IF EXISTS review_replies;
    DROP INDEX IF EXISTS reviews_unclassified_idx;
    DROP INDEX IF EXISTS reviews_theme_idx;
    ALTER TABLE reviews
      DROP COLUMN IF EXISTS classified_by,
      DROP COLUMN IF EXISTS classified_at,
      DROP COLUMN IF EXISTS sentiment,
      DROP COLUMN IF EXISTS theme;
  `);
};
