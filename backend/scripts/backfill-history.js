#!/usr/bin/env node
/**
 * Backfill three months of trading history for a restaurant.
 *
 *   node scripts/backfill-history.js [--days 90] [--restaurant <uuid|name>]
 *                                      [--today] [--dry-run]
 *
 * `seed.js` writes a hand-authored fortnight — enough to see every screen work,
 * not enough for any screen that reasons about *history*. The forecasting family
 * wants fifty-six closed days before it will speak, the anomaly detector wants
 * fourteen before it will judge, food-cost variance wants a stocktake window
 * with real consumption inside it, and the payouts reconciler wants settlements
 * that arrive weekly rather than never. This fills the gap.
 *
 * Four rules this script holds itself to:
 *
 * 1. **Additive and gap-filling.** It writes only days that have no orders yet,
 *    so the fortnight seed.js authored by hand survives untouched and a second
 *    run is a no-op rather than a doubling.
 *
 * 2. **Deterministic.** Every random draw comes from a PRNG seeded by the date,
 *    so the same window always produces the same history. A demo that changes
 *    shape between runs is not a demo you can rehearse against.
 *
 * 3. **Derived, never asserted.** Daily snapshots come from the production
 *    collector (`snapshots.service.collectDay`) reading the orders this script
 *    wrote. Settlements are generated as real CSVs and pushed through the real
 *    upload path (`payouts.service.importSettlement`), so their totals,
 *    variances and findings are whatever the reconciler actually concludes —
 *    including the ones that are unflattering. Stock on hand is recomputed from
 *    the ledger. Nothing here writes a number into a table that the application
 *    would have computed for itself.
 *
 * 4. **Plausible, not tidy.** Real trading is lumpy: weekdays are quieter than
 *    weekends, monsoon moves trade from the dining room to delivery, the
 *    kitchen closes for a deep clean, a supplier raises the price of tomatoes,
 *    a cash drawer comes up short. A history with none of that in it teaches
 *    every downstream feature the wrong lesson.
 */

require('dotenv').config();

const db = require('../src/shared/db');
const { utcFromLocal, localDate, shiftDate: addDays } = require('../src/shared/timezone');
const snapshots = require('../src/snapshots/snapshots.service');
const payouts = require('../src/payouts/payouts.service');

// ── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const DAYS = Number(flag('days', '90'));
const TARGET = flag('restaurant', 'Demo Restaurant');
const DRY_RUN = argv.includes('--dry-run');
// Opt-in on purpose. Everything else in this script only ever writes days that
// are over; today is the one it could get wrong in a way a re-run cannot undo.
const WITH_TODAY = argv.includes('--today');

// ── Trading model ───────────────────────────────────────────────────────────

/** Orders on a flat weekday three months ago. Growth is applied on top. */
const BASE_ORDERS = 15;

/** Where the business is expected to have got to by the end of the window. */
const GROWTH_OVER_WINDOW = 1.35;

/**
 * Monday is the quiet day and Saturday carries the week. These are the shape
 * the forecasting family would eventually have to learn, so they need to be
 * present and consistent rather than noise.
 */
const DOW_MULTIPLIER = [1.28, 0.80, 0.84, 0.92, 1.00, 1.22, 1.42]; // Sun … Sat

/** Cancelled share of orders. Low, but never zero — the cancellation cost card
 *  reads as broken when it is. */
const CANCEL_RATE = 0.03;

const TAX_RATE = 0.05;

/** Dining, takeaway, delivery — before the time-of-day adjustment below. */
const CHANNEL_MIX = { dining: 0.54, takeaway: 0.26, delivery: 0.20 };

/** Delivery's share climbs across the window; dining gives it up. */
const DELIVERY_DRIFT = 0.10;

/** Contracted commission. The generated settlements overcharge against this
 *  occasionally, which is the whole point of the payouts screen. */
const CONTRACT_RATES = { swiggy: 18, zomato: 20 };

const PAY_METHODS = {
  dining:   [['cash', 0.30], ['card', 0.34], ['mobile', 0.36]],
  takeaway: [['cash', 0.44], ['card', 0.20], ['mobile', 0.36]],
  delivery: [['mobile', 1.00]],
};

const WASTE_REASONS = ['SPOILAGE', 'OVERPREP', 'SPILL', 'DAMAGED'];

const SEARCH_QUERIES = [
  ['swiggy', 'biryani near me'],
  ['swiggy', 'north indian'],
  ['zomato', 'best butter chicken'],
  ['zomato', 'family restaurant'],
  ['google', 'restaurants near me'],
];

const COMPETITORS = [
  ['Spice Route', 'swiggy', 4.2],
  ['Curry Leaf Kitchen', 'swiggy', 3.9],
  ['Tandoor Junction', 'zomato', 4.4],
  ['The Copper Pot', 'zomato', 4.0],
];

/**
 * Review comments by theme and sentiment. Written out rather than generated so
 * the keyword classifier has something real to work on — a review corpus of
 * "Great food!" teaches the theme extractor nothing.
 */
const REVIEW_TEXT = {
  positive: [
    'Butter chicken was excellent, and the naan came out hot. Will be back.',
    'Great value for the portion sizes. Staff were quick and friendly.',
    'Best biryani we have had in this area. The raita is very good too.',
    'Lovely atmosphere for a family dinner. Service was attentive without hovering.',
    'Food arrived faster than the estimate and everything was still warm.',
    'The paneer tikka is outstanding. Perfectly charred.',
    'Clean place, polite staff, and the dal makhani was rich without being heavy.',
    'Ordered for a group of eight and every dish landed together. Well handled.',
  ],
  neutral: [
    'Food was fine. Nothing wrong with it, nothing memorable either.',
    'Decent meal but the place was quite loud on a Saturday.',
    'Good food, though the wait for a table was longer than we expected.',
    'Portions are generous. Prices have gone up a bit since last time.',
  ],
  negative: [
    'Waited forty minutes for a table despite booking. Nobody explained why.',
    'The curry was lukewarm by the time it reached us and had to be sent back.',
    'Packaging leaked on the way and half the gravy was in the bag.',
    'Overpriced for what it is. The starter portion was very small.',
    'Wrong order delivered and the staff were slow to acknowledge it.',
    'Table next to the kitchen door was not cleaned properly before we sat down.',
  ],
};

// ── Deterministic randomness ────────────────────────────────────────────────

/** mulberry32 — small, fast, and stable across Node versions. */
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedFromString = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, lo, hi) => lo + r() * (hi - lo);
const intBetween = (r, lo, hi) => Math.floor(between(r, lo, hi + 1));

function weighted(r, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [value, w] of pairs) { if ((x -= w) <= 0) return value; }
  return pairs[pairs.length - 1][0];
}

// ── Timezone ────────────────────────────────────────────────────────────────

// Local-time helpers live in src/shared/timezone.js so seed.js and this script
// cannot disagree about when a trading day starts. `ymd` is kept as a local
// alias because it reads better at the call sites below.
const ymd = localDate;

const dowOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const round2 = (n) => Math.round(n * 100) / 100;

// ── Reference data ──────────────────────────────────────────────────────────

async function loadContext() {
  const { rows: rs } = await db.query(
    `SELECT id, name FROM restaurants WHERE id::text = $1 OR name = $1 LIMIT 1`,
    [TARGET],
  );
  if (!rs[0]) throw new Error(`No restaurant matching "${TARGET}"`);
  const restaurantId = rs[0].id;

  const { rows: settings } = await db.query(
    `SELECT key, value FROM settings WHERE restaurant_id = $1`, [restaurantId],
  );
  const setting = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const tz = setting.timezone || 'UTC';

  const { rows: menu } = await db.query(
    `SELECT id, name, category, price::float AS price, recipe_id
       FROM menu_items
      WHERE restaurant_id = $1 AND available = true AND archived_at IS NULL`,
    [restaurantId],
  );

  const { rows: recipeLines } = await db.query(
    `SELECT ri.recipe_id, ri.ingredient_id, ri.quantity::float AS quantity,
            i.latest_unit_cost::float AS unit_cost
       FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE i.restaurant_id = $1`,
    [restaurantId],
  );
  const recipeIngredients = new Map();
  for (const l of recipeLines) {
    if (!recipeIngredients.has(l.recipe_id)) recipeIngredients.set(l.recipe_id, []);
    recipeIngredients.get(l.recipe_id).push(l);
  }

  const { rows: ingredients } = await db.query(
    `SELECT id, name, unit, latest_unit_cost::float AS cost, perishable, supplier_id
       FROM ingredients WHERE restaurant_id = $1 AND is_active = true`,
    [restaurantId],
  );

  const { rows: tables } = await db.query(
    `SELECT id, seats FROM tables WHERE restaurant_id = $1 ORDER BY number`,
    [restaurantId],
  );

  // The roster's real hourly rates, so the labour half of prime cost is the
  // restaurant's own number rather than one this script invented.
  const { rows: staff } = await db.query(
    `SELECT id, name, role, COALESCE(hourly_rate, 140)::float AS hourly_rate
       FROM users WHERE restaurant_id = $1 AND role <> 'admin' AND is_active = true`,
    [restaurantId],
  );
  const { rows: admins } = await db.query(
    `SELECT id FROM users WHERE restaurant_id = $1 AND role = 'admin' LIMIT 1`,
    [restaurantId],
  );

  const { rows: suppliers } = await db.query(
    `SELECT id, name, lead_time_days FROM suppliers WHERE restaurant_id = $1 AND is_active = true`,
    [restaurantId],
  );

  const { rows: loyalty } = await db.query(
    `SELECT id, phone FROM loyalty_customers WHERE restaurant_id = $1`, [restaurantId],
  );

  return {
    restaurantId, name: rs[0].name, tz,
    taxRate: setting.tax_rate != null ? Number(setting.tax_rate) / 100 : TAX_RATE,
    menu, recipeIngredients, ingredients, tables, staff,
    adminId: admins[0]?.id || null, suppliers, loyalty,
  };
}

