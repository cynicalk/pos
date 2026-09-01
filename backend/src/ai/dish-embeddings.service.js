// Indexes each dish as an embedding vector for content-based cold-start (see
// modules/recsys/coldstart.js). Uses the same local embedding model the review
// search uses; best-effort — if the model is offline, nothing is indexed and the
// recommender simply has no cold-start signal to add (honest abstention, not a
// crash). Run on demand (scripts/index-dish-embeddings.js) or after a menu change.

const embeddings = require('./embeddings.client');
const repo = require('../guest/guest.repository');

// The text that represents a dish for similarity: its name and description. Tags
// would help, but the guest menu doesn't carry them; name + description is what a
// guest reads and what makes two dishes "similar".
function sourceTextFor(dish) {
  return `${dish.name}. ${dish.description || ''}`.trim();
}

// Embed in batches, not one giant request: a big menu would otherwise blow the
// model's batch limit or the embed timeout and fail the whole index. A failed
// batch is skipped, so a hiccup costs a few dishes, not everything.
const BATCH = 48;

async function indexDishEmbeddings(restaurantId) {
  if (!(await embeddings.reachable())) return { indexed: 0, skipped: true };
  const dishes = await repo.getMenuItemsForEmbedding(restaurantId);
  if (dishes.length === 0) return { indexed: 0, skipped: false };

  let indexed = 0;
  for (let start = 0; start < dishes.length; start += BATCH) {
    const batch = dishes.slice(start, start + BATCH);
    const texts = batch.map(sourceTextFor);
    let vectors;
    try {
      vectors = await embeddings.embed(texts);
    } catch {
      continue; // this batch failed — move on, don't lose the rest
    }
    for (let i = 0; i < batch.length; i += 1) {
      const vec = vectors[i];
      if (!Array.isArray(vec)) continue;
      await repo.upsertDishEmbedding(batch[i].id, restaurantId, vec, texts[i]);
      indexed += 1;
    }
  }
  return { indexed, skipped: false };
}

module.exports = { indexDishEmbeddings, sourceTextFor };
