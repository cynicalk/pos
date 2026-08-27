/**
 * Review theme classification (MERGE_PLAN.md Phase 6).
 *
 * Ported from Opencode's reviews/summarizer, minus its database half. The
 * classifier is pure so the thing that decides "this is a hygiene complaint"
 * can be tested against real sentences without a database or a model.
 *
 * Two changes from the source:
 *
 *  - Sentiment is derived from the rating, never from the text. The source did
 *    this too and was right to: the guest already told us how they felt on a
 *    1-5 scale, and a classifier that can disagree with them is a classifier
 *    that can call a 1-star review positive.
 *
 *  - The source returned the first keyword match and stopped. That silently
 *    resolved "the food was cold and the waiter was rude" to whichever theme
 *    sits higher in the list. Here every match is collected and the winner is
 *    the one with the most distinct hits, so a review that is mostly about
 *    service lands on service. Ties still fall to list order, which is ordered
 *    by severity — hygiene outranks food quality outranks the rest — because
 *    when a review is equally about both, the one that can close a restaurant
 *    is the one worth surfacing.
 */

const REVIEW_THEMES = [
  'food_quality',
  'delivery_packaging',
  'service',
  'value_for_money',
  'hygiene',
  'other',
];

const THEME_LABELS = {
  food_quality:       'Food quality',
  delivery_packaging: 'Packaging & handover',
  service:            'Service',
  value_for_money:    'Value for money',
  hygiene:            'Hygiene',
  other:              'Other',
};

/**
 * What to do about each theme. These are the operator's next physical action,
 * not restated symptoms — "hygiene complaints are up" is something they can
 * already see on the row above.
 */
const SUGGESTED_ACTIONS = {
  hygiene:
    'Walk the kitchen now and check the specific complaint. Hygiene ratings recover '
    + 'slowest, and a repeat of the same complaint is the one an inspector hears about.',
  food_quality:
    'Taste-test the dishes named in these reviews on today\'s service, and check whether '
    + 'the recipe as cooked still matches the recipe as costed.',
  delivery_packaging:
    'Check handover: how long finished food sits before it leaves the pass, and whether '
    + 'the containers hold up for the dishes being complained about.',
  service:
    'Brief the floor on what was said. Where the guest left a phone number, reply to '
    + 'them directly — an answered complaint is worth more than a fixed one they never hear about.',
  value_for_money:
    'Compare the portion actually served against what the price implies for the flagged '
    + 'items. This is usually a portion-drift problem, not a pricing one.',
  other:
    'Read these individually — they did not group into a pattern, so there is no single fix.',
};

// Ordered by how much damage the theme does when it repeats. Order decides ties
// only; a review that mentions a theme more often still wins on count.
const THEME_KEYWORDS = [
  ['hygiene',            /\b(hygien|hair|dirty|unclean|insect|cockroach|fly|flies|stale|smell|rotten|mould|mold|filthy)\w*/gi],
  ['delivery_packaging', /\b(deliver|late|delay|cold food|arrived|packag|spill|leak|box|seal|container|soggy by)\w*/gi],
  ['service',            /\b(service|staff|waiter|server|rude|behaviou?r|attitude|ignored|response|refund|wait(ed|ing)?)\w*/gi],
  ['value_for_money',    /\b(price|pricing|expensive|costly|portion|quantity|value|overpriced|worth|small serving)\w*/gi],
  ['food_quality',       /\b(taste|tasty|bland|oily|salty|spic|flavou?r|fresh|delicious|undercooked|overcooked|raw|soggy|crisp)\w*/gi],
];

/**
 * Classify by keyword. Returns 'other' for empty text — a rating with no words
 * is not evidence of a theme, and guessing one from the number would invent a
 * complaint the guest never made.
 */
function classifyByKeywords(text) {
  if (!text || !String(text).trim()) return 'other';
  const body = String(text);

  let best = null;
  let bestScore = 0;
  for (const [theme, pattern] of THEME_KEYWORDS) {
    // Distinct matched words, not raw hits: "price price price" is one
    // complaint said loudly, not three complaints.
    const matches = body.match(pattern);
    const score = matches ? new Set(matches.map((m) => m.toLowerCase())).size : 0;
    if (score > bestScore) {
      bestScore = score;
      best = theme;
    }
  }
  return best || 'other';
}

/**
 * Sentiment from the rating the guest gave. Not inferred from their words.
 *
 * The null/'' guard is load-bearing and cannot be folded into Number.isFinite:
 * Number(null) and Number('') are both 0, which is finite and below every
 * threshold, so an absent rating would come back 'negative' — a complaint
 * invented out of a missing field. Caught by test, not in production, because
 * reviews.overall_rating is NOT NULL; this function is exported and reachable
 * from callers that have no such guarantee.
 */
function sentimentFromRating(rating) {
  if (rating === null || rating === undefined || rating === '') return null;
  const n = Number(rating);
  if (!Number.isFinite(n)) return null;
  if (n >= 4) return 'positive';
  if (n >= 3) return 'neutral';
  return 'negative';
}

/** Accept a model's answer only if it is one of ours; anything else is 'other'. */
const normaliseTheme = (theme) =>
  REVIEW_THEMES.includes(theme) ? theme : 'other';

module.exports = {
  REVIEW_THEMES,
  THEME_LABELS,
  SUGGESTED_ACTIONS,
  THEME_KEYWORDS,
  classifyByKeywords,
  sentimentFromRating,
  normaliseTheme,
};
