/**
 * Recommendation engine — CANONICAL SHARED CORE.
 *
 * This file is the single source of truth for the dine-in recommender and is
 * kept byte-identical in two places:
 *   - ops back-office:  src/modules/recommend/recommend-core.ts  (this file)
 *   - guest dine-in app: lib/recommend-core.ts
 * A drift guard (scripts/check-recommend-core.mjs) fails CI if they diverge, so
 * the engine can never silently fork between the two apps again.
 *
 * It is deliberately dependency-free: no framework imports, no bundled menu,
 * no app-specific types. The menu is injected via `createRecommender(dishes)`,
 * and every type the engine needs is defined locally below. Each app wraps this
 * core with a thin adapter that supplies its own dishes and re-exports the
 * pieces its pages already import.
 *
 * Four-stage pipeline (see the guest app's docs/model-decisions.md):
 *   [1 SAFETY FILTER] -> [2 TABLE-AWARE SCORING] -> [3 CO-ORDER BOOST] -> [4 MEAL COMPOSER]
 * Stage 1 is rules and stays rules (allergens fail closed, strict diets hard).
 * Stage 2 is a linear model over named features. Stage 3 adds item–item
 * co-order affinity (mined rules beat seeded ones). Stage 4 composes the basket
 * under category / diet-mix / budget / spice constraints and emits one faithful
 * reason per pick.
 */

/* ================================================================== */
/* Types — the canonical shapes the engine operates on.               */
/* ================================================================== */

export type GroupType = 'date' | 'family' | 'friends' | 'business' | 'solo';

export type Allergen = 'nuts' | 'dairy' | 'gluten' | 'shellfish' | 'egg' | 'soy';

export type DietPreference = 'vegetarian' | 'vegan' | 'jain' | 'non-vegetarian' | 'no-preference';

export type TastePreference = 'spicy' | 'mild' | 'light' | 'indulgent' | 'adventurous' | 'classic';

export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'starters' | 'mains' | 'breads-rice' | 'desserts' | 'drinks';
  tags: string[]; // veg, vegan, jain, premium, sharing, kids, light, spicy, popular
  allergens: Allergen[];
  emoji: string;
  tone: 'ember' | 'saffron' | 'sage' | 'plum' | 'sand';
  /** Operator promote flag — the recommender gives these a positive boost so a
   *  high-margin dish the kitchen wants pushed surfaces more often. Never a veto:
   *  it nudges ranking, it doesn't override diet/allergy vetoes. */
  featured?: boolean;
  /** Learned acceptance lift in [-1, 1] from the recommender's own logs (computed
   *  server-side). Positive means guests accept this dish more than average when
   *  it's shown; 0 when there isn't enough data yet, so the model is unchanged. */
  recoLift?: number;
}

export interface Member {
  id: string;
  name: string;
  isLeader: boolean;
  diet?: DietPreference;
  tastes?: TastePreference[];
  allergies?: Allergen[];
  /** Free-text allergy the preset chips don't cover */
  otherAllergy?: string;
  phone?: string;
  prefsComplete?: boolean;
  /** Set when the guest joined the shared cart from their own phone */
  joinedVia?: 'device';
}

export type PreferenceMode = 'per-person' | 'leader-proxy' | 'skipped';

export interface GroupPrefs {
  diet?: DietPreference;
  /** Multi-select diets with a headcount per diet */
  diets?: Partial<Record<DietPreference, number>>;
  tastes?: TastePreference[];
}

export interface CartItem {
  dishId: string;
  qty: number;
  addedBy?: string;
  source?: string;
}

export interface Recommendation {
  dish: Dish;
  reason: string;
}

export interface EngineInput {
  groupType: GroupType | null;
  partySize: number | null;
  prefMode: PreferenceMode | null;
  members: Member[];
  groupPrefs: GroupPrefs;
  refineTags: string[];
  /** Current cart, when refining after adds — powers co-order boosts. */
  cart?: CartItem[];
  /** A/B arm. 'control' gets the plain hand-tuned model — no featured boost, no
   *  learned prior — so its acceptance is the baseline the treatment is measured
   *  against. Defaults to treatment. */
  variant?: 'control' | 'treatment';
  /** When true, one exploration slot replaces the weakest pick with an eligible
   *  dish the ranking wouldn't have surfaced, so the long tail gets exposure. */
  explore?: boolean;
}

