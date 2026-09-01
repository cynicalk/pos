/**
 * Content-based cold-start — a starting lift for a dish the learned prior can't
 * yet judge, inferred from the dishes it resembles that already convert.
 *
 * Pure: given each dish's embedding vector and the learned lifts of the dishes
 * that HAVE enough interaction history, a dish without its own lift borrows one
 * from its k nearest neighbours (by cosine similarity), similarity-weighted. The
 * result is dampened — a content guess is weaker evidence than observed behaviour,
 * so it should nudge, not rule — and it abstains rather than fabricate:
 *
 *   - a dish that already has a learned lift keeps it (nothing to cold-start);
 *   - a dish with no neighbour above the similarity floor gets nothing;
 *   - with no learned lifts at all to borrow from, every dish gets nothing.
 *
 * Inputs:
 *   vectors : [{ menuItemId, embedding:number[] }]
 *   learned : Map menuItemId → lift in [-1, 1]  (the observed prior)
 * Output: Map menuItemId → { lift, inferred:true } for dishes cold-started.
 */
const { cosineSimilarity } = require('../reputation/semantic');

const K = 3;                 // neighbours to borrow from
const MIN_SIMILARITY = 0.55; // below this, "similar" isn't similar enough to trust
const DAMPEN = 0.5;          // a content guess counts half an observed lift

function inferColdStartLifts(vectors = [], learned = new Map(), opts = {}) {
  const k = opts.k ?? K;
  const minSim = opts.minSimilarity ?? MIN_SIMILARITY;
  const dampen = opts.dampen ?? DAMPEN;

  const out = new Map();
  const known = vectors.filter((v) => learned.has(v.menuItemId) && Array.isArray(v.embedding));
  if (known.length === 0) return out; // nothing observed to borrow from

  for (const v of vectors) {
    if (learned.has(v.menuItemId) || !Array.isArray(v.embedding)) continue; // has its own signal
    const neighbours = known
      .map((u) => ({ id: u.menuItemId, sim: cosineSimilarity(v.embedding, u.embedding) }))
      .filter((u) => u.sim >= minSim)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k);
    if (neighbours.length === 0) continue; // nothing similar enough → abstain

    const wsum = neighbours.reduce((s, nb) => s + nb.sim, 0);
    const lift = neighbours.reduce((s, nb) => s + nb.sim * learned.get(nb.id), 0) / wsum;
    const damped = Math.max(-1, Math.min(1, Math.round(lift * dampen * 1000) / 1000));
    if (damped !== 0) out.set(v.menuItemId, { lift: damped, inferred: true });
  }
  return out;
}

module.exports = { inferColdStartLifts, K, MIN_SIMILARITY, DAMPEN };
