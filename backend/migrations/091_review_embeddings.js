/**
 * Review embeddings — the store behind semantic review search.
 *
 * The local model already serves an embedding model (nomic-embed) that nothing
 * used. This indexes each review's comment as a 768-dim vector so the operator
 * can search reviews by MEANING ("complaints about waiting", "praise for the
 * biryani") rather than by keyword, and so themes can eventually cluster beyond
 * the keyword classifier.
 *
 * pgvector is not installed on this deployment, so the vector is stored as JSONB
 * (a plain array of floats) and cosine similarity is computed in the service over
 * a restaurant's own reviews — a few hundred to a few thousand rows, well within
 * what an in-memory rank handles. `model` is stored so a model change can be
 * detected and the affected rows re-embedded rather than compared across models.
 *
 * One row per review (review_id PK): re-embedding a review overwrites in place.
 * ON DELETE CASCADE so a deleted review takes its vector with it.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE review_embeddings (
      review_id      UUID PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      embedding      JSONB NOT NULL,
      model          TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_review_embeddings_restaurant ON review_embeddings (restaurant_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS review_embeddings;');
};
