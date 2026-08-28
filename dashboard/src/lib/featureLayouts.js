/**
 * The screen behind each Tier-3 shell (MERGE_PLAN.md §3).
 *
 * `plannedFeatures.js` says *why* a screen cannot answer yet. This file says
 * *what the screen is* — its filters, its figures, its chart axes and its table
 * columns — so the shell renders as the real page with every value empty,
 * rather than as a paragraph explaining an absence.
 *
 * The rule the original shells were built on has NOT been relaxed, only
 * narrowed. Structure may be shown; values may not be invented. Every figure
 * slot renders an em dash, every table renders an empty body, and the chart
 * frame draws its axes with no series inside them. There is no dimmed sample
 * data anywhere here, and `npm run check:planned` fails on any digit in any
 * string in this file — a column header cannot quietly become a rupee figure.
 *
 * Layouts are sourced, not invented:
 *   Forecasting   — docs/FORECASTING.md in the archived repo: the four horizons
 *                   (III.2), the total→share→ingredient hierarchy (III.3), the
 *                   newsvendor fractile (IV.1), the safety-stock terms (IV.3),
 *                   purchase-unit rounding (IV.4), uplift-not-elasticity (IV.5),
 *                   the prep confirmation that doubles as the waste log (V.5),
 *                   and staleness as a first-class state (VI.4).
 *   Market Intel  — docs/epics/search-visibility/README.md.
 *   Tally         — docs/epics/payouts-reconciliation/README.md.
 */

const FORECAST_BASIS = {
  title: 'What this would be computed from',
  body:
    'A seasonal-naive baseline ships first and stays the permanent benchmark. A learned model ' +
    'replaces it only when it beats that baseline across several outlets with none made worse, ' +
    'and the screen says which of the two produced the number in front of you.',
};

