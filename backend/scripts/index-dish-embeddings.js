/*
 * Index dish embeddings for content-based cold-start.
 *
 * Embeds each available dish (name + description) with the local embedding model
 * and stores the vectors in dish_embeddings. Re-run after menu changes. No-ops
 * gracefully when the embedding model is offline.
 *
 * Usage: node scripts/index-dish-embeddings.js [restaurantId]
 */
require('dotenv').config();
const db = require('../src/shared/db');
const service = require('../src/ai/dish-embeddings.service');

async function main() {
  const restaurantId = process.argv[2] || (await db.query(
    `SELECT id FROM restaurants WHERE name = 'Demo Restaurant' LIMIT 1`,
  )).rows[0]?.id;
  if (!restaurantId) throw new Error('No restaurant id given and no "Demo Restaurant" found');

  const res = await service.indexDishEmbeddings(restaurantId);
  if (res.skipped) console.log('Embedding model offline — nothing indexed (cold-start will abstain).');
  else console.log(`Indexed ${res.indexed} dish embeddings.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
