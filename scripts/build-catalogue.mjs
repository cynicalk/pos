/**
 * One-shot generator for shared/catalogue.js — run once, output committed.
 *
 * W1 of the deck-to-product plan: reconcile three sources of truth into one.
 *
 *   1. The archived project's feature-registry.json — 77 features, richly
 *      structured, but with the OLD Next.js project's statuses (pre-merge).
 *   2. The CookLyt Feature Overview deck — 86 features across 10 families and
 *      3 phases, priced into 3 tiers plus 4 add-ons.
 *   3. The current POS code — the only thing that decides real status.
 *
 * The archived JSON is read ONCE here; the emitted catalogue.js is fully
 * self-contained, so the POS repo never depends on the archived repo at build
 * or run time. Re-run this only to regenerate from a corrected backbone.
 *
 * The patch table below is where the reconciliation actually lives: it assigns
 * each feature its deck family / phase / tier, and OVERRIDES status wherever the
 * POS differs from what the archived project reported. Every override carries a
 * one-line reason, because a status that disagrees with the archived registry
 * is exactly the kind of claim that needs to be auditable.
 */
import fs from 'fs';

const ARCHIVED = 'C:/Opencode-project/cooklyt/docs/feature-registry.json';

// Deck families (Feature Overview slide 5), in deck order.
const FAMILY = {
  platform:   'Platform & Data',
  payouts:    'Payouts & Finance',
  menu:       'Menu Intelligence',
  competitor: 'Competitor Intel',
  whatsapp:   'WhatsApp & AI',
  reviews:    'Reviews & Reputation',
  winback:    'Winback & Retention',
  guest:      'Guest Experience',
  forecast:   'Forecasting & ML',
  compliance: 'Compliance & SOP',
};

// Status vocabulary, POS-truthful:
//   built        working end-to-end in the POS today
//   partial      real, but narrower than the deck claims
//   shell        honest empty screen on a real route (plannedFeatures.js)
//   absent       nothing in the POS implements it
//   external     lives in a different repo/surface (the dine-in guest app)
//   blocked-ext  cannot be built here — needs a partner API, hardware, or a network of outlets

