// Semantic search maths — pure, so the ranking is testable without a model or a
// database. The embedding model does the understanding; this only compares the
// vectors it produced.

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1]. Returns 0 for a
 * zero vector or a length mismatch rather than NaN — an unrankable pair simply
 * sorts to the bottom instead of poisoning the sort.
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Rank rows by similarity of their `.embedding` to `queryVec`, best first.
 * @param {number[]} queryVec
 * @param {Array<{embedding:number[]}>} rows
 * @param {{limit?:number, minScore?:number}} [opts]
 * @returns {Array} rows (without the embedding) each given a `score` in [0,1],
 *          filtered to >= minScore, capped at limit.
 */
function rankBySimilarity(queryVec, rows = [], { limit = 10, minScore = 0 } = {}) {
  if (!Array.isArray(queryVec) || !queryVec.length) return [];
  return rows
    .map((row) => {
      const { embedding, ...rest } = row;
      // Round so the score reads cleanly and equal scores tie deterministically.
      const score = Math.round(cosineSimilarity(queryVec, embedding) * 1000) / 1000;
      return { ...rest, score };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = { cosineSimilarity, rankBySimilarity };