// ── The day shape ───────────────────────────────────────────────────────────

/**
 * Deliberate irregularities, keyed off the position in the window rather than
 * off real-world dates. Naming a real festival would mean asserting a date this
 * script has no way to verify; an unexplained quiet Tuesday is just as useful to
 * every consumer downstream and claims nothing that could be wrong.
 */
function dayEvents(idx, total, r) {
  const events = [];
  // Two full closures — a deep clean and a civic shutdown. The anomaly detector
  // treats a closed day as the finding most worth seeing, so there needs to be
  // one to see.
  if (idx === Math.floor(total * 0.22) || idx === Math.floor(total * 0.63)) {
    events.push({ kind: 'closed', mult: 0 });
  }
  // A washout. Dining collapses, delivery picks some of it up.
  if (idx === Math.floor(total * 0.41)) events.push({ kind: 'washout', mult: 0.55 });
  // Two unusually strong days.
  if (idx === Math.floor(total * 0.30) || idx === Math.floor(total * 0.78)) {
    events.push({ kind: 'busy', mult: 1.55 });
  }
  // Low-grade lumpiness so no two weeks look stamped from the same die.
  if (r() < 0.06) events.push({ kind: 'quiet', mult: between(r, 0.72, 0.86) });
  return events;
}

/** Monsoon in the window's middle third: dining down, delivery up. */
function monsoonFactor(iso) {
  const month = Number(iso.slice(5, 7));
  return (month === 6 || month === 7) ? { dining: 0.90, delivery: 1.22 } : { dining: 1, delivery: 1 };
}

function ordersForDay(iso, idx, total, r) {
  const events = dayEvents(idx, total, r);
  if (events.some((e) => e.kind === 'closed')) return { count: 0, events };

  const growth = 1 + (GROWTH_OVER_WINDOW - 1) * (idx / Math.max(total - 1, 1));
  const dow = DOW_MULTIPLIER[dowOf(iso)];
  const noise = between(r, 0.88, 1.12);
  const eventMult = events.reduce((m, e) => m * e.mult, 1);

  return {
    count: Math.max(1, Math.round(BASE_ORDERS * growth * dow * noise * eventMult)),
    events,
  };
}

/** Lunch and dinner peaks, with a thin afternoon between them. */
function orderTime(r) {
  const band = weighted(r, [['lunch', 0.38], ['afternoon', 0.10], ['dinner', 0.52]]);
  if (band === 'lunch') return { hh: intBetween(r, 12, 14), mi: intBetween(r, 0, 59), band };
  if (band === 'afternoon') return { hh: intBetween(r, 15, 18), mi: intBetween(r, 0, 59), band };
  return { hh: intBetween(r, 19, 22), mi: intBetween(r, 0, 59), band };
}

function chooseChannel(r, idx, total, band, iso) {
  const drift = DELIVERY_DRIFT * (idx / Math.max(total - 1, 1));
  const season = monsoonFactor(iso);
  const dining = (CHANNEL_MIX.dining - drift) * season.dining * (band === 'afternoon' ? 0.5 : 1);
  const delivery = (CHANNEL_MIX.delivery + drift) * season.delivery;
  return weighted(r, [['dining', dining], ['takeaway', CHANNEL_MIX.takeaway], ['delivery', delivery]]);
}

/** A basket that looks like something a person would actually order. */
function buildBasket(r, byCategory, channel) {
  const lines = [];
  const add = (item, qty) => {
    if (!item) return;
    const existing = lines.find((l) => l.item.id === item.id);
    if (existing) existing.qty += qty; else lines.push({ item, qty });
  };

  const party = channel === 'dining'
    ? weighted(r, [[1, 0.10], [2, 0.40], [3, 0.20], [4, 0.20], [6, 0.10]])
    : weighted(r, [[1, 0.45], [2, 0.40], [3, 0.15]]);

  const mains = Math.max(1, Math.round(party * between(r, 0.7, 1.05)));
  for (let i = 0; i < mains; i++) add(pick(r, byCategory.Mains), 1);

  if (r() < (channel === 'dining' ? 0.72 : 0.44)) {
    const n = party >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) add(pick(r, byCategory.Starters), 1);
  }
  if (r() < (channel === 'dining' ? 0.66 : 0.38)) {
    add(pick(r, byCategory.Drinks), Math.max(1, Math.round(party * between(r, 0.5, 1.0))));
  }
  if (r() < (channel === 'dining' ? 0.30 : 0.16)) {
    add(pick(r, byCategory.Desserts), party >= 4 ? 2 : 1);
  }
  return { lines, party };
}

// ── Generation ──────────────────────────────────────────────────────────────