/* ------------------------------------------------------------------ */
/* Model weights — one coefficient per named feature.                  */
/* Hand-tuned today; the learning phase swaps these for coefficients   */
/* fit on logged cart outcomes.                                        */
/* ------------------------------------------------------------------ */

export const FEATURE_WEIGHTS: Record<string, number> = {
  popularity: 3,
  dietFit: 4,
  dietConflictSoft: -6,
  tasteMatch: 3,
  tasteClash: -3,
  occasionFit: 5,
  occasionClash: -2,
  contentSimilarity: 4,
  refineMatch: 6,
  refineClash: -4,
  coOrderAffinity: 3,
  budgetFit: 6,
  budgetMiss: -4,
  // Operator's promote lever. Sized to lift a dish within its diet/taste band
  // without steamrolling a genuinely bad fit — a nudge, not a pin to the top.
  featured: 4,
  // What the recommender learned from its own logs: dishes accepted more than
  // average when shown earn a small boost. Deliberately lighter than the hand-
  // tuned signals until there's real volume behind it — it refines, not rules.
  learnedAcceptance: 2,
};

/** Channel trust for aggregation: leader guessing for N is noisy. */
const CHANNEL_WEIGHT = { self: 1.0, device: 1.0, leaderProxy: 0.5 };

const BUDGET_THRESHOLD = 450;

/* ------------------------------------------------------------------ */
/* Free-text allergy parsing (fail closed)                             */
/* ------------------------------------------------------------------ */

const ALLERGEN_LEXICON: Record<Allergen, string[]> = {
  nuts: ['nut', 'peanut', 'almond', 'cashew', 'pista', 'walnut', 'hazelnut'],
  dairy: [
    'dairy',
    'milk',
    'lactose',
    'cheese',
    'paneer',
    'butter',
    'cream',
    'ghee',
    'curd',
    'yogurt',
    'yoghurt',
  ],
  gluten: ['gluten', 'wheat', 'maida', 'atta', 'bread'],
  shellfish: ['shellfish', 'prawn', 'shrimp', 'crab', 'lobster', 'squid'],
  egg: ['egg'],
  soy: ['soy', 'soya', 'tofu'],
};

interface ParsedAllergies {
  known: Allergen[];
  /** Tokens we could not map — excluded by text match against dish content. */
  unresolved: string[];
}

function parseFreeTextAllergy(text: string): ParsedAllergies {
  const known = new Set<Allergen>();
  const unresolved: string[] = [];
  const tokens = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 2);
  for (const token of tokens) {
    const hit = (Object.keys(ALLERGEN_LEXICON) as Allergen[]).find((a) =>
      ALLERGEN_LEXICON[a].some((kw) => token.includes(kw) || kw.includes(token)),
    );
    if (hit) known.add(hit);
    else unresolved.push(token);
  }
  return { known: [...known], unresolved };
}

export function collectAllergens(members: Member[]): Allergen[] {
  const declared = members.flatMap((m) => m.allergies ?? []);
  const parsed = members
    .filter((m) => m.otherAllergy)
    .flatMap((m) => parseFreeTextAllergy(m.otherAllergy!).known);
  return [...new Set([...declared, ...parsed])];
}

function collectUnresolvedAllergyTokens(members: Member[]): string[] {
  return members
    .filter((m) => m.otherAllergy)
    .flatMap((m) => parseFreeTextAllergy(m.otherAllergy!).unresolved);
}

/* ------------------------------------------------------------------ */
/* Stage 2a — group aggregation: one table profile from many members   */
/* ------------------------------------------------------------------ */

interface TableProfile {
  /** Vetoes aggregate by least misery: any member's diet applies. */
  diets: DietPreference[];
  /** Whole table shares a (veg-side) diet -> conflicts become hard. */
  strictTable: boolean;
  /** Taste -> aggregated channel-weighted vote strength. */
  tasteVotes: Map<TastePreference, number>;
  /** Target share of veg dishes in the basket, from diet headcounts. */
  vegShare: number;
  /** Text of all taste/diet signals, for content similarity. */
  preferenceText: string;
}