// Per-slug patch: [family, phase, tier, statusOverride|null, note]
// statusOverride null = keep the archived status (mapped below). A note is
// required whenever the override changes the archived status.
const PATCH = {
  // Platform & Data
  'sales-revenue-dashboard':      ['platform', 1, 'base', null, 'Unified across POS + uploaded Swiggy/Zomato settlements.'],
  'platform-connections':         ['platform', 1, 'base', 'partial', 'POS is first-party; Swiggy/Zomato are CSV upload, not the deck auto-connect.'],

  // Payouts & Finance
  'payout-checker':               ['payouts', 1, 'base', null, ''],
  'payout-leakage-detector':      ['payouts', 1, 'base', 'built', 'Reconciliation raises a recoverable-leakage task in the action centre on import, ranked by its rupee shortfall via the opportunity score.'],
  'auditor-ready-transaction-log':['payouts', 1, 'base', null, ''],
  'cost-per-order':               ['payouts', 1, 'base', null, ''],
  'cancellation-cost':            ['payouts', 1, 'base', null, ''],
  'prime-cost-health':            ['payouts', 1, 'base', null, 'Withheld when labour data missing; currently complete at ~39%.'],
  'labour-efficiency':            ['payouts', 1, 'base', null, ''],
  'invoice-parser':               ['payouts', 1, 'base', 'partial', 'Structured CSV intake only; deck implies OCR of photographed bills.'],
  'pos-accounting-bridge':        ['payouts', 1, 'base', 'partial', 'CSV export covers the manual workflow; no direct accounting format.'],
  'tally-integration':            ['payouts', 3, 'pro', 'shell', 'Honest shell; needs Tally API credentials issued to the deployment.'],

  // Menu Intelligence
  'menu-performance':             ['menu', 1, 'base', null, ''],
  'menu-engineering':             ['menu', 1, 'base', null, ''],
  'cross-sell-map-builder':       ['menu', 1, 'base', null, 'Real lift; feeds nothing outbound yet.'],
  'new-item-performance-tracker': ['menu', 1, 'base', 'built', 'Tracks dishes launched inside a recent window against the menu median, from menu_items.created_at; demo launch dates backfilled by scripts/backfill-launch-dates.js.'],

  // Competitor Intel
  'search-rank-tracker':          ['competitor', 1, 'base', null, 'Manual entry; CookLyt does not read any platform.'],
  'rating-benchmark':             ['competitor', 1, 'base', null, 'Manual entry.'],
  'competitor-price-tracker':     ['competitor', 2, 'mid', 'shell', 'Needs scraping infra the product deliberately does not run.'],
  'competitor-offer-tracker':     ['competitor', 2, 'mid', 'shell', 'Same; needs aggregator scraping.'],
  'new-competitor-alerts':        ['competitor', 2, 'mid', 'shell', 'Same; needs aggregator scraping.'],
  'collection-gap-finder':        ['competitor', 2, 'mid', 'shell', 'Same; needs aggregator scraping.'],

  // WhatsApp & AI
  'rules-engine':                 ['whatsapp', 1, 'base', null, '8 deterministic rules, dedupe-keyed.'],
  'opportunity-score':            ['whatsapp', 1, 'base', null, 'Rupee-ranked; amount null when unpriceable.'],
  'staff-task-assignment':        ['whatsapp', 1, 'base', 'partial', 'Assigns in-app; the WhatsApp nudge is a console.log stub.'],
  'outcome-tracking':             ['whatsapp', 2, 'mid', 'partial', 'Code exists; outcomes table is empty, no action measured before/after.'],
  'smart-alerts':                 ['whatsapp', 2, 'mid', 'partial', 'Rules fire in-app; WhatsApp delivery is stubbed.'],
  'ai-daily-brief':               ['whatsapp', 2, 'base', 'absent', 'Deliberately NOT ported in the merge (ARCHIVED.md); a code comment defers it to Phase 2. In every tier per the deck.'],
  'whatsapp-assistant':           ['whatsapp', 2, 'base', 'absent', 'sendWhatsApp() is a feature-flagged console.log; no Business API integration.'],
  'regional-language-ai':         ['whatsapp', 3, 'addon', 'absent', 'Was a property of the brief (BRIEF_LANGUAGE); brief not ported, so absent.'],

  // Reviews & Reputation
  'review-summarizer':            ['reviews', 1, 'base', null, ''],
  'review-insights':              ['reviews', 1, 'base', null, 'LLM classification on a scheduler, keywords on the request path.'],
  'review-action-center':         ['reviews', 1, 'base', null, ''],
  'ai-review-reply':              ['reviews', 3, 'pro', 'partial', 'Drafts well but cannot post; first-party table-QR reviews only, no Google connection.'],

  // Winback & Retention
  'repeat-rate-winback':          ['winback', 1, 'base', 'partial', 'Repeat rate + lapsed list built; the campaign send needs the WhatsApp channel.'],

  // Guest Experience
  'waitlist-intake':              ['guest', 1, 'base', null, ''],
  'waiting-screen':               ['guest', 1, 'base', null, 'Public /waitlist.'],
  'stalled-table-detection':      ['guest', 1, 'base', null, ''],
  'learned-turnover':             ['guest', 1, 'base', null, ''],
  'wait-time-estimator':          ['guest', 1, 'base', null, ''],
  'peak-dead-hour-detection':     ['guest', 1, 'base', null, ''],
  'dietary-filter':               ['guest', 1, 'base', null, 'On the public /menu-card and the guest app.'],
  'ingredient-disclosure':        ['guest', 1, 'base', null, ''],
  'tourist-menu-translation':     ['guest', 3, 'addon', null, 'Cached per language, honest no-key fallback.'],
  'ai-nutrition-assistant':       ['guest', 3, 'addon', 'shell', 'The POS holds no nutritional data; ships as an honest shell.'],
  'personalized-ordering':        ['guest', 3, 'addon', 'external', 'Lives in the dine-in guest app, not this repo.'],
  'smart-upsells':                ['guest', 3, 'addon', 'external', 'Guest app, not this repo.'],
  'joined-cart':                  ['guest', 1, 'base', 'external', 'Guest app, not this repo.'],

  // Forecasting & ML
  'demand-forecasting':           ['forecast', 3, 'addon', 'built', 'Tier 0 (seasonal naive) shipped this session at /forecast/demand.'],
  'prep-sheet-generator':         ['forecast', 3, 'addon', 'built', 'Shipped this session at /forecast/prep-sheet.'],
  'weather-event-forecasting':    ['forecast', 3, 'addon', 'shell', 'Needs a local events + weather feed on top of the forecast.'],
  'promo-aware-forecast':         ['forecast', 3, 'addon', 'shell', 'History-gated; also needs promo attribution.'],
  'waste-prediction':             ['forecast', 3, 'addon', 'shell', 'Needs prep-vs-sold capture to score against.'],
  'inventory-forecasting':        ['forecast', 3, 'addon', 'built', 'Tier 0 stock projection shipped this session at /forecast/inventory — stock walked down against the forecast.'],
  'auto-reorder-suggestions':     ['forecast', 3, 'addon', 'built', 'Tier 0 reorder plan (h=3) shipped this session at /forecast/reorder — the projection read at the lead time.'],
  'shift-planning':               ['forecast', 3, 'addon', 'built', 'Tier 0 shift plan shipped this session at /forecast/shift-planning — forecast covers ÷ learned covers-per-labour-hour.'],
  'cost-based-scheduling':        ['forecast', 3, 'addon', 'built', 'Tier 0 scheduling week shipped this session at /forecast/scheduling — labour cost vs forecast revenue against the outlet’s own labour-% band.'],
  'live-food-cost':               ['forecast', 1, 'base', null, 'Under Recipe Mgmt.'],
  'recipe-costing':               ['forecast', 1, 'base', null, ''],
  'ingredient-cost-tracker':      ['forecast', 1, 'base', null, 'Append-only price history + cost_spike rule.'],
  'supplier-management':          ['forecast', 1, 'base', null, ''],
  'purchase-order-generator':     ['forecast', 1, 'base', null, 'Usage-based reorder points (arithmetic, not forecast).'],

  // Compliance & SOP
  'fssai-license-tracker':        ['compliance', 1, 'base', null, ''],
  'hygiene-checklist':            ['compliance', 1, 'base', null, ''],
  'staff-compliance-records':     ['compliance', 1, 'base', null, ''],
  'testing-calendar':             ['compliance', 1, 'base', null, ''],
  'audit-evidence-pack':          ['compliance', 1, 'base', null, ''],
  'ai-compliance-assistant':      ['compliance', 1, 'base', null, 'Grounded snapshot fallback.'],
  'allergen-cross-contamination-alerts': ['compliance', 1, 'base', 'partial', 'Declared allergens reach the ticket; camera-based detection is a shell.'],
  'sop-generator':                ['compliance', 1, 'base', null, ''],
  'sop-version-control':          ['compliance', 1, 'base', null, ''],
  'sop-drift-detection':          ['compliance', 1, 'base', null, ''],
  'shift-checklists':             ['compliance', 1, 'base', null, ''],
  // Camera + CV hygiene monitoring: the shell screens were removed from the app;
  // the capability is acknowledged as a future line on the Compliance › Hygiene tab.
  'headgear-glove-detection':     ['compliance', 3, 'pro', 'absent', 'Needs cameras + a CV model; not built. Shell removed — surfaced as a future line on Compliance › Hygiene.'],
  'handwash-monitoring':          ['compliance', 3, 'pro', 'absent', 'Needs cameras + CV; not built. Shell removed — surfaced on Compliance › Hygiene.'],
  'cross-contamination-detection':['compliance', 3, 'pro', 'absent', 'Needs cameras + CV; not built. Shell removed — surfaced on Compliance › Hygiene.'],
  'spill-pest-detection':         ['compliance', 3, 'pro', 'absent', 'Needs cameras + CV; not built. Shell removed — surfaced on Compliance › Hygiene.'],
};