async function main() {
  const ctx = await loadContext();
  const {
    restaurantId, tz, taxRate, menu, recipeIngredients,
    ingredients, tables, staff, adminId, suppliers, loyalty,
  } = ctx;

  console.log(`Restaurant : ${ctx.name} (${restaurantId})`);
  console.log(`Timezone   : ${tz}`);
  console.log(`Menu       : ${menu.length} items, ${recipeIngredients.size} costed recipes`);

  const byCategory = {};
  for (const item of menu) {
    const key = /^main/i.test(item.category) ? 'Mains' : item.category;
    (byCategory[key] ||= []).push(item);
  }
  for (const need of ['Mains', 'Starters', 'Drinks', 'Desserts']) {
    if (!byCategory[need]?.length) throw new Error(`Menu has no "${need}" items to draw from`);
  }

  // ── Window ────────────────────────────────────────────────────────────────
  const today = ymd(new Date(), tz);
  const windowStart = addDays(today, -(DAYS - 1));

  const { rows: existing } = await db.query(
    `SELECT DISTINCT (created_at AT TIME ZONE $2)::date::text AS d
       FROM orders WHERE restaurant_id = $1`,
    [restaurantId, tz],
  );
  const alreadyTraded = new Set(existing.map((e) => e.d));

  const days = [];          // days to generate
  const allWindowDays = [];  // every closed day in the window, generated or not
  for (let i = 0; i < DAYS; i++) {
    const iso = addDays(windowStart, i);
    if (iso >= today) break;              // today is live; leave it alone
    allWindowDays.push({ iso, idx: i });
    if (alreadyTraded.has(iso)) continue; // never rewrite a day that has orders
    days.push({ iso, idx: i });
  }

  console.log(`Window     : ${windowStart} → ${addDays(today, -1)} (${DAYS} days)`);
  console.log(`Already traded: ${alreadyTraded.size} day(s) — untouched`);
  console.log(`To generate   : ${days.length} day(s)\n`);

  if (DRY_RUN) { console.log('--dry-run: stopping before any write.'); return; }
  if (!days.length) console.log('No new trading days — running the post-passes only.\n');

  const stats = {
    orders: 0, cancelled: 0, items: 0, revenue: 0, saleTxns: 0,
    reviews: 0, sessions: 0, waste: 0, shifts: 0,
  };
  let written = 0;

  // Order refs continue from whatever the live counter holds.
  const monthSeq = await loadRefSequences(restaurantId);

  function nextOrderRef(instant) {
    const key = `${String(instant.getUTCFullYear()).slice(2)}${String(instant.getUTCMonth() + 1).padStart(2, '0')}`;
    const seq = (monthSeq.get(key) ?? 0) + 1;
    monthSeq.set(key, seq);
    const letter = String.fromCharCode(65 + Math.floor(seq / 1000));
    return `${key}${letter}${String(seq % 1000).padStart(3, '0')}`;
  }

  // ── Day loop ──────────────────────────────────────────────────────────────
  for (const { iso, idx } of days) {
    const r = rng(seedFromString(`${restaurantId}:${iso}`));
    const { count, events } = ordersForDay(iso, idx, DAYS, r);
    const closed = events.some((e) => e.kind === 'closed');

    await db.withTransaction(async (client) => {
      const dayOrders = [];

      for (let n = 0; n < count; n++) {
        const { hh, mi, band } = orderTime(r);
        const at = utcFromLocal(...iso.split('-').map(Number), hh, mi, tz);
        const channel = chooseChannel(r, idx, DAYS, band, iso);
        const { lines, party } = buildBasket(r, byCategory, channel);
        const staffMember = pick(r, staff);
        const table = channel === 'dining' ? pick(r, tables) : null;
        const cancelled = r() < CANCEL_RATE;
        const orderRef = nextOrderRef(at);

        const subtotal = round2(lines.reduce((s, l) => s + l.item.price * l.qty, 0));
        const tax = round2(subtotal * taxRate);
        const total = round2(subtotal + tax);

        // A loyalty member is recognised on roughly a quarter of orders. That
        // fraction is what /guests reports as its coverage — the honest answer
        // to "how many of these could we attribute to anyone at all".
        const member = loyalty.length && r() < 0.26 ? pick(r, loyalty) : null;

        const { rows: [order] } = await client.query(
          `INSERT INTO orders
             (restaurant_id, table_id, created_by, assigned_staff_id, status, created_at,
              channel, order_ref, loyalty_customer_id, table_session_id)
           VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [restaurantId, table?.id ?? null, staffMember.id,
            cancelled ? 'cancelled' : 'paid', at.toISOString(), channel, orderRef,
            member?.id ?? null, channel === 'dining' ? crypto.randomUUID() : null],
        );

        for (const { item, qty } of lines) {
          await client.query(
            `INSERT INTO order_items
               (order_id, menu_item_id, quantity, status, item_name, unit_price)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [order.id, item.id, qty, cancelled ? 'cancelled' : 'served', item.name, item.price],
          );
          stats.items += qty;
        }

        if (cancelled) { stats.cancelled += 1; continue; }

        const method = weighted(r, PAY_METHODS[channel]);
        await client.query(
          `INSERT INTO payments
             (order_id, amount, method, status, created_at, subtotal,
              tax_rate, tax_amount, total_charged)
           VALUES ($1,$2,$3,'completed',$4,$5,$6,$7,$2)`,
          [order.id, total, method, at.toISOString(), subtotal, taxRate, tax],
        );
        stats.orders += 1;
        stats.revenue += total;

        // Ingredient consumption, one row per recipe line — the same shape the
        // live sale path writes, so /variance and /inventory see no difference
        // between a backfilled order and a real one.
        const txns = [];
        for (const { item, qty } of lines) {
          for (const ing of recipeIngredients.get(item.recipe_id) || []) {
            txns.push([ing.ingredient_id, -(ing.quantity * qty), ing.unit_cost, order.id]);
          }
        }
        if (txns.length) {
          const params = [restaurantId, staffMember.id];
          const chunks = [];
          for (const [ingId, delta, cost, ref] of txns) {
            const base = params.length;
            params.push(ingId, delta, cost, ref, at.toISOString());
            chunks.push(`($1,$${base + 1},'SALE',$${base + 2},$${base + 3},$${base + 4},$2,$${base + 5})`);
          }
          await client.query(
            `INSERT INTO inventory_transactions
               (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost,
                ref_id, performed_by, created_at)
             VALUES ${chunks.join(',')}`,
            params,
          );
          stats.saleTxns += txns.length;
        }

        // A dining order occupies a table for a while — this is what /tables
        // learns turnover and peak hours from.
        if (channel === 'dining' && table) {
          const duration = Math.round(between(r, 34, 96));
          await client.query(
            `INSERT INTO table_sessions
               (restaurant_id, table_id, session_id, party_size, started_at, ended_at,
                duration_minutes, had_reservation, item_count, total_amount,
                categories_ordered, ended_reason, created_at)
             VALUES ($1,$2,gen_random_uuid(),$3,$4,$5,$6,$7,$8,$9,$10,'paid',$4)`,
            [restaurantId, table.id, party, at.toISOString(),
              new Date(at.getTime() + duration * 60000).toISOString(), duration,
              r() < 0.18, lines.reduce((s, l) => s + l.qty, 0), total,
              JSON.stringify([...new Set(lines.map((l) => l.item.category))])],
          );
          stats.sessions += 1;
        }

        if (member) {
          await client.query(
            `INSERT INTO loyalty_transactions
               (restaurant_id, customer_id, order_id, type, points, description, created_at)
             VALUES ($1,$2,$3,'earn',$4,$5,$6)`,
            [restaurantId, member.id, order.id, Math.floor(total / 100),
              'Points earned on order', at.toISOString()],
          );
        }

        dayOrders.push({ id: order.id, at, channel, subtotal, total, party, lines, orderRef });
      }

      // ── Reviews ───────────────────────────────────────────────────────────
      for (const o of dayOrders) {
        if (r() > 0.075) continue;
        const sentiment = weighted(r, [['positive', 0.74], ['neutral', 0.15], ['negative', 0.11]]);
        const overall = sentiment === 'positive' ? intBetween(r, 4, 5)
          : sentiment === 'neutral' ? 3 : intBetween(r, 1, 2);
        await client.query(
          `INSERT INTO reviews
             (restaurant_id, table_id, overall_rating, food_rating, service_rating,
              comment, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [restaurantId, null, overall,
            Math.max(1, Math.min(5, overall + intBetween(r, -1, 1))),
            Math.max(1, Math.min(5, overall + intBetween(r, -1, 1))),
            pick(r, REVIEW_TEXT[sentiment]),
            new Date(o.at.getTime() + between(r, 40, 220) * 60000).toISOString()],
        );
        stats.reviews += 1;
      }

      // ── Waste ─────────────────────────────────────────────────────────────
      if (!closed) {
        const perishables = ingredients.filter((i) => i.perishable);
        const n = weighted(r, [[0, 0.42], [1, 0.34], [2, 0.18], [3, 0.06]]);
        for (let i = 0; i < n && perishables.length; i++) {
          const ing = pick(r, perishables);
          const qty = round2(between(r, 0.2, 2.4));
          const at = utcFromLocal(...iso.split('-').map(Number), intBetween(r, 15, 23), intBetween(r, 0, 59), tz);
          await client.query(
            `INSERT INTO waste_logs
               (restaurant_id, ingredient_id, quantity, unit, reason,
                cost_at_time, total_cost, logged_by, logged_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [restaurantId, ing.id, qty, ing.unit, pick(r, WASTE_REASONS),
              ing.cost, round2(ing.cost * qty), pick(r, staff).id, at.toISOString()],
          );
          await client.query(
            `INSERT INTO inventory_transactions
               (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost,
                performed_by, created_at)
             VALUES ($1,$2,'WASTE',$3,$4,$5,$6)`,
            [restaurantId, ing.id, -qty, ing.cost, pick(r, staff).id, at.toISOString()],
          );
          stats.waste += 1;
        }
      }

      // ── Rostered labour ───────────────────────────────────────────────────
      // Without this the prime-cost card on /economics has to withhold its
      // answer, which is correct behaviour but means the card is never seen
      // doing the thing it exists to do.
      if (!closed) {
        const onShift = staff.filter(() => r() < 0.78);
        for (const s of (onShift.length ? onShift : [staff[0]])) {
          await client.query(
            `INSERT INTO staff_shifts
               (restaurant_id, user_id, work_date, hours, hourly_rate, status)
             VALUES ($1,$2,$3,$4,$5,'completed')
             ON CONFLICT DO NOTHING`,
            [restaurantId, s.id, iso, round2(between(r, 6, 9.5)), s.hourly_rate],
          );
          stats.shifts += 1;
        }
      }

      // Cash drawer counts are built in a post-pass instead, from the cash
      // payments actually recorded — see rebuildDrawerCounts.

      // ── Weekly cadence ────────────────────────────────────────────────────
      if (dowOf(iso) === 1) { // Mondays
        for (const [platform, query] of SEARCH_QUERIES) {
          await client.query(
            `INSERT INTO search_ranks
               (restaurant_id, platform, query, position, total_results, recorded_at, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [restaurantId, platform, query,
              Math.max(1, Math.round(between(r, 2, 16))), intBetween(r, 40, 120),
              utcFromLocal(...iso.split('-').map(Number), 10, 30, tz).toISOString(), adminId],
          );
        }
        for (const [nameC, platform, base] of COMPETITORS) {
          await client.query(
            `INSERT INTO competitor_ratings
               (restaurant_id, competitor_name, platform, rating, recorded_at, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [restaurantId, nameC, platform,
              round2(Math.max(3.2, Math.min(4.9, base + between(r, -0.25, 0.25)))),
              utcFromLocal(...iso.split('-').map(Number), 10, 45, tz).toISOString(), adminId],
          );
        }
      }

    });

    written += 1;
    if (written % 15 === 0 || written === days.length) {
      console.log(`  … ${written}/${days.length} days, through ${iso}`);
    }
  }

  // Persist the counters the day loop advanced, so a live order placed after
  // this run continues the sequence rather than colliding with it.
  for (const [yearMonth, seq] of monthSeq) {
    await db.query(
      `INSERT INTO order_counters (restaurant_id, year_month, seq)
       VALUES ($1,$2,$3)
       ON CONFLICT (restaurant_id, year_month)
       DO UPDATE SET seq = GREATEST(order_counters.seq, $3)`,
      [restaurantId, yearMonth, seq],
    );
  }

  console.log('\nReplenishing stock across the window…');
  await restock(ctx, allWindowDays);

  console.log('Reconciling stock on hand from the ledger…');
  await db.query(
    `UPDATE ingredients i SET stock_on_hand = COALESCE((
       SELECT SUM(t.quantity_delta) FROM inventory_transactions t
        WHERE t.ingredient_id = i.id AND t.restaurant_id = i.restaurant_id), 0)
      WHERE i.restaurant_id = $1`,
    [restaurantId],
  );

  let todayStats = { paid: 0, live: 0 };
  if (WITH_TODAY) {
    console.log('Writing today up to the current minute…');
    todayStats = await generateToday(ctx);
  }

  console.log('Rebuilding drawer counts, loyalty balances and supplier links…');
  const ledgers = await reconcileLedgers(ctx, allWindowDays);

  console.log('Building settlements through the real upload path…');
  const settledCount = await buildSettlements(ctx, windowStart, addDays(today, -1));

  console.log('Recording periodic compliance evidence…');
  const complianceRows = await recordCompliance(ctx, allWindowDays);

  // Every closed day in the window, not just the ones this run wrote. A resumed
  // run would otherwise leave the days it skipped without a snapshot.
  console.log('Computing daily snapshots with the production collector…');
  let snapped = 0;
  for (const iso of allWindowDays.map((d) => d.iso)) {
    await snapshots.collectDay(restaurantId, iso);
    snapped += 1;
  }
  // Today gets one too if it traded at all, whoever wrote that trade — seed.js
  // writes today as well, and keying this on "did *this run* write orders" left
  // today's snapshot stale behind a re-seed. It is a partial day and the
  // snapshot says so by being small; the anomaly detector excludes it from
  // judgement by date rather than by trusting it to be complete.
  const { rows: [{ traded }] } = await db.query(
    `SELECT COUNT(*)::int AS traded FROM orders
      WHERE restaurant_id = $1 AND status = 'paid'
        AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [restaurantId, tz, today],
  );
  if (traded > 0) {
    await snapshots.collectDay(restaurantId, today);
    snapped += 1;
  }

  const coverage = await snapshots.getCoverage(restaurantId);

  console.log(`
Done.

  Trading days written   ${days.length}
  Paid orders            ${stats.orders}
  Cancelled orders       ${stats.cancelled}
  Items sold             ${stats.items}
  Revenue                ${Math.round(stats.revenue).toLocaleString('en-IN')}
  Sale ledger rows       ${stats.saleTxns}
  Table sessions         ${stats.sessions}
  Reviews                ${stats.reviews}
  Waste entries          ${stats.waste}
  Rostered shifts        ${stats.shifts}
  Drawer counts          ${ledgers.drawers}
  Loyalty balances set   ${ledgers.loyalty}
  Suppliers assigned     ${ledgers.supplied}
  Clamped orders spread  ${ledgers.unclamped}
  Today paid / in flight ${todayStats.paid} / ${todayStats.live}
  Settlements imported   ${settledCount}
  Compliance records     ${complianceRows}
  Snapshots computed     ${snapped}

  History coverage now   ${coverage.days} of ${coverage.requiredDays} days\
${coverage.ready ? ' — forecasting is unblocked' : ` — ${coverage.remainingDays} short of the forecast gate`}
`);
}

// ── Purchasing ──────────────────────────────────────────────────────────────

/**
 * Replenish weekly, sized so the window ends with a working level of stock.
 *
 * The first cut of this bought back only what the days *this run* generated had
 * consumed, and the ledger still finished deeply negative — because the days
 * seed.js had already written consumed stock too, against an opening balance
 * sized for a fortnight rather than a quarter. Counting demand from the ledger
 * instead of from whatever happened to pass through memory fixes that and makes
 * the pass re-runnable, which is the more useful property.
 *
 * The target is days of cover, not "what was used": a restaurant that ends the
 * quarter on exactly zero of everything is not a restaurant, and /inventory
 * would show every line below its reorder point.
 *
 * The price drift is not decoration either. `cost_spike` is a real rule with
 * nothing to fire on if every ingredient costs the same in August as it did in
 * May, so prices climb gently and one ingredient spikes hard.
 */
const REPLENISH_TAG = 'Backfilled weekly replenishment';

/**
 * Deliberate price shocks, by ingredient and week index.
 *
 * Two, so `cost_spike` has something real to find and the ingredient price
 * history has a story in it — a monsoon tomato spike and a poultry one. Set
 * against a background drift small enough that nothing else crosses the rule's
 * threshold, so a finding here means something happened.
 */
const SPIKES = { Tomatoes: 8, 'Chicken Breast': 5 };
const SPIKE_MULTIPLIER = 2.6;

/**
 * Days of cover to end the window on, by keeping quality.
 *
 * A flat target left every one of thirty-six lines comfortably above its
 * reorder point, which is not what a store room looks like on any real
 * Thursday — and it made the reorder screen and the low-stock rail permanently
 * empty. Perishables are bought tight because they spoil; dry goods are bought
 * deep because they do not. Ordering that way is what puts a handful of lines
 * near the line at any moment, which is the state those screens exist for.
 */
const COVER_DAYS = { perishable: [4, 9], dry: [11, 22] };

async function restock(ctx, windowDays) {
  const { restaurantId, tz, ingredients, suppliers, adminId } = ctx;
  if (!windowDays.length || !suppliers.length) return;

  const first = windowDays[0].iso;
  const last = windowDays[windowDays.length - 1].iso;

  // Idempotent: drop what a previous run of this pass wrote before sizing the
  // next one, so quantities converge instead of compounding.
  // A price baseline that does not move between runs.
  //
  // The drift and the spikes were multiplied against `ingredients.latest_unit_cost`,
  // which this pass itself rewrites — so each run compounded on the last and
  // chicken reached two thousand rupees a kilo over three runs. The earliest
  // recorded price for an ingredient is the one figure here that no run of this
  // script moves, which makes it the only safe anchor.
  const { rows: baselines } = await db.query(
    `SELECT DISTINCT ON (ingredient_id) ingredient_id, cost_per_unit::float AS cost
       FROM ingredient_prices WHERE restaurant_id = $1
      ORDER BY ingredient_id, recorded_at ASC`,
    [restaurantId],
  );
  const baseCost = new Map(baselines.map((b) => [b.ingredient_id, b.cost]));
  const costOf = (ing) => baseCost.get(ing.id) ?? ing.cost;

  // Every historical purchase this pass writes also updates
  // `ingredients.latest_unit_cost`, and migration 076 puts an AFTER UPDATE
  // trigger on that column which records a price row stamped `now()`. Left
  // alone it wrote a second, present-dated copy of every one of three hundred
  // historical prices — thirteen hundred rows all landing in the same three
  // minutes. That flattens the price history into a single instant, and
  // `cost_spike` (which compares an ingredient's two most recent prices) then
  // has nothing separated in time to compare.
  //
  // The trigger is right for the application and wrong for a backfill, which
  // knows the date each price actually applied. So it is switched off for the
  // duration and the rows are written explicitly with their real dates.
  const suppressPriceTrigger = async (fn) => {
    await db.query('ALTER TABLE ingredients DISABLE TRIGGER ingredients_record_price_trg');
    try { await fn(); } finally {
      await db.query('ALTER TABLE ingredients ENABLE TRIGGER ingredients_record_price_trg');
    }
  };

  // `source` is constrained to manual/invoice/purchase/baseline, so it cannot
  // double as a tag for this pass. The price rows are matched on the receipt
  // timestamps of the orders being removed instead.
  await db.withTransaction(async (client) => {
    await client.query(
      `DELETE FROM ingredient_prices
        WHERE restaurant_id = $1 AND source = 'purchase'
          AND recorded_at IN (SELECT received_at FROM purchase_orders
                               WHERE restaurant_id = $1 AND notes = $2
                                 AND received_at IS NOT NULL)`,
      [restaurantId, REPLENISH_TAG],
    );
    await client.query(
      `DELETE FROM inventory_transactions
        WHERE restaurant_id = $1 AND txn_type = 'PURCHASE'
          AND ref_id IN (SELECT id::text FROM purchase_orders
                          WHERE restaurant_id = $1 AND notes = $2)`,
      [restaurantId, REPLENISH_TAG],
    );
    await client.query(
      `DELETE FROM purchase_orders WHERE restaurant_id = $1 AND notes = $2`,
      [restaurantId, REPLENISH_TAG],
    );
  });

  // Demand and current position, both read back out of the ledger.
  const { rows: demand } = await db.query(
    `SELECT ingredient_id,
            SUM(CASE WHEN txn_type IN ('SALE','WASTE') THEN -quantity_delta ELSE 0 END)::float AS used
       FROM inventory_transactions
      WHERE restaurant_id = $1
        AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY ingredient_id`,
    [restaurantId, tz, first, last],
  );
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const leadDays = Math.max(...suppliers.map((s) => Number(s.lead_time_days) || 3));

  const weeks = [...new Set(windowDays.map((d) => addDays(d.iso, -((dowOf(d.iso) + 6) % 7))))].sort();

  // The two shocked ingredients are still expensive as of the latest delivery.
  //
  // Without this the `cost_spike` rule has nothing to find. It compares an
  // ingredient's two most recent prices, and seed.js writes its entire price
  // history within three minutes of itself at seed-run time — so every
  // ingredient's "previous" and "current" price are the same afternoon, and the
  // historical spikes further back never enter the comparison. A price rise
  // that has not reached the current delivery is not a rise the operator can do
  // anything about, so the honest version is a spike that is still on.
  // Stamped at the actual current moment, not earlier: seed.js writes its own
  // baseline price row at seed-run time, and a spike dated before that reads as
  // a price *fall* when the rule compares the two most recent rows.
  const nowish = new Date();
  await suppressPriceTrigger(async () => {
    for (const name of Object.keys(SPIKES)) {
      const ing = ingredients.find((i) => i.name === name);
      if (!ing) continue;
      const elevated = round2(costOf(ing) * SPIKE_MULTIPLIER);
      await db.query(
        `INSERT INTO ingredient_prices
           (restaurant_id, ingredient_id, cost_per_unit, source, recorded_at)
         VALUES ($1,$2,$3,'purchase',$4)`,
        [restaurantId, ing.id, elevated, nowish.toISOString()],
      );
      await db.query(
        `UPDATE ingredients SET latest_unit_cost = $3 WHERE id = $2 AND restaurant_id = $1`,
        [restaurantId, ing.id, elevated],
      );
    }
  });

  // Reorder levels were set by hand for a fortnight of trade at a lower volume,
  // and after a quarter of growth they sit so far below the shelf that no line
  // is ever flagged. An operator would have raised them; this raises them the
  // way /procurement already explains the number — usage across the supplier's
  // lead time, plus two days of slack.
  for (const { ingredient_id: id, used } of demand) {
    if (!byId.has(id) || used <= 0) continue;
    const perDay = used / windowDays.length;
    await db.query(
      `UPDATE ingredients SET reorder_level = $3, reorder_qty = $4
        WHERE id = $2 AND restaurant_id = $1`,
      [restaurantId, id,
        round2(perDay * (leadDays + 2)),
        round2(perDay * 7)],
    );
  }

  // Week-by-week usage, so the ordering below can be simulated rather than
  // averaged. Spreading one total evenly across every week and rounding each
  // slice up to a whole unit quietly over-buys every low-volume line — enough
  // that not one of thirty-six ingredients ever finished near its reorder
  // point, which is not a store room, it is a warehouse.
  const { rows: weekly } = await db.query(
    `SELECT ingredient_id,
            to_char((created_at AT TIME ZONE $2)::date
                      - (EXTRACT(ISODOW FROM (created_at AT TIME ZONE $2))::int - 1),
                    'YYYY-MM-DD') AS week_start,
            SUM(CASE WHEN txn_type IN ('SALE','WASTE') THEN -quantity_delta ELSE 0 END)::float AS used
       FROM inventory_transactions
      WHERE restaurant_id = $1
        AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY 1, 2`,
    [restaurantId, tz, first, last],
  );
  const usageByWeek = new Map(); // `${ingId}:${weekStart}` → qty
  for (const w of weekly) usageByWeek.set(`${w.ingredient_id}:${w.week_start}`, w.used);

  // Opening position — what was on the shelf before any of this trade.
  //
  // Not "the ledger before the window": seed.js dates its opening-stock
  // purchase two days before the earliest order, which after the first backfill
  // is *inside* this window. Reading it that way returned nothing for every
  // ingredient, so the simulation began from an empty store and dutifully
  // ordered a minimum unit of tea leaves every week for a quarter.
  //
  // The ledger with this pass's purchases already removed, plus everything the
  // window consumed, is the position before trading started — which is the
  // number wanted here.
  const { rows: standing } = await db.query(
    `SELECT ingredient_id, SUM(quantity_delta)::float AS net
       FROM inventory_transactions WHERE restaurant_id = $1 GROUP BY 1`,
    [restaurantId],
  );
  const usedInWindow = new Map(demand.map((d) => [d.ingredient_id, d.used]));
  const stock = new Map(
    standing.map((o) => [o.ingredient_id, o.net + (usedInWindow.get(o.ingredient_id) ?? 0)]),
  );

  // Per-ingredient cover target and trigger, both stable across runs.
  const plan = new Map();
  for (const { ingredient_id: id, used } of demand) {
    const ing = byId.get(id);
    if (!ing || used <= 0) continue;
    const cr = rng(seedFromString(`${restaurantId}:cover:${id}`));
    const [lo, hi] = COVER_DAYS[ing.perishable ? 'perishable' : 'dry'];
    const perDay = used / windowDays.length;
    plan.set(id, { perDay, cover: perDay * between(cr, lo, hi), trigger: perDay * (leadDays + 2) });
  }

  await suppressPriceTrigger(async () => {
  for (const [wIdx, weekStart] of weeks.entries()) {
    const r = rng(seedFromString(`${restaurantId}:po:${weekStart}`));
    const supplier = pick(r, suppliers);
    const at = utcFromLocal(...weekStart.split('-').map(Number), 9, 0, tz);
    const lines = [];

    for (const [ingId, { cover, trigger }] of plan) {
      const ing = byId.get(ingId);
      const onHand = stock.get(ingId) ?? 0;
      const usedThisWeek = usageByWeek.get(`${ingId}:${weekStart}`) ?? 0;

      // Order only when the week would otherwise run the line past its trigger
      // — the same question the reorder screen asks.
      const projected = onHand - usedThisWeek;
      if (projected > trigger) { stock.set(ingId, projected); continue; }

      // Half-unit granularity. Forcing a whole unit is what turned a line using
      // twenty grams of tea a day into a fifteen-kilo order — suppliers sell
      // half a kilo, and a spice line is exactly where that matters.
      const qty = Math.max(0.5, Math.ceil((cover + usedThisWeek - onHand) * 2) / 2);
      stock.set(ingId, projected + qty);

      // Gentle. The `cost_spike` rule fires above a 15% rise, and the first cut
      // of this drifted 14% across the window with 5% weekly jitter on top —
      // which put nearly every ingredient over the line and raised forty-six
      // cost-spike alerts out of fifty-one findings. An alert list that is
      // ninety per cent one rule is a list nobody reads.
      const drift = 1 + 0.08 * (wIdx / Math.max(weeks.length - 1, 1));
      const spike = SPIKES[ing.name] === wIdx ? SPIKE_MULTIPLIER : 1;
      const unitCost = round2(costOf(ing) * drift * spike * between(r, 0.985, 1.015));

      lines.push({ ingredientId: ingId, name: ing.name, qty, unit: ing.unit, unitCost });
    }
    if (!lines.length) continue;

    const total = round2(lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0));

    await db.withTransaction(async (client) => {
      const { rows: [po] } = await client.query(
        `INSERT INTO purchase_orders
           (restaurant_id, supplier_id, status, received_at, lines, total, notes, created_by, created_at)
         VALUES ($1,$2,'received',$3,$4,$5,$6,$7,$3) RETURNING id`,
        [restaurantId, supplier.id, at.toISOString(), JSON.stringify(lines),
          total, REPLENISH_TAG, adminId],
      );

      for (const l of lines) {
        await client.query(
          `INSERT INTO inventory_transactions
             (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost,
              ref_id, performed_by, created_at)
           VALUES ($1,$2,'PURCHASE',$3,$4,$5,$6,$7)`,
          [restaurantId, l.ingredientId, l.qty, l.unitCost, po.id, adminId, at.toISOString()],
        );
        await client.query(
          `INSERT INTO ingredient_prices
             (restaurant_id, ingredient_id, cost_per_unit, source, recorded_at)
           VALUES ($1,$2,$3,'purchase',$4)`,
          [restaurantId, l.ingredientId, l.unitCost, at.toISOString()],
        );
        await client.query(
          `UPDATE ingredients SET latest_unit_cost = $3 WHERE id = $2 AND restaurant_id = $1`,
          [restaurantId, l.ingredientId, l.unitCost],
        );
      }
    });
  }
  });
}

/**
 * The next free order-ref sequence per year-month, read from the refs in use.
 *
 * `order_counters` is not a safe source for this: a generator that mints refs
 * without writing the counter back leaves it stale, and the next run then
 * collides with orders it wrote itself. The refs already in the table cannot be
 * stale by definition.
 */
async function loadRefSequences(restaurantId) {
  const { rows } = await db.query(
    `SELECT SUBSTRING(order_ref FROM 1 FOR 4) AS ym,
            MAX((SUBSTRING(order_ref FROM 5 FOR 1))::text) AS letter,
            MAX(CAST(SUBSTRING(order_ref FROM 6 FOR 3) AS INTEGER)) AS seq
       FROM orders
      WHERE restaurant_id = $1 AND order_ref ~ '^[0-9]{4}[A-Z][0-9]{3}$'
      GROUP BY 1`,
    [restaurantId],
  );
  const map = new Map();
  for (const r of rows) {
    const block = (r.letter.charCodeAt(0) - 65) * 1000;
    map.set(r.ym, block + Number(r.seq));
  }
  return map;
}

// ── Today ───────────────────────────────────────────────────────────────────

/** Service starts at noon. Nothing is written before it. */
const SERVICE_OPENS_AT = 12;

/** How far back from now the still-in-flight orders reach. */
const LIVE_WINDOW_MINUTES = 35;

/**
 * Today, up to this minute — and no further.
 *
 * Opt-in (`--today`) rather than automatic, and it refuses if today already has
 * orders. Fabricating trade over a real day is the one mistake in this script
 * that could not be undone by re-running it, and a cron that quietly did so
 * would be inventing a restaurant's takings.
 *
 * Two things make this different from a backfilled day:
 *
 * 1. **It stops at the clock.** A day is only as far along as it actually is,
 *    so at quarter past three there is a lunch service and no dinner. Writing a
 *    whole day's takings onto a day half over is exactly the partial-day lie
 *    the anomaly detector was fixed to stop telling.
 *
 * 2. **Not everything is finished.** The last half hour is left in flight —
 *    tickets in the kitchen, tabs open on occupied tables, a queue at the door.
 *    Those states are what the live-ops rail, the kitchen screen and the floor
 *    plan exist to show, and a day where every order is already paid leaves all
 *    three looking broken.
 */
async function generateToday(ctx) {
  const {
    restaurantId, tz, taxRate, menu, recipeIngredients, tables, staff, loyalty,
  } = ctx;

  const now = new Date();
  const iso = ymd(now, tz);

  // Two separate questions, because seed.js also writes today and writes every
  // order as already paid. "Today has orders" is not a reason to do nothing —
  // a day where nothing is in flight leaves the kitchen screen, the floor plan
  // and the live-ops rail all looking broken. So: settled trade is left alone
  // if it exists, and the live layer is added if it is missing.
  const { rows: [counts] } = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled'))::int AS live
       FROM orders
      WHERE restaurant_id = $1 AND (created_at AT TIME ZONE $2)::date = $3::date`,
    [restaurantId, tz, iso],
  );
  if (counts.live > 0) {
    console.log(`  ${iso} already has ${counts.live} order(s) in flight — left alone.`);
    return { paid: 0, live: 0 };
  }
  const settledExists = counts.total > 0;
  if (settledExists) {
    console.log(`  ${iso} has ${counts.total} settled order(s) — adding the live layer only.`);
  }

  const byCategory = {};
  for (const item of menu) {
    const key = /^main/i.test(item.category) ? 'Mains' : item.category;
    (byCategory[key] ||= []).push(item);
  }

  // Where the clock is in the trading day, as a share of the hours that would
  // normally have traded by now.
  const openAt = utcFromLocal(...iso.split('-').map(Number), SERVICE_OPENS_AT, 0, tz);
  const minutesOpen = Math.max(0, (now - openAt) / 60000);
  if (minutesOpen < 20) {
    console.log('  Service has barely opened — nothing to write yet.');
    return { paid: 0, live: 0 };
  }

  const r = rng(seedFromString(`${restaurantId}:today:${iso}`));

  // A full day at this point in the window, scaled to the share of trade that
  // normally lands before now. Lunch is the smaller of the two services.
  const fullDay = Math.round(BASE_ORDERS * GROWTH_OVER_WINDOW * DOW_MULTIPLIER[dowOf(iso)]);
  const lunchShare = Math.min(1, minutesOpen / (3 * 60)) * 0.38;
  const target = Math.max(1, Math.round(fullDay * lunchShare * between(r, 0.9, 1.1)));

  const liveFrom = new Date(now.getTime() - LIVE_WINDOW_MINUTES * 60000);
  const stats = { paid: 0, live: 0 };
  const occupied = new Set();

  await db.withTransaction(async (client) => {
    const monthSeq = await loadRefSequences(restaurantId);
    const nextRef = (at) => {
      const key = `${String(at.getUTCFullYear()).slice(2)}${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
      const seq = (monthSeq.get(key) ?? 0) + 1;
      monthSeq.set(key, seq);
      return `${key}${String.fromCharCode(65 + Math.floor(seq / 1000))}${String(seq % 1000).padStart(3, '0')}`;
    };

    // A few extra beyond the settled count, which become the in-flight ones.
    const inFlight = Math.max(3, Math.round(target * 0.35));
    const settledToWrite = settledExists ? 0 : target;

    for (let i = 0; i < settledToWrite + inFlight; i++) {
      const live = i >= settledToWrite;
      const at = live
        ? new Date(liveFrom.getTime() + r() * Math.max(1, now.getTime() - 60000 - liveFrom.getTime()))
        : new Date(openAt.getTime() + r() * Math.max(1, liveFrom.getTime() - openAt.getTime()));

      const channel = live
        ? weighted(r, [['dining', 0.62], ['takeaway', 0.20], ['delivery', 0.18]])
        : weighted(r, [['dining', 0.52], ['takeaway', 0.28], ['delivery', 0.20]]);
      const { lines, party } = buildBasket(r, byCategory, channel);
      const staffMember = pick(r, staff);

      // A live dining order holds a table; a settled one has released it.
      let table = null;
      if (channel === 'dining') {
        const free = tables.filter((t) => !occupied.has(t.id));
        table = free.length ? pick(r, free) : pick(r, tables);
        if (live) occupied.add(table.id);
      }

      const subtotal = round2(lines.reduce((s, l) => s + l.item.price * l.qty, 0));
      const tax = round2(subtotal * taxRate);
      const total = round2(subtotal + tax);
      const member = loyalty.length && r() < 0.26 ? pick(r, loyalty) : null;

      // 'served' is a tab still open — food delivered, bill not settled.
      const status = live
        ? weighted(r, [['preparing', 0.34], ['ready', 0.22], ['served', 0.28], ['received', 0.16]])
        : 'paid';
      const itemStatus = live
        ? (status === 'served' ? 'served' : status === 'ready' ? 'ready' : 'pending')
        : 'served';

      const { rows: [order] } = await client.query(
        `INSERT INTO orders
           (restaurant_id, table_id, created_by, assigned_staff_id, status, created_at,
            channel, order_ref, loyalty_customer_id, table_session_id)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [restaurantId, table?.id ?? null, staffMember.id, status, at.toISOString(),
          channel, nextRef(at), member?.id ?? null,
          channel === 'dining' ? crypto.randomUUID() : null],
      );

      for (const { item, qty } of lines) {
        await client.query(
          `INSERT INTO order_items
             (order_id, menu_item_id, quantity, status, item_name, unit_price)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.id, item.id, qty, itemStatus, item.name, item.price],
        );
      }

      if (live) { stats.live += 1; continue; }

      await client.query(
        `INSERT INTO payments
           (order_id, amount, method, status, created_at, subtotal,
            tax_rate, tax_amount, total_charged)
         VALUES ($1,$2,$3,'completed',$4,$5,$6,$7,$2)`,
        [order.id, total, weighted(r, PAY_METHODS[channel]),
          new Date(at.getTime() + between(r, 30, 70) * 60000).toISOString(),
          subtotal, taxRate, tax],
      );
      stats.paid += 1;

      const txns = [];
      for (const { item, qty } of lines) {
        for (const ing of recipeIngredients.get(item.recipe_id) || []) {
          txns.push([ing.ingredient_id, -(ing.quantity * qty), ing.unit_cost, order.id]);
        }
      }
      if (txns.length) {
        const params = [restaurantId, staffMember.id];
        const chunks = [];
        for (const [ingId, delta, cost, ref] of txns) {
          const base = params.length;
          params.push(ingId, delta, cost, ref, at.toISOString());
          chunks.push(`($1,$${base + 1},'SALE',$${base + 2},$${base + 3},$${base + 4},$2,$${base + 5})`);
        }
        await client.query(
          `INSERT INTO inventory_transactions
             (restaurant_id, ingredient_id, txn_type, quantity_delta, unit_cost,
              ref_id, performed_by, created_at)
           VALUES ${chunks.join(',')}`,
          params,
        );
      }

      if (channel === 'dining' && table) {
        const duration = Math.round(between(r, 34, 85));
        await client.query(
          `INSERT INTO table_sessions
             (restaurant_id, table_id, session_id, party_size, started_at, ended_at,
              duration_minutes, had_reservation, item_count, total_amount,
              categories_ordered, ended_reason, created_at)
           VALUES ($1,$2,gen_random_uuid(),$3,$4,$5,$6,$7,$8,$9,$10,'paid',$4)`,
          [restaurantId, table.id, party, at.toISOString(),
            new Date(at.getTime() + duration * 60000).toISOString(), duration, r() < 0.18,
            lines.reduce((s, l) => s + l.qty, 0), total,
            JSON.stringify([...new Set(lines.map((l) => l.item.category))])],
        );
      }

      if (member) {
        await client.query(
          `INSERT INTO loyalty_transactions
             (restaurant_id, customer_id, order_id, type, points, description, created_at)
           VALUES ($1,$2,$3,'earn',$4,'Points earned on order',$5)`,
          [restaurantId, member.id, order.id, Math.floor(total / 100), at.toISOString()],
        );
      }

      // A couple of lunch guests leave feedback before they leave.
      if (r() < 0.12) {
        const sentiment = weighted(r, [['positive', 0.72], ['neutral', 0.17], ['negative', 0.11]]);
        const overall = sentiment === 'positive' ? intBetween(r, 4, 5)
          : sentiment === 'neutral' ? 3 : intBetween(r, 1, 2);
        await client.query(
          `INSERT INTO reviews
             (restaurant_id, overall_rating, food_rating, service_rating, comment, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [restaurantId, overall,
            Math.max(1, Math.min(5, overall + intBetween(r, -1, 1))),
            Math.max(1, Math.min(5, overall + intBetween(r, -1, 1))),
            pick(r, REVIEW_TEXT[sentiment]),
            new Date(at.getTime() + between(r, 50, 110) * 60000).toISOString()],
        );
      }
    }

    for (const [yearMonth, seq] of monthSeq) {
      await client.query(
        `INSERT INTO order_counters (restaurant_id, year_month, seq)
         VALUES ($1,$2,$3)
         ON CONFLICT (restaurant_id, year_month) DO UPDATE SET seq = $3`,
        [restaurantId, yearMonth, seq],
      );
    }

    // The floor plan reads occupancy off the table, not off the orders.
    if (occupied.size) {
      await client.query(
        `UPDATE tables SET status = 'occupied', occupied_at = $3
          WHERE restaurant_id = $1 AND id = ANY($2::uuid[])`,
        [restaurantId, [...occupied], new Date(now.getTime() - 25 * 60000).toISOString()],
      );
    }

    // Mid-service, the roster is working rather than finished.
    for (const s of staff) {
      await client.query(
        `INSERT INTO staff_shifts
           (restaurant_id, user_id, work_date, hourly_rate, status, clock_in_at)
         VALUES ($1,$2,$3,$4,'active',$5)
         ON CONFLICT DO NOTHING`,
        [restaurantId, s.id, iso, s.hourly_rate, openAt.toISOString()],
      );
    }
    await client.query(
      `UPDATE users SET is_present = true WHERE restaurant_id = $1 AND role <> 'admin'`,
      [restaurantId],
    );

    // A short queue at the door, which is what the waitlist rail is for.
    // Only if there isn't one already — this ran twice and put the same two
    // parties in the queue twice, which is exactly the sort of thing a demo
    // gets caught on.
    const { rows: [{ waiting }] } = await client.query(
      `SELECT COUNT(*)::int AS waiting FROM waitlist
        WHERE restaurant_id = $1 AND status = 'waiting'`,
      [restaurantId],
    );
    if (waiting === 0) {
      const waitingNames = ['Rohit M.', 'Sneha & family'];
      for (const [i, name] of waitingNames.entries()) {
        await client.query(
          `INSERT INTO waitlist
             (restaurant_id, guest_name, party_size, status, joined_at, estimated_wait_minutes)
           VALUES ($1,$2,$3,'waiting',$4,$5)`,
          [restaurantId, name, intBetween(r, 2, 5),
            new Date(now.getTime() - (18 - i * 9) * 60000).toISOString(),
            i === 0 ? intBetween(r, 10, 20) : null],
        );
      }
    }
  });

  return stats;
}