function buildTableProfile(input: EngineInput): TableProfile {
  const tasteVotes = new Map<TastePreference, number>();
  const vote = (t: TastePreference, w: number) => tasteVotes.set(t, (tasteVotes.get(t) ?? 0) + w);

  let diets: DietPreference[] = [];
  let strictTable = false;
  let vegHeads = 0;
  let totalHeads = Math.max(input.partySize ?? input.members.length, 1);

  if (input.prefMode === 'per-person') {
    diets = input.members
      .map((m) => m.diet)
      .filter((d): d is DietPreference => !!d && d !== 'no-preference' && d !== 'non-vegetarian');
    strictTable =
      input.members.length > 0 &&
      input.members.every(
        (m) => m.diet && m.diet !== 'non-vegetarian' && m.diet !== 'no-preference',
      );
    vegHeads = input.members.filter(
      (m) => m.diet && m.diet !== 'non-vegetarian' && m.diet !== 'no-preference',
    ).length;
    totalHeads = Math.max(input.members.length, 1);
    for (const m of input.members) {
      const w = m.joinedVia === 'device' ? CHANNEL_WEIGHT.device : CHANNEL_WEIGHT.self;
      for (const t of m.tastes ?? []) vote(t, w);
    }
  } else if (input.prefMode === 'leader-proxy') {
    const headcounts = input.groupPrefs.diets ?? {};
    const declared = (Object.keys(headcounts) as DietPreference[]).filter(
      (d) => (headcounts[d] ?? 0) > 0,
    );
    const single =
      declared.length > 0 ? declared : input.groupPrefs.diet ? [input.groupPrefs.diet] : [];
    diets = single.filter((d) => d !== 'no-preference' && d !== 'non-vegetarian');
    strictTable =
      single.length > 0 && single.every((d) => d !== 'non-vegetarian' && d !== 'no-preference');
    const counted = declared.reduce((sum, d) => sum + (headcounts[d] ?? 0), 0);
    if (counted > 0) totalHeads = counted;
    vegHeads = declared
      .filter((d) => d !== 'non-vegetarian' && d !== 'no-preference')
      .reduce((sum, d) => sum + (headcounts[d] ?? 0), 0);
    for (const t of input.groupPrefs.tastes ?? []) {
      // One person answering for the whole table: weight per covered head.
      vote(t, CHANNEL_WEIGHT.leaderProxy * totalHeads);
    }
  }

  const tasteText = [...tasteVotes.keys()].join(' ');
  return {
    diets,
    strictTable,
    tasteVotes,
    vegShare: totalHeads > 0 ? vegHeads / totalHeads : 0,
    preferenceText: `${tasteText} ${diets.join(' ')}`.trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Stage 2b — content similarity (embedding stand-in)                  */
/* ------------------------------------------------------------------ */

const TASTE_VOCAB: Record<TastePreference, string[]> = {
  spicy: ['spicy', 'spice', 'chilli', 'hot', 'fiery', 'pepper', 'red'],
  mild: ['mild', 'creamy', 'gentle', 'butter', 'soft'],
  light: ['light', 'fresh', 'salad', 'grilled', 'lettuce', 'crisp'],
  indulgent: ['truffle', 'butter', 'cream', 'rich', 'premium', 'saffron', 'gold'],
  adventurous: ['smoked', 'charcoal', 'unusual', 'fusion', 'pearls', 'tamarind'],
  classic: ['classic', 'traditional', 'house', 'signature', 'dal', 'biryani'],
};

function contentSimilarity(dish: Dish, profile: TableProfile): number {
  if (profile.tasteVotes.size === 0) return 0;
  const dishText = `${dish.name} ${dish.description} ${dish.tags.join(' ')}`.toLowerCase();
  let matched = 0;
  let total = 0;
  for (const [taste, weight] of profile.tasteVotes) {
    total += weight;
    if (TASTE_VOCAB[taste].some((kw) => dishText.includes(kw))) matched += weight;
  }
  return total > 0 ? matched / total : 0; // 0..1
}

/* ------------------------------------------------------------------ */
/* Stage 3 — co-order affinity                                         */
/* ------------------------------------------------------------------ */

export interface MinedAffinityRule {
  a: string; // dish name
  b: string; // dish name
  lift: number;
}

let minedRules: MinedAffinityRule[] = [];

/** Injected at session start (see the guest app's app/loading); safe to skip. */
export function setMinedAffinities(rules: MinedAffinityRule[]) {
  minedRules = rules.filter((r) => r.lift > 1);
}

const CO_ORDER_RULES: Array<{
  ifTag: string;
  ifCategory?: string;
  thenCategory: string;
  lift: number;
}> = [
  { ifTag: '*', ifCategory: 'mains', thenCategory: 'breads-rice', lift: 1.0 },
  { ifTag: 'spicy', thenCategory: 'drinks', lift: 0.7 },
  { ifTag: 'premium', thenCategory: 'desserts', lift: 0.6 },
  { ifTag: 'sharing', thenCategory: 'mains', lift: 0.4 },
];

function coOrderBoost(dish: Dish, anchorDishes: Dish[]): number {
  let boost = 0;
  for (const anchor of anchorDishes) {
    if (anchor.id === dish.id) continue;

    // Mined name-pairs first: real baskets beat curated hunches. Lift is
    // normalised into the same 0..1 band the seeded rules use.
    for (const rule of minedRules) {
      const matches =
        (rule.a === anchor.name && rule.b === dish.name) ||
        (rule.b === anchor.name && rule.a === dish.name);
      if (matches) {
        boost = Math.max(boost, Math.min((rule.lift - 1) / 1.5, 1));
      }
    }

    for (const rule of CO_ORDER_RULES) {
      const tagOk = rule.ifTag === '*' || anchor.tags.includes(rule.ifTag);
      const catOk = !rule.ifCategory || anchor.category === rule.ifCategory;
      if (tagOk && catOk && dish.category === rule.thenCategory) {
        // Seeded rules cap at half-strength so mined signal always wins.
        boost = Math.max(boost, rule.lift * 0.5);
      }
    }
  }
  return boost; // 0..1, bounded
}

/* ------------------------------------------------------------------ */
/* Stage 2 — scoring: linear model over named feature contributions    */
/* ------------------------------------------------------------------ */

interface Contribution {
  feature: string;
  value: number;
  reason?: string;
}

interface ScoredDish {
  dish: Dish;
  score: number;
  contributions: Contribution[];
  excluded: boolean;
  /** Set when this slot was chosen by exploration rather than by score. */
  explored?: boolean;
}

const OCCASION_RULES: Record<GroupType, Array<{ tag: string; fit: boolean; reason?: string }>> = {
  date: [
    { tag: 'premium', fit: true, reason: 'A favourite for date nights' },
    { tag: 'sharing', fit: false },
    { tag: 'kids', fit: false },
  ],
  family: [
    { tag: 'sharing', fit: true, reason: 'Made for sharing' },
    { tag: 'kids', fit: true, reason: 'Kid-approved' },
  ],
  friends: [
    { tag: 'sharing', fit: true, reason: 'Easy to split across the table' },
    { tag: 'spicy', fit: true, reason: 'Brings the heat the table likes' },
  ],
  business: [
    { tag: 'premium', fit: true, reason: 'Impresses without the mess' },
    { tag: 'spicy', fit: false },
  ],
  solo: [
    { tag: 'light', fit: true, reason: 'Right-sized for one' },
    { tag: 'sharing', fit: false },
  ],
};

const TASTE_TAG_MATCH: Record<TastePreference, { tag: string; invert?: boolean; reason: string }> =
  {
    spicy: { tag: 'spicy', reason: 'Has the heat you asked for' },
    mild: { tag: 'spicy', invert: true, reason: 'Keeps things gentle' },
    light: { tag: 'light', reason: 'On the lighter side' },
    indulgent: { tag: 'premium', reason: 'Properly indulgent' },
    classic: { tag: 'popular', reason: 'A classic the kitchen is known for' },
    adventurous: { tag: 'popular', invert: true, reason: 'Something off the beaten path' },
  };

function scoreDish(
  dish: Dish,
  input: EngineInput,
  profile: TableProfile,
  anchors: Dish[],
): ScoredDish {
  const contributions: Contribution[] = [];
  const add = (feature: string, multiplier: number, reason?: string) => {
    const value = FEATURE_WEIGHTS[feature] * multiplier;
    if (value !== 0) contributions.push({ feature, value, reason });
  };

  // Diet handling (vetoes already aggregated least-misery in the profile).
  const conflicts = dietConflicts(dish, profile.diets);
  if (conflicts) {
    if (profile.strictTable) {
      return { dish, score: -Infinity, contributions, excluded: true };
    }
    add('dietConflictSoft', 1);
  } else if (profile.diets.length > 0 && dish.tags.includes('veg')) {
    add('dietFit', 1, "Fits the table's dietary picks");
  }

  if (dish.tags.includes('popular')) add('popularity', 1, 'Ordered by most tables tonight');

  // The control arm of the A/B holdout gets neither the operator's featured lever
  // nor the learned prior — that is the whole point of the arm.
  const learned = input.variant !== 'control';
  if (learned && dish.featured) add('featured', 1, "One of the kitchen's picks tonight");

  // Learned from the recommender's own logs: a signed lift, multiplied straight
  // into the weight, so a well-accepted dish rises and a poorly-accepted one dips.
  if (learned && dish.recoLift) add('learnedAcceptance', dish.recoLift);

  // Occasion rules.
  if (input.groupType) {
    for (const rule of OCCASION_RULES[input.groupType]) {
      if (!dish.tags.includes(rule.tag)) continue;
      if (rule.tag === 'kids' && rule.fit && (input.partySize ?? 0) < 4) continue;
      add(rule.fit ? 'occasionFit' : 'occasionClash', 1, rule.reason);
    }
  }

  // Taste votes — channel-weighted, normalized so one loud channel can't dominate.
  const maxVote = Math.max(...profile.tasteVotes.values(), 1);
  for (const [taste, votes] of profile.tasteVotes) {
    const rule = TASTE_TAG_MATCH[taste];
    const has = dish.tags.includes(rule.tag);
    const matches = rule.invert ? !has : has;
    const strength = votes / maxVote; // 0..1
    if (matches) add('tasteMatch', strength, rule.reason);
    else if (!rule.invert && rule.tag === 'spicy' && taste === 'mild' && has) {
      add('tasteClash', strength);
    }
  }

  // Content similarity between dish text and the table's preference text.
  const sim = contentSimilarity(dish, profile);
  if (sim > 0) add('contentSimilarity', sim, 'Matches the flavours your table picked');

  // Refine tags: explicit direction of dissatisfaction, strongest signal.
  for (const tag of input.refineTags) {
    switch (tag) {
      case 'more-veg':
        add(
          dish.tags.includes('veg') ? 'refineMatch' : 'refineClash',
          1,
          'More vegetarian, as asked',
        );
        break;
      case 'more-premium':
        if (dish.tags.includes('premium')) add('refineMatch', 1, 'Turned up the premium picks');
        break;
      case 'lighter':
        if (dish.tags.includes('light')) add('refineMatch', 1, 'Lighter, as asked');
        else if (dish.tags.includes('premium')) add('refineClash', 0.75);
        break;
      case 'spicier':
        if (dish.tags.includes('spicy')) add('refineMatch', 1, 'Spicier, as asked');
        break;
      case 'more-sharing':
        if (dish.tags.includes('sharing')) add('refineMatch', 1, 'More to share, as asked');
        break;
      case 'budget':
        if (dish.price <= BUDGET_THRESHOLD) add('budgetFit', 1, 'Easy on the wallet');
        else add('budgetMiss', 1);
        break;
    }
  }

  // Co-order affinity against cart + already-strong anchors.
  const boost = coOrderBoost(dish, anchors);
  if (boost > 0) add('coOrderAffinity', boost, "Goes well with what's on the table");

  const score = contributions.reduce((sum, c) => sum + c.value, 0);
  return { dish, score, contributions, excluded: false };
}

/** Diet veto check: jain > vegan > vegetarian strictness. */
function dietConflicts(dish: Dish, diets: DietPreference[]): boolean {
  if (diets.includes('jain') && !dish.tags.includes('jain')) return true;
  if (diets.includes('vegan') && !dish.tags.includes('vegan')) return true;
  if (diets.includes('vegetarian') && !dish.tags.includes('veg')) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Stage 4 — meal composer: constrained greedy selection               */
/* ------------------------------------------------------------------ */

const BASKET_SIZE = 6;
const MAX_PER_CATEGORY = 3;

function composeMeal(
  candidates: ScoredDish[],
  input: EngineInput,
  profile: TableProfile,
): ScoredDish[] {
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const picked: ScoredDish[] = [];
  const byCategory = new Map<string, number>();
  const party = input.partySize ?? 2;

  // Diet-mix targets from headcounts: a half-veg table sees ~half veg dishes.
  const vegTarget = profile.strictTable ? BASKET_SIZE : Math.round(profile.vegShare * BASKET_SIZE);

  const catCount = (c: string) => byCategory.get(c) ?? 0;
  const vegCount = () => picked.filter((p) => p.dish.tags.includes('veg')).length;
  const spicyCount = () => picked.filter((p) => p.dish.tags.includes('spicy')).length;

  const take = (s: ScoredDish) => {
    picked.push(s);
    byCategory.set(s.dish.category, catCount(s.dish.category) + 1);
  };

  const eligible = (s: ScoredDish) =>
    !picked.includes(s) && catCount(s.dish.category) < MAX_PER_CATEGORY;

  // Pass 1 — structural must-haves: at least one starter and one main;
  // two mains for bigger tables.
  const need: Array<(s: ScoredDish) => boolean> = [
    (s) => s.dish.category === 'starters',
    (s) => s.dish.category === 'mains',
  ];
  if (party >= 4) need.push((s) => s.dish.category === 'mains');

  for (const wants of need) {
    const hit = pool.find((s) => eligible(s) && wants(s));
    if (hit) take(hit);
  }

  // Pass 2 — fill remaining slots by score, honouring the veg-mix target and
  // keeping the spice level from monopolizing the basket.
  for (const s of pool) {
    if (picked.length >= BASKET_SIZE) break;
    if (!eligible(s)) continue;
    const slotsLeft = BASKET_SIZE - picked.length;
    const vegNeeded = Math.max(vegTarget - vegCount(), 0);
    // Reserve remaining slots for veg dishes when the mix demands it.
    if (vegNeeded >= slotsLeft && !s.dish.tags.includes('veg')) continue;
    // Spice spread: no more than half the basket burns.
    if (s.dish.tags.includes('spicy') && spicyCount() >= BASKET_SIZE / 2) continue;
    take(s);
  }

  // Pass 3 — relax soft constraints if the basket is short.
  for (const s of pool) {
    if (picked.length >= BASKET_SIZE) break;
    if (eligible(s)) take(s);
  }

  return picked;
}

/* ------------------------------------------------------------------ */
/* Reasons — from the single top contributing feature (faithful)       */
/* ------------------------------------------------------------------ */

function pickReason(s: ScoredDish, allergens: Allergen[]): string {
  const best = [...s.contributions]
    .filter((c) => c.reason && c.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  if (best?.reason) return best.reason;
  if (allergens.length > 0 && s.dish.allergens.length === 0) {
    return "Free of the table's allergens";
  }
  return s.dish.tags.includes('popular')
    ? 'Ordered by most tables tonight'
    : "Chef's pick for your table";
}

/* ================================================================== */
/* Factory — bind the pipeline to a menu.                             */
/* ================================================================== */

export interface Recommender {
  recommend(input: EngineInput): Recommendation[];
  suggestUpsells(cart: CartItem[], members: Member[], limit?: number): Recommendation[];
}

export function createRecommender(dishes: Dish[]): Recommender {
  function recommend(input: EngineInput): Recommendation[] {
    // ---- Stage 1: safety filter (hard, never learned) ----
    const allergens = collectAllergens(input.members);
    const unresolvedTokens = collectUnresolvedAllergyTokens(input.members);

    const safe = dishes.filter((dish) => {
      if (dish.allergens.some((a) => allergens.includes(a))) return false;
      // Fail closed on free-text allergies we couldn't map: exclude any dish
      // whose name/description mentions the token.
      if (unresolvedTokens.length > 0) {
        const text = `${dish.name} ${dish.description}`.toLowerCase();
        if (unresolvedTokens.some((t) => text.includes(t))) return false;
      }
      return true;
    });

    // ---- Stage 2: table profile + linear scoring ----
    const profile = buildTableProfile(input);
    const cartDishes = (input.cart ?? [])
      .map((c) => dishes.find((d) => d.id === c.dishId))
      .filter((d): d is Dish => !!d);

    // First scoring pass without co-order anchors, to find the strong dishes.
    let scored = safe
      .map((dish) => scoreDish(dish, input, profile, cartDishes))
      .filter((s) => !s.excluded);

    // ---- Stage 3: co-order boost anchored on cart + top-scored dishes ----
    const anchors = [
      ...cartDishes,
      ...scored
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((s) => s.dish),
    ];
    scored = safe
      .map((dish) => scoreDish(dish, input, profile, anchors))
      .filter((s) => !s.excluded);

    // ---- Stage 4: meal composition ----
    const basket = composeMeal(scored, input, profile);

    // Graceful degradation: never return an empty set; fallbacks still respect
    // the stage-1 safety filter.
    let result = basket;
    if (result.length === 0) {
      result = safe
        .filter((d) => d.tags.includes('popular'))
        .slice(0, 5)
        .map((dish) => ({ dish, score: 0, contributions: [], excluded: false }));
    }
    if (result.length === 0) {
      result = dishes
        .filter((d) => d.allergens.length === 0)
        .slice(0, 5)
        .map((dish) => ({ dish, score: 0, contributions: [], excluded: false }));
    }

    // ---- Stage 5: exploration slot (ε-greedy) ----
    // Replace the weakest pick with an eligible dish the ranking wouldn't have
    // surfaced, so the long tail gets looked at and the learned prior can't become
    // a closed rich-get-richer loop. Safety-filtered `safe` dishes only.
    if (input.explore && result.length >= 3) {
      const shownIds = new Set(result.map((s) => s.dish.id));
      const pool = safe.filter((d) => !shownIds.has(d.id));
      if (pool.length > 0) {
        const wild = pool[Math.floor(Math.random() * pool.length)];
        result = [...result.slice(0, result.length - 1), { dish: wild, score: 0, contributions: [], excluded: false, explored: true }];
      }
    }

    return result.map((s) => ({
      dish: s.dish,
      reason: s.explored ? 'A little something different' : pickReason(s, allergens),
    }));
  }

  /**
   * Smart Upsells: complements to what's already in the cart, from mined
   * co-order affinities (seeded rules as fallback). The stage-1 safety rules
   * apply unchanged — an upsell that violates a table allergen is a hazard,
   * not a revenue idea.
   */
  function suggestUpsells(cart: CartItem[], members: Member[], limit = 3): Recommendation[] {
    const cartIds = new Set(cart.map((c) => c.dishId));
    if (cartIds.size === 0) return [];

    const allergens = collectAllergens(members);
    const unresolvedTokens = collectUnresolvedAllergyTokens(members);
    const anchors = dishes.filter((d) => cartIds.has(d.id));

    const scored = dishes
      .filter((dish) => {
        if (cartIds.has(dish.id)) return false;
        if (dish.allergens.some((a) => allergens.includes(a))) return false;
        if (unresolvedTokens.length > 0) {
          const text = `${dish.name} ${dish.description}`.toLowerCase();
          if (unresolvedTokens.some((t) => text.includes(t))) return false;
        }
        return true;
      })
      .map((dish) => {
        // Track which anchor produced the boost so the reason can name it.
        let boost = 0;
        let anchorName: string | undefined;
        for (const anchor of anchors) {
          for (const rule of minedRules) {
            const matches =
              (rule.a === anchor.name && rule.b === dish.name) ||
              (rule.b === anchor.name && rule.a === dish.name);
            if (matches) {
              const strength = Math.min((rule.lift - 1) / 1.5, 1);
              if (strength > boost) {
                boost = strength;
                anchorName = anchor.name;
              }
            }
          }
          for (const rule of CO_ORDER_RULES) {
            const tagOk = rule.ifTag === '*' || anchor.tags.includes(rule.ifTag);
            const catOk = !rule.ifCategory || anchor.category === rule.ifCategory;
            if (tagOk && catOk && dish.category === rule.thenCategory) {
              if (rule.lift * 0.5 > boost) {
                boost = rule.lift * 0.5;
                anchorName = anchor.name;
              }
            }
          }
        }
        return { dish, boost, anchorName };
      });

    return scored
      .filter((s) => s.boost > 0)
      .sort((a, b) => b.boost - a.boost)
      .slice(0, limit)
      .map((s) => ({
        dish: s.dish,
        reason: s.anchorName
          ? `Often ordered with ${s.anchorName}`
          : "Goes well with what's on the table",
      }));
  }

  return { recommend, suggestUpsells };
}

export const REFINE_OPTIONS = [
  { id: 'more-veg', label: 'More vegetarian' },
  { id: 'more-premium', label: 'More premium' },
  { id: 'lighter', label: 'Lighter options' },
  { id: 'spicier', label: 'Spicier' },
  { id: 'more-sharing', label: 'More to share' },
  { id: 'budget', label: 'Easier on the wallet' },
];
