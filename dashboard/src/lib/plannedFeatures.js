/**
 * The 18 features that cannot produce an honest answer yet (MERGE_PLAN.md §2,
 * Tier 3). Each gets a real route and a real place in the nav so the
 * information architecture is settled once — when a feature ships, its element
 * is swapped and its URL does not move.
 *
 * The two counts here are reconciled against the source docs, not guessed:
 *
 *   9 history-gated — docs/FORECASTING.md names seven kitchen/procurement
 *     features ("demand, inventory, weather/event, promo-aware, waste, prep
 *     sheet, auto-reorder"), and docs/PRODUCT_PLAN.md Month 3 adds the two
 *     labour ones (Shift Planning, Cost-based Scheduling). 7 + 2 = 9.
 *   9 externally blocked — 4 needing aggregator scraping, 4 needing cameras and
 *     a CV model, 1 needing Tally credentials.
 *
 * Phase 7 added a 19th: Nutrition & Calories. It is not history-gated and not
 * externally blocked — it is blocked on data that does not exist anywhere in
 * the POS and cannot be derived from recipes, which give quantities but not
 * calories. It is the one Tier 3 feature a language model could fake
 * convincingly, which is exactly why it does not.
 *
 * FEATURE_AUDIT.md's prose named only 6 and 8 respectively; the missing three
 * were recovered from the plan rather than invented.
 *
 * `summary` says what the screen WILL show, in the operator's terms. It must
 * never contain a figure — see the numeric-literal guard in
 * scripts/check-planned-features.mjs, which enforces the same rule across
 * featureLayouts.js, where each of these screens' actual layout lives.
 *
 * This file answers "why is this empty". featureLayouts.js answers "what is
 * this screen". Both are required: check:planned fails on a feature registered
 * here without a layout there.
 */

// Why a feature can't render yet. Drives the copy and the icon in <Unavailable>.
export const REASON = {
  COLLECTING: 'collecting',           // needs trading history depth; the clock is running
  NEEDS_INFRASTRUCTURE: 'needs-infrastructure', // needs scraping infra we deliberately don't run
  NEEDS_HARDWARE: 'needs-hardware',   // needs cameras + a CV model
  NEEDS_CREDENTIALS: 'needs-credentials', // needs third-party API credentials
  NEEDS_UPLOAD: 'needs-upload',       // needs an operator file; used by Tier 2 in Phase 8
};

const HISTORY_BLOCKER =
  'Forecasts are only as honest as the history behind them. Training on a few weeks of ' +
  'trading would produce confident numbers with nothing underneath them, so this stays ' +
  'switched off until the history is deep enough to learn a real day-of-week shape.';

const SCRAPE_BLOCKER =
  'Needs continuous scraping of the delivery aggregators, which CookLyt deliberately does ' +
  'not run. Nothing in your own data can substitute for it.';

export const PLANNED_FEATURES = [
  // ── History-gated (9) ────────────────────────────────────────────────────
  {
    slug: 'weather', path: '/forecast/weather', group: 'Forecasting',
    title: 'Weather & Event Signals',
    summary:
      "Weather, holidays, fixtures and local events folded into the day's expected demand " +
      'instead of discovered at closing.',
    reason: REASON.COLLECTING,
    blocker:
      HISTORY_BLOCKER +
      ' This one also needs a local events feed on top of the forecast it adjusts.',
  },
  {
    slug: 'promo', path: '/forecast/promo', group: 'Forecasting',
    title: 'Promo-aware Forecast',
    summary:
      "Tomorrow's offers reflected in tomorrow's expected demand, before the prep list is " +
      'written rather than after the queue forms.',
    reason: REASON.COLLECTING, blocker: HISTORY_BLOCKER,
  },
  {
    slug: 'waste', path: '/forecast/waste', group: 'Forecasting',
    title: 'Waste Prediction',
    summary:
      'Which items are likely to be over-prepped and binned, flagged before they are prepped ' +
      'rather than counted afterwards.',
    reason: REASON.COLLECTING, blocker: HISTORY_BLOCKER,
  },
  // ── Needs scraping infrastructure (4) ────────────────────────────────────
  {
    slug: 'competitor-prices', path: '/market/competitor-prices', group: 'Market Intel',
    title: 'Competitor Price Tracker',
    summary: "Nearby restaurants' menu prices tracked over time, with alerts when they move.",
    reason: REASON.NEEDS_INFRASTRUCTURE, blocker: SCRAPE_BLOCKER,
  },
  {
    slug: 'competitor-offers', path: '/market/competitor-offers', group: 'Market Intel',
    title: 'Competitor Offer Tracker',
    summary: 'Discounts and promotional campaigns competitors are running right now.',
    reason: REASON.NEEDS_INFRASTRUCTURE, blocker: SCRAPE_BLOCKER,
  },
  {
    slug: 'new-competitors', path: '/market/new-competitors', group: 'Market Intel',
    title: 'New Competitor Alerts',
    summary: 'A note when a new restaurant opens inside your delivery radius.',
    reason: REASON.NEEDS_INFRASTRUCTURE, blocker: SCRAPE_BLOCKER,
  },
  {
    slug: 'collection-gaps', path: '/market/collection-gaps', group: 'Market Intel',
    title: 'Collection Gap Finder',
    summary:
      "Aggregator collections and campaigns you qualify for but aren't enrolled in.",
    reason: REASON.NEEDS_INFRASTRUCTURE, blocker: SCRAPE_BLOCKER,
  },

  // ── Needs third-party credentials (1) ────────────────────────────────────
  {
    slug: 'tally', path: '/integrations/tally', group: 'Integrations',
    title: 'Tally Integration',
    summary: 'Daily sales and purchase entries posted straight into Tally, without re-keying.',
    reason: REASON.NEEDS_CREDENTIALS,
    blocker:
      'Needs Tally API credentials, which have to be issued to this deployment before ' +
      'anything can be posted.',
    alternative: { to: '/reports', label: 'Export the figures for your accountant instead' },
  },
];

export const findPlannedFeature = (slug) =>
  PLANNED_FEATURES.find((f) => f.slug === slug) || null;
