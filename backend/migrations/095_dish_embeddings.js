/**
 * Dish embeddings — the store behind content-based cold-start for the recommender.
 *
 * The learned acceptance prior needs interaction history: a brand-new dish that
 * has never been shown has no signal, and the exploration slot only trickles it
 * impressions slowly. Content-based cold-start fills that gap — a new dish
 * inherits a starting lift from the dishes it is *similar to* that already
 * convert, by embedding each dish's name + description + tags with the same local
 * model the review search uses, and taking the similarity-weighted lift of its
 * nearest neighbours.
 *
 * Same shape and rationale as `review_embeddings` (migration 091): a 768-dim
 * vector stored as JSONB (pgvector isn't installed here), one row per menu item,
 * re-embedding overwrites in place, ON DELETE CASCADE so a removed dish takes its
 * vector with it. `source_text` records what was embedded so a menu edit can
 * invalidate a stale vector.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE dish_embeddings (
      menu_item_id   UUID PRIMARY KEY REFERENCES menu_items(id) ON DELETE CASCADE,
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      embedding      JSONB NOT NULL,
      source_text    TEXT NOT NULL,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_dish_embeddings_restaurant ON dish_embeddings (restaurant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS dish_embeddings;');
};