// Deck-only features that reconcile 77 -> 86. None present in the archived
// registry; status set from the current POS.
const DECK_ONLY = [
  { slug: 'multi-outlet-dashboard', name: 'Multi-outlet Dashboard', epic: 'group',
    family: 'compliance', phase: 3, tier: 'pro', status: 'built', surface: 'ops /group',
    note: 'Ported in Phase 7 as /group; not in the archived 77-registry.' },
  { slug: 'cross-outlet-benchmarking', name: 'Cross-outlet Benchmarking', epic: 'group',
    family: 'compliance', phase: 3, tier: 'pro', status: 'built', surface: 'ops /group',
    note: 'Outlet-vs-outlet on the same metrics; per-outlet rate averages.' },
  { slug: 'automated-winback-campaigns', name: 'Automated Winback Campaigns', epic: 'guests-loyalty',
    family: 'winback', phase: 2, tier: 'base', status: 'absent', surface: '',
    note: 'Deck splits winback into tracking + campaigns + QR; only tracking exists. Needs WhatsApp.' },
  { slug: 'qr-winback-offers', name: 'QR Winback Offers', epic: 'guests-loyalty',
    family: 'winback', phase: 2, tier: 'base', status: 'absent', surface: '',
    note: 'Printed table/packaging offers; not built.' },
  { slug: 'per-employee-data-entry', name: 'Per-employee Data Entry over WhatsApp', epic: 'daily-brief-whatsapp',
    family: 'whatsapp', phase: 2, tier: 'base', status: 'absent', surface: '',
    note: 'Needs the WhatsApp inbound channel.' },
  { slug: 'menu-modelling', name: 'Menu Modelling', epic: 'kitchen-procurement',
    family: 'forecast', phase: 3, tier: 'addon', status: 'blocked-ext', surface: '',
    note: 'Price/push/drop modelling. Needs cross-outlet variation; unlearnable on one restaurant.' },
  { slug: 'pricing-prediction', name: 'Pricing Prediction', epic: 'kitchen-procurement',
    family: 'forecast', phase: 3, tier: 'addon', status: 'blocked-ext', surface: '',
    note: 'Endogeneity: one restaurant own history flips the elasticity sign. Needs a network.' },
  { slug: 'wholesale-pricing-prediction', name: 'Wholesale & Supply Pricing Prediction', epic: 'kitchen-procurement',
    family: 'forecast', phase: 3, tier: 'addon', status: 'blocked-ext', surface: '',
    note: 'Forecasts a commodity market; needs an external price feed.' },
  { slug: 'e-waiter', name: 'E-Waiter', epic: 'guest-ordering',
    family: 'guest', phase: 3, tier: 'addon', status: 'external', surface: '',
    note: 'Guest Intelligence add-on; lives in the dine-in guest app, not this repo.' },
];

