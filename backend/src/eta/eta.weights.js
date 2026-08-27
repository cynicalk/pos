/*
 * eta.weights — shared seed (cold-start) durations for the ETA engine.
 *
 * Each menu_items.category is mapped, by keyword, to a "phase duration" in
 * minutes: roughly how long that course contributes to a table's total dining
 * time. These are only the COLD-START values — once real table_sessions
 * accumulate, the engine blends each category toward its learned average:
 *
 *     weight_c = (n_c * learned_avg_c + K * seed_c) / (n_c + K)
 *
 * Both the session aggregator (which attributes a finished session's duration
 * across its categories proportional to these seeds) and the live estimator use
 * this single source of truth, so they can never drift apart.
 */

// Keyword -> minutes. First matching keyword (substring, case-insensitive) wins,
// so order from most-specific to least where it matters.
const SEED_RULES = [
  { minutes: 15, keywords: ['starter', 'appetizer', 'appetiser', 'soup', 'salad', 'side', 'snack', 'small plate'] },
  { minutes: 20, keywords: ['dessert', 'sweet', 'ice cream', 'icecream', 'pudding'] },
  { minutes: 10, keywords: ['drink', 'beverage', 'juice', 'coffee', 'tea', 'shake', 'smoothie', 'mocktail', 'cocktail', 'beer', 'wine', 'soda', 'water'] },
  { minutes: 40, keywords: ['combo', 'platter', 'feast', 'meal'] },
  { minutes: 35, keywords: ['main', 'entree', 'entrée', 'curry', 'rice', 'biryani', 'noodle', 'pasta', 'pizza', 'burger', 'grill', 'tandoor', 'thali', 'steak', 'sizzler'] },
];

// Fallback when no keyword matches — a middle-of-the-road course duration.
const DEFAULT_SEED_MINUTES = 25;

// Blend strength: how many real samples it takes for a category's learned
// average to outweigh its seed. Lower = trust data sooner.
const BLEND_K = 8;

// Restaurant-wide fallback session length (minutes) before any history exists.
const DEFAULT_AVG_TABLE_MINUTES = 45;

function seedForCategory(category) {
  if (!category) return DEFAULT_SEED_MINUTES;
  const c = String(category).toLowerCase();
  for (const rule of SEED_RULES) {
    if (rule.keywords.some((k) => c.includes(k))) return rule.minutes;
  }
  return DEFAULT_SEED_MINUTES;
}

// Blended per-category weight from a learned aggregate { n, sum } and the seed.
function blendedWeight(category, stat) {
  const seed = seedForCategory(category);
  const n = stat?.n || 0;
  if (n <= 0) return seed;
  const learnedAvg = stat.sum / n;
  return (n * learnedAvg + BLEND_K * seed) / (n + BLEND_K);
}

module.exports = {
  SEED_RULES,
  DEFAULT_SEED_MINUTES,
  DEFAULT_AVG_TABLE_MINUTES,
  BLEND_K,
  seedForCategory,
  blendedWeight,
};