// ── Derived ledgers ─────────────────────────────────────────────────────────

/**
 * Three things the day loop cannot get right on its own, all rebuilt from what
 * the ledger actually holds.
 *
 * Each was a defect found by opening the page rather than by reading the code:
 * every drawer count came up short (nought balanced out of seventy-one), the
 * loyalty balances disagreed with their own transactions by thousands of
 * points, and thirty-five of thirty-six ingredients had no supplier so the
 * reorder screen could not say who to order from.
 */
async function reconcileLedgers(ctx, windowDays) {
  const { restaurantId, tz, staff, suppliers } = ctx;
  const out = { drawers: 0, loyalty: 0, supplied: 0, unclamped: 0 };
  if (!windowDays.length) return out;

  const first = windowDays[0].iso;
  const last = windowDays[windowDays.length - 1].iso;

  // ── Cash drawers ──────────────────────────────────────────────────────────
  // Expected cash is the cash actually taken, not a guess at it. Most nights a
  // drawer balances to the rupee; the interesting report is the one where the
  // exceptions stand out, and a variance column that is never zero has no
  // exceptions in it — only noise.
  await db.query(
    `DELETE FROM shift_counts
      WHERE restaurant_id = $1
        AND (counted_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`,
    [restaurantId, tz, first, last],
  );

  const { rows: cashDays } = await db.query(
    `SELECT (o.created_at AT TIME ZONE $2)::date::text AS iso,
            SUM(p.amount)::float AS cash
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1 AND p.method = 'cash' AND o.status = 'paid'
        AND (o.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      GROUP BY 1 ORDER BY 1`,
    [restaurantId, tz, first, last],
  );

  for (const { iso, cash } of cashDays) {
    if (!(cash > 0)) continue;
    const r = rng(seedFromString(`${restaurantId}:drawer:${iso}`));
    // Balanced most nights; a small slip sometimes; a real shortfall rarely.
    const roll = r();
    const drift = roll < 0.70 ? 0
      : roll < 0.93 ? Math.round(between(r, -60, 60))
        : Math.round(between(r, -900, 400));
    await db.query(
      `INSERT INTO shift_counts
         (restaurant_id, counted_by, counted_at, expected_cash, actual_cash, variance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [restaurantId, pick(r, staff).id,
        utcFromLocal(...iso.split('-').map(Number), 23, 15, tz).toISOString(),
        round2(cash), round2(cash + drift), round2(drift),
        Math.abs(drift) >= 100 ? 'Counted twice, difference stands.' : null],
    );
    out.drawers += 1;
  }

  // ── Orders clamped to a single minute ─────────────────────────────────────
  // seed.js caps any order it would have scheduled in the future to "two
  // minutes ago", so every Day-0 order meant for later in the day lands on the
  // instant the seed ran. On this database that put twenty-six orders on one
  // minute, doubled that day's takings against its neighbours, and made 5 pm
  // look like the busiest hour the restaurant has.
  //
  // Only the timestamps move. The orders, their items and their payments are
  // left exactly as seeded — this spreads them back across the service hours
  // they were written for.
  const { rows: clusters } = await db.query(
    `SELECT date_trunc('minute', created_at) AS minute, COUNT(*)::int AS n
       FROM orders
      WHERE restaurant_id = $1
      GROUP BY 1 HAVING COUNT(*) >= 8`,
    [restaurantId],
  );

  for (const { minute } of clusters) {
    const { rows: stuck } = await db.query(
      `SELECT id FROM orders
        WHERE restaurant_id = $1 AND date_trunc('minute', created_at) = $2
        ORDER BY order_ref`,
      [restaurantId, minute],
    );
    const iso = ymd(new Date(minute), tz);
    const r = rng(seedFromString(`${restaurantId}:unclamp:${iso}`));

    for (const { id } of stuck) {
      const { hh, mi } = orderTime(r);
      const at = utcFromLocal(...iso.split('-').map(Number), hh, mi, tz);
      // Never move an order into the future.
      const safe = at > new Date() ? new Date(Date.now() - 60000) : at;
      await db.query(
        `UPDATE orders SET created_at = $3 WHERE id = $2 AND restaurant_id = $1`,
        [restaurantId, id, safe.toISOString()],
      );
      await db.query(
        `UPDATE payments SET created_at = $2 WHERE order_id = $1 AND created_at IS NOT NULL`,
        [id, safe.toISOString()],
      );
    }
    out.unclamped += stuck.length;
    await snapshots.collectDay(restaurantId, iso);
  }

  // ── Loyalty balances ──────────────────────────────────────────────────────
  // The stored balance had drifted thousands of points from the transactions
  // beneath it, which is the one thing a points ledger must never do.
  const { rowCount: loyalty } = await db.query(
    `UPDATE loyalty_customers c
        SET points_balance = COALESCE((
              SELECT SUM(CASE WHEN t.type = 'redeem' THEN -t.points ELSE t.points END)
                FROM loyalty_transactions t WHERE t.customer_id = c.id), 0)
      WHERE c.restaurant_id = $1`,
    [restaurantId],
  );
  out.loyalty = loyalty;

  // ── Supplier links ────────────────────────────────────────────────────────
  // Without one the reorder screen knows an ingredient is short and cannot say
  // who to buy it from, which is half an answer.
  if (suppliers.length) {
    const { rows: unsupplied } = await db.query(
      `SELECT id FROM ingredients
        WHERE restaurant_id = $1 AND supplier_id IS NULL AND is_active = true`,
      [restaurantId],
    );
    for (const { id } of unsupplied) {
      const r = rng(seedFromString(`${restaurantId}:supplier:${id}`));
      await db.query(
        `UPDATE ingredients SET supplier_id = $3 WHERE id = $2 AND restaurant_id = $1`,
        [restaurantId, id, pick(r, suppliers).id],
      );
      out.supplied += 1;
    }
  }

  return out;
}

// ── Settlements ─────────────────────────────────────────────────────────────

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * Generate a real aggregator settlement file per platform per week, and import
 * it through the real upload path.
 *
 * Writing settlement rows straight into the table would have been three lines
 * shorter and worth nothing: every figure on /payouts — the variance, the
 * recoverable total, the findings — is produced by the reconciler, and a
 * settlement that never met the reconciler proves none of it works. So the
 * file is built, deliberately imperfect in the ways real files are, and handed
 * to `importSettlement` to make of what it will.
 */
async function buildSettlements(ctx, windowStart, windowEnd) {
  const { restaurantId, tz, adminId } = ctx;

  // Through the service, not the table: contracts are stored as a fraction and
  // `saveContract` is what knows that. Writing the percent straight in
  // overflowed NUMERIC(5,4) — which is the column doing its job.
  for (const [platform, ratePct] of Object.entries(CONTRACT_RATES)) {
    await payouts.saveContract(restaurantId, platform, ratePct, adminId);
  }

  // Which weeks already have a settlement on file — so a second run adds
  // nothing rather than importing the same period twice.
  //
  // Keyed on the file name, not on period_start. The importer derives the
  // period from the rows it could actually read, so a week whose first delivery
  // lands on the Tuesday gets a period_start of Tuesday and never matches the
  // Monday key this loop iterates on. That mismatch silently re-imported seven
  // settlements on the second run before it was caught.
  const { rows: done } = await db.query(
    `SELECT file_name FROM settlements WHERE restaurant_id = $1`, [restaurantId],
  );
  const settled = new Set(done.map((d) => d.file_name));

  const { rows: deliveries } = await db.query(
    // Aliased to camelCase deliberately: the CSV builder below reads
    // `o.orderRef`, and when this query returned the raw snake_case column
    // every platform order id came out as "SWIGGY-undefined". The unique index
    // on (restaurant_id, platform_order_id) then collapsed three hundred and
    // ninety-one order rows into two, while the settlement totals stayed
    // correct — so nothing looked wrong until the drilldown was counted.
    `SELECT o.order_ref AS "orderRef",
            (o.created_at AT TIME ZONE $2)::date::text AS iso,
            p.amount::float AS total
       FROM orders o
       JOIN payments p ON p.order_id = o.id AND p.status = 'completed'
      WHERE o.restaurant_id = $1
        AND o.channel = 'delivery'
        AND o.status = 'paid'
        AND (o.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      ORDER BY o.created_at`,
    [restaurantId, tz, windowStart, windowEnd],
  );

  const deliveryByWeek = new Map();
  for (const d of deliveries) {
    const weekStart = addDays(d.iso, -((dowOf(d.iso) + 6) % 7));
    if (!deliveryByWeek.has(weekStart)) deliveryByWeek.set(weekStart, []);
    deliveryByWeek.get(weekStart).push(d);
  }

  let imported = 0;
  for (const [weekStart, orders] of [...deliveryByWeek].sort()) {
    if (orders.length < 4) continue;
    const r = rng(seedFromString(`${restaurantId}:settle:${weekStart}`));

    // Split the week's deliveries between the two aggregators.
    const split = { swiggy: [], zomato: [] };
    orders.forEach((o) => split[r() < 0.58 ? 'swiggy' : 'zomato'].push(o));

    for (const [platform, rows] of Object.entries(split)) {
      if (rows.length < 2) continue;
      const fileName = `${platform}_settlement_${weekStart}.csv`;
      if (settled.has(fileName)) continue;

      // Most weeks bill at the contracted rate. Some do not — and the ones that
      // do not are the only reason anybody opens this screen.
      const overcharged = r() < 0.3;
      const effective = CONTRACT_RATES[platform] + (overcharged ? between(r, 2.5, 4.5) : 0);

      const header = platform === 'swiggy'
        ? ['order_id', 'order_date', 'gross_order_value', 'commission', 'TDS 194O',
          'TCS 52', 'sla_penalty', 'restaurant_borne_discount', 'platform_borne_discount',
          'refund', 'net_payout', 'status']
        : ['order_id', 'order_date', 'subtotal', 'commission', 'tds', 'tcs',
          'penalty', 'restaurant_discount', 'zomato_discount', 'refund',
          'net_payout', 'status'];

      const lines = [header.map(csvCell).join(',')];
      for (const [i, o] of rows.entries()) {
        const gross = round2(o.total);
        const commission = round2(gross * effective / 100);
        const tds = round2(gross * 0.01);
        const tcs = round2(gross * 0.01);
        const penalty = r() < 0.06 ? round2(between(r, 25, 90)) : 0;
        const restDisc = r() < 0.22 ? round2(gross * between(r, 0.05, 0.12)) : 0;
        const platDisc = r() < 0.30 ? round2(gross * between(r, 0.05, 0.15)) : 0;
        const refunded = r() < 0.04;
        const refund = refunded ? gross : 0;
        const net = round2(gross - commission - tds - tcs - penalty - restDisc - refund);

        const [y, m, d] = o.iso.split('-');
        const dateCell = platform === 'swiggy' ? `${d}/${m}/${y}` : o.iso;

        // A handful of rows in every real file cannot be read. Leaving them out
        // would make the "rows we could not read" counter permanently zero and
        // that part of the screen untested.
        if (i === 2 && r() < 0.5) {
          lines.push([`${platform.toUpperCase()}-${o.orderRef}`, '31/02/2026', gross,
            commission, tds, tcs, penalty, restDisc, platDisc, refund, net, 'delivered']
            .map(csvCell).join(','));
          continue;
        }

        lines.push([
          `${platform.toUpperCase()}-${o.orderRef}`, dateCell, gross, commission, tds, tcs,
          penalty, restDisc, platDisc, refund, net,
          refunded ? 'refunded' : 'delivered',
        ].map(csvCell).join(','));
      }

      try {
        await payouts.importSettlement(restaurantId, {
          buffer: Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
          fileName, platform, userId: adminId,
        });
        imported += 1;
      } catch (err) {
        console.warn(`  settlement ${fileName} rejected: ${err.message}`);
      }
    }
  }
  return imported;
}

// ── Compliance ──────────────────────────────────────────────────────────────

async function recordCompliance(ctx, days) {
  const { restaurantId, tz } = ctx;
  if (!days.length) return 0;

  const TESTS = [
    ['water_potability', 'Water potability test', 180],
    ['food_sample_lab', 'Food sample lab test', 180],
    ['pest_control', 'Pest control service', 90],
    ['kitchen_deep_clean', 'Kitchen deep clean', 30],
  ];

  let written = 0;
  for (const [id, label, cadence] of TESTS) {
    // One record inside the window for each, so /compliance shows a history
    // rather than a column of "never".
    const at = days[Math.floor(days.length * 0.35)].iso;
    const { rowCount } = await db.query(
      `INSERT INTO compliance_docs
         (restaurant_id, doc_type, title, metadata, valid_from, valid_until, signed_by, signed_at)
       SELECT $1,'test_record',$2,$3,$4,$5,'Admin',$6
        WHERE NOT EXISTS (
          SELECT 1 FROM compliance_docs
           WHERE restaurant_id = $1 AND doc_type = 'test_record'
             AND metadata->>'testId' = $7 AND valid_from = $4)`,
      [restaurantId, label, JSON.stringify({ testId: id, cadenceDays: cadence }),
        at, addDays(at, cadence), utcFromLocal(...at.split('-').map(Number), 11, 0, tz).toISOString(), id],
    );
    written += rowCount;
  }
  return written;
}

main()
  .then(() => db.close())
  .catch(async (err) => {
    console.error('\nbackfill failed:', err);
    await db.close();
    process.exit(1);
  });