const layouts = {
  // ── Forecasting ──────────────────────────────────────────────────────────


  weather: {
    filters: ['Date range', 'Signal type'],
    kpis: [
      { label: 'Expected conditions' },
      { label: 'Heat index', hint: 'Against this location’s own climatology' },
      { label: 'Events nearby' },
      { label: 'Net adjustment', hint: 'How far the signals move the base forecast' },
    ],
    chart: { title: 'Forecast with and without signals', x: 'Day', y: 'Covers' },
    table: {
      title: 'Signals folded into the forecast',
      caption:
        'Scored on the forecast available at decision time, never on what the weather turned out to be.',
      columns: ['Date', 'Signal', 'Source', 'Known at', 'Adjustment', 'Applies to'],
    },
    panels: [
      {
        title: 'A festival a year is not a pattern',
        body:
          'Rain response becomes learnable within a season. Festival uplift does not — one outlet sees ' +
          'each festival once a year, so that effect can only come from pooling across outlets, and ' +
          'annual seasonality needs calendar time that no amount of customers can buy.',
      },
    ],
  },

  promo: {
    filters: ['Date range', 'Platform'],
    kpis: [
      { label: 'Offers live' },
      { label: 'Measured uplift', hint: 'What happened last time you ran this' },
      { label: 'Discount you fund' },
      { label: 'Net contribution' },
    ],
    chart: { title: 'Traded volume around each offer', x: 'Day', y: 'Orders' },
    table: {
      title: 'Offers and their measured effect',
      columns: ['Offer', 'Platform', 'Times run', 'Measured uplift', 'Discount funded', 'Net'],
    },
    panels: [
      {
        title: 'Uplift measured, not elasticity predicted',
        body:
          'Prices do not move at random — they are raised when demand is strong and cut when it is ' +
          'weak, so a model fitted to your own history concludes that raising prices raises sales. ' +
          'That sign error does not improve with more data. This screen reports what happened when ' +
          'you ran an offer before. It will not predict what a price change would do.',
      },
    ],
  },


  waste: {
    filters: ['Date range', 'Station', 'Reason'],
    kpis: [
      { label: 'Predicted waste value' },
      { label: 'Predicted waste weight' },
      { label: 'Dishes flagged' },
      { label: 'Share of food cost' },
    ],
    chart: { title: 'Predicted against logged waste', x: 'Day', y: 'Value' },
    table: {
      title: 'Where the surplus is expected',
      columns: ['Item', 'Prepped', 'Forecast demand', 'Likely surplus', 'Value at risk', 'Shelf life'],
    },
    panels: [
      {
        title: 'Logged waste is the check on this, not its input',
        body:
          'Waste already recorded on the prep sheet is what a prediction gets scored against. Until ' +
          'there is enough of both to compare, this screen would be marking its own homework.',
      },
    ],
  },

    'shift-planning': {
    filters: ['Date', 'Section'],
    kpis: [
      { label: 'Forecast covers' },
      { label: 'Suggested staff' },
      { label: 'Currently rostered' },
      { label: 'Gap' },
    ],
    chart: { title: 'Forecast covers and cover by hour', x: 'Hour', y: 'Covers' },
    table: {
      title: 'Hour by hour',
      columns: ['Hour', 'Forecast covers', 'Suggested', 'Rostered', 'Gap', 'Role short'],
    },
    panels: [
      {
        title: 'A suggestion, against a roster you own',
        body:
          'Nothing here moves a shift. The suggested line sits next to what is actually rostered so ' +
          'the difference is a conversation rather than an instruction.',
      },
    ],
  },

  scheduling: {
    filters: ['Week', 'Role'],
    kpis: [
      { label: 'Rostered hours' },
      { label: 'Labour cost' },
      { label: 'Share of forecast revenue' },
      { label: 'Target' },
      { label: 'Variance to target' },
    ],
    chart: { title: 'Labour cost against target across the week', x: 'Day', y: 'Share of revenue' },
    table: {
      title: 'The week',
      columns: ['Day', 'Role', 'Hours', 'Cost', 'Share of forecast revenue', 'Against target'],
    },
    panels: [
      {
        title: 'The trade-off is made on purpose',
        body:
          'Holding a rota to a labour-cost target means somebody decides where cover gets thinned. ' +
          'This screen makes that decision explicit and records it, instead of leaving it to whoever ' +
          'happens to be filling the rota that week.',
      },
    ],
  },

  // ── Market Intel ─────────────────────────────────────────────────────────

  'competitor-prices': {
    filters: ['Competitor', 'Category', 'Date range'],
    kpis: [
      { label: 'Competitors tracked' },
      { label: 'Dishes matched' },
      { label: 'Your price against the area' },
      { label: 'Moves this period' },
    ],
    chart: { title: 'A matched dish over time', x: 'Day', y: 'Price' },
    table: {
      title: 'Matched dishes',
      caption:
        'A match between two menus is a judgement, so the confidence of each match travels with it.',
      columns: [
        'Dish', 'Your price', 'Competitor', 'Their price', 'Difference',
        'Match confidence', 'Last seen',
      ],
    },
    panels: [
      {
        title: 'Nothing in your own data substitutes for this',
        body:
          'Your prices, your orders and your reviews say nothing about what the restaurant down the ' +
          'road charges. This screen is empty because the input does not exist here, not because the ' +
          'analysis is hard.',
      },
    ],
  },

  'competitor-offers': {
    filters: ['Platform', 'Competitor', 'Status'],
    kpis: [
      { label: 'Offers live nearby' },
      { label: 'Deepest discount' },
      { label: 'On dishes you also sell' },
      { label: 'Your offers live' },
    ],
    table: {
      title: 'Campaigns running now',
      columns: ['Competitor', 'Platform', 'Offer', 'Applies to', 'Started', 'Overlaps your menu'],
    },
    panels: [
      {
        title: 'What you run yourself is already tracked',
        body:
          'Your own offers, and what they did to volume, are measurable from your orders and belong on ' +
          'the promo-aware forecast. Only the competitor half needs the infrastructure this screen ' +
          'is waiting on.',
      },
    ],
  },

  'new-competitors': {
    filters: ['Radius', 'Cuisine', 'Since'],
    kpis: [
      { label: 'Opened in radius' },
      { label: 'Same cuisine' },
      { label: 'Overlapping menu' },
      { label: 'Nearest' },
    ],
    table: {
      title: 'New openings',
      columns: ['Restaurant', 'Cuisine', 'Distance', 'Platforms', 'First seen', 'Menu overlap'],
    },
  },

  'collection-gaps': {
    filters: ['Platform', 'Collection type'],
    kpis: [
      { label: 'Collections you qualify for' },
      { label: 'Enrolled' },
      { label: 'Gaps' },
      { label: 'Nearest miss' },
    ],
    table: {
      title: 'Collections and campaigns',
      caption:
        'A gap is only worth showing with its requirement beside it — otherwise it is a nag rather ' +
        'than an action.',
      columns: ['Collection', 'Platform', 'Requirement', 'You meet it', 'Enrolled', 'What to do'],
    },
  },

  // ── Guest Menu ───────────────────────────────────────────────────────────

  nutrition: {
    filters: ['Category', 'Diet', 'Allergen'],
    kpis: [
      { label: 'Dishes with nutrition' },
      { label: 'Ingredients with nutrition' },
      { label: 'Coverage of the menu' },
      { label: 'Source' },
    ],
    table: {
      title: 'Per serving',
      caption:
        'Every figure would trace through a recipe to a per-ingredient source you can name. A dish with ' +
        'one undeclared ingredient reports nothing rather than a number that is nearly right.',
      columns: ['Dish', 'Serving', 'Energy', 'Protein', 'Carbohydrate', 'Fat', 'Source', 'Complete'],
    },
    panels: [
      {
        title: 'The one screen a model could fake convincingly',
        body:
          'Asked for the calories in a butter chicken, a language model produces a confident figure ' +
          'instantly, and a guest managing diabetes or counting macros would act on it. That is exactly ' +
          'why nothing generated appears here. Load real per-ingredient nutrition data and this screen ' +
          'fills itself from the recipes you already keep.',
      },
    ],
  },

  // ── Integrations ─────────────────────────────────────────────────────────

  tally: {
    status: {
      title: 'Connection',
      rows: ['Company', 'Server', 'Credentials', 'Last sync', 'State'],
    },
    filters: ['Date range', 'Voucher type', 'Status'],
    kpis: [
      { label: 'Entries queued' },
      { label: 'Posted' },
      { label: 'Failed' },
      { label: 'Last sync' },
    ],
    table: {
      title: 'Posting queue',
      caption:
        'Nothing posts silently. Every voucher is listed before it is sent and keeps its reference back ' +
        'to the order or purchase it came from, so an accountant can walk it in either direction.',
      columns: ['Date', 'Voucher type', 'Ledger', 'Amount', 'Reference', 'Status'],
    },
    panels: [
      {
        title: 'The export already covers the manual workflow',
        body:
          'The transaction log exports every order across every channel with its full deduction trail, ' +
          'and that is the file an accountant imports today. This screen removes the import step — it ' +
          'does not unlock a figure you cannot already get.',
      },
    ],
  },
};

export const findFeatureLayout = (slug) => layouts[slug] || null;

export default layouts;