// ── Build ────────────────────────────────────────────────────────────────────
const archived = JSON.parse(fs.readFileSync(ARCHIVED, 'utf8'));
const archivedFeatures = Array.isArray(archived.features)
  ? archived.features : Object.values(archived.features);

const ARCHIVED_STATUS = { built: 'built', partial: 'partial', blocked: 'shell', 'history-gated': 'shell' };

const out = [];
const missing = [];

// Family is stored as its display label so the catalogue is directly renderable
// and the guard can check membership against the exported FAMILIES list.
const label = (key) => {
  const l = FAMILY[key];
  if (!l) throw new Error(`Unknown family key "${key}"`);
  return l;
};

for (const f of archivedFeatures) {
  const patch = PATCH[f.slug];
  if (!patch) { missing.push(f.slug); continue; }
  const [family, phase, tier, override, note] = patch;
  out.push({
    slug: f.slug,
    name: f.name,
    family: label(family),
    phase,
    tier,
    status: override || ARCHIVED_STATUS[f.status] || 'absent',
    surface: f.surface || '',
    archivedStatus: f.status,
    note,
  });
}

for (const d of DECK_ONLY) out.push({ ...d, family: label(d.family), archivedStatus: null });

// Bridge to plannedFeatures.js — the shell subset renders through FeatureShell,
// which is keyed by its own shorter slugs. The catalogue is the master status;
// this map lets check:catalogue assert the two files describe the same 17
// screens and can never silently drift apart.
const SHELL_SLUG = {
  'tally-integration':             'tally',
  'competitor-price-tracker':      'competitor-prices',
  'competitor-offer-tracker':      'competitor-offers',
  'new-competitor-alerts':         'new-competitors',
  'collection-gap-finder':         'collection-gaps',
  'ai-nutrition-assistant':        'nutrition',
  'weather-event-forecasting':     'weather',
  'promo-aware-forecast':          'promo',
  'waste-prediction':              'waste',
};
for (const f of out) {
  if (f.status === 'shell') f.shellSlug = SHELL_SLUG[f.slug] || null;
}

if (missing.length) {
  console.error('PATCH is missing entries for archived slugs:', missing.join(', '));
  process.exit(1);
}

const famOrder = Object.values(FAMILY);
out.sort((a, b) =>
  (famOrder.indexOf(a.family) - famOrder.indexOf(b.family)) || a.name.localeCompare(b.name));

const tally = {};
for (const f of out) tally[f.status] = (tally[f.status] || 0) + 1;

const dq = '"';
const header = [
  '/**',
  ' * The CookLyt feature catalogue — one registry, status read from the code.',
  ' *',
  ' * GENERATED by scripts/build-catalogue.mjs. Do not edit by hand; edit the patch',
  ' * table in the generator and re-run. This file is self-contained — the POS repo',
  ' * has no runtime dependency on the archived project it was reconciled from.',
  ' *',
  ' * Reconciles three sources (W1 of the deck-to-product plan):',
  " *   • the deck's 86 features across 10 families and 3 phases,",
  ' *   • the archived project’s 77-feature registry (its statuses were pre-merge),',
  ' *   • the current POS code, which is the only thing that sets real status.',
  ' *',
  ' * `status` is POS-truthful, not the deck’s aspiration:',
  ' *   built        working end-to-end in the POS today',
  ' *   partial      real, but narrower than the deck claims (see note)',
  ' *   shell        honest empty screen on a real route (see plannedFeatures.js)',
  ' *   absent       nothing in the POS implements it',
  ' *   external     lives in the dine-in guest app, a separate repo',
  ' *   blocked-ext  unbuildable here — needs a partner API, hardware, or a network of outlets',
  ' *',
  ' * `archivedStatus` records what the pre-merge registry claimed, so every',
  ' * re-keying (e.g. ai-daily-brief: built → absent) stays auditable in one place.',
  ' *',
  ` * Totals: ${out.length} features — ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}.`,
  ' */',
  '',
  `export const FAMILIES = ${JSON.stringify(Object.values(FAMILY), null, 2)};`,
  '',
  'export const TIERS = {',
  '  base:  { label: ' + dq + 'Base' + dq + ',   price: 3499 },',
  '  mid:   { label: ' + dq + 'Mid' + dq + ',    price: 5499 },',
  '  pro:   { label: ' + dq + 'Pro' + dq + ',    price: 7999 },',
  '  addon: { label: ' + dq + 'Add-on' + dq + ', price: null },',
  '};',
  '',
  `export const CATALOGUE = ${JSON.stringify(out, null, 2)};`,
  '',
  'export const findFeature = (slug) => CATALOGUE.find((f) => f.slug === slug) || null;',
  'export const byFamily = (family) => CATALOGUE.filter((f) => f.family === family);',
  'export const byStatus = (status) => CATALOGUE.filter((f) => f.status === status);',
  '',
].join('\n');

fs.mkdirSync('shared', { recursive: true });
fs.writeFileSync('shared/catalogue.js', header);
console.log(`Wrote shared/catalogue.js — ${out.length} features`);
console.log('Status tally:', JSON.stringify(tally));
