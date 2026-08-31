const llm = require('./llm.client');
const repo = require('./ai.repository');
const settingsRepo = require('../settings/settings.repository');
const complianceService = require('../compliance/compliance.service');
const reputationService = require('../reputation/reputation.service');
const ingredientsService = require('../ingredients/ingredients.service');
const wasteService = require('../waste/waste.service');
const ordersService = require('../orders/orders.service');
const settingsService = require('../settings/settings.service');
const insightsService = require('../insights/insights.service');
const audit = require('../shared/audit');
const { ValidationError, ForbiddenError } = require('../shared/errors');

const WASTE_REASONS = ['SPOILAGE', 'SPILL', 'OVERPREP', 'DAMAGED', 'OTHER'];

// Settings changeable from chat. timezone/currency/cash_denominations are
// excluded deliberately — format-heavy and rarely a conversational request.
const SETTABLE_KEYS = [
  'tax_rate', 'service_charge', 'packaging_fee', 'daily_revenue_target',
  'restaurant_open', 'reservations_enabled', 'loyalty_enabled',
  'staff_assignment_enabled', 'loyalty_points_per_unit', 'loyalty_points_value',
];

// ── Tool schemas (OpenAI function format) ───────────────────────────────────

const days  = { type: 'integer', description: 'How many days back to look (default 7)' };
const limit = { type: 'integer', description: 'Max rows to return' };

const TOOLS = [
  { type: 'function', function: { name: 'get_waste_summary',      description: 'Waste events and total cost grouped by reason (SPOILAGE, SPILL, OVERPREP, DAMAGED, OTHER) over the last N days.', parameters: { type: 'object', properties: { days }, required: [] } } },
  { type: 'function', function: { name: 'get_top_wasted_items',   description: 'Most-wasted ingredients by cost over the last N days, with quantities.', parameters: { type: 'object', properties: { days, limit }, required: [] } } },
  { type: 'function', function: { name: 'get_low_stock',          description: 'Ingredients at or below their reorder level right now, with stock on hand and unit cost.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_inventory_movements', description: 'Stock movements (purchases, sales deductions, waste, adjustments) per ingredient over the last N days.', parameters: { type: 'object', properties: { days }, required: [] } } },
  { type: 'function', function: { name: 'get_recipe_costs',       description: 'Every recipe with its ingredient cost, linked menu price, and food-cost percentage (cost ÷ price). Pass order=worst for thin margins (highest food-cost % first) or order=best for the most profitable items (lowest % first).', parameters: { type: 'object', properties: { order: { type: 'string', enum: ['worst', 'best'], description: 'worst = thin margins first; best = most profitable first' } }, required: [] } } },
  { type: 'function', function: { name: 'get_compliance_status', description: 'The restaurant’s current compliance position: FSSAI licence and its expiry, staff certificates, the testing calendar, today’s hygiene sign-off, shift sign-off coverage, and any drift findings. Use for questions about licences, certificates, audits, hygiene sign-offs or FSSAI. It does NOT contain inspection dates, inspector names, or any schedule set by an authority — CookLyt has no visibility of those, so if asked, say they are not recorded rather than offering a licence or test date in their place.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_reputation', description: 'Guest reviews left through CookLyt and the operator’s manually-recorded search rankings: average rating, the positive/neutral/negative split, complaint themes ranked worst-first, search positions per platform and query, and competitor ratings. Use for questions about ratings, complaints, what guests are saying, search visibility or competitors. The reviews are FIRST-PARTY only — left by guests at a table — and CookLyt cannot see Swiggy, Zomato or Google reviews. The rankings were typed in by the operator and are only as current as the last reading, which the payload states; CookLyt does not read any platform. It contains no guest names, phone numbers or per-guest history.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_sop', description: 'The restaurant’s written standard operating procedure for a topic — opening, closing, allergen-handling, goods-receiving or food-waste. Returns the adopted version, or the built-in template when none has been adopted. Use when asked how something should be done.', parameters: { type: 'object', properties: { slug: { type: 'string', enum: ['opening','closing','allergen-handling','goods-receiving','food-waste'], description: 'Which procedure' } }, required: ['slug'] } } },
  { type: 'function', function: { name: 'get_sales_velocity',     description: 'Best-selling menu items over the last N days: quantity sold, revenue, average per day.', parameters: { type: 'object', properties: { days, limit }, required: [] } } },
  { type: 'function', function: { name: 'get_unit_economics',     description: 'Margin economics over the last N days: revenue, average order value, average per cover (with the share of dine-in bills that recorded a guest count), food-cost % and coverage, labour and prime cost, delivery platform take, operating margin, discounts per order, and service-charge-removed rate. Use for questions about margins, profitability, cost per order, per-cover spend, or the service charge. Figures abstain (report null/“not available”) rather than guessing where a cost or a count is missing — say so instead of inventing a number.', parameters: { type: 'object', properties: { days }, required: [] } } },
  { type: 'function', function: { name: 'get_coupon_economics',  description: 'Per-coupon contribution over the last N days: for each code, orders, discount given, discount rate, and net revenue KEPT per order after the discount and (for delivery redemptions) the platform commission — ranked cheapest-kept first. Use for questions about coupons, discounts, promo codes, or which offer is losing money / paying to be popular. It is net revenue kept, not profit (food cost is not subtracted); say so.', parameters: { type: 'object', properties: { days }, required: [] } } },
  { type: 'function', function: { name: 'get_category_attach',   description: 'Category attach rate over the last N days: items sold per order by category (the “items per cover”/0.1 metric, per order until covers are captured) and % of orders carrying each category, with the change vs the prior equal window. High-margin categories (drinks, desserts) are flagged. Use for questions about attach rate, add-ons, drinks/desserts per order, or upsell penetration.', parameters: { type: 'object', properties: { days }, required: [] } } },
  { type: 'function', function: { name: 'get_peak_hours',        description: 'Orders and revenue by hour of the restaurant’s local day over the last N days, with the busiest and quietest trading hours identified. Use for questions about peak/dead hours, when the restaurant is busiest, or how to staff by time of day.', parameters: { type: 'object', properties: { days }, required: [] } } },
  { type: 'function', function: { name: 'get_recent_orders',      description: 'The most recent orders with status, channel, items, and amount.', parameters: { type: 'object', properties: { limit }, required: [] } } },
  { type: 'function', function: { name: 'get_menu_items',         description: 'Browse the menu. ALWAYS pass the user\'s stated constraints as filters (e.g. "under 200" → max_price: 200) instead of filtering the results yourself. Only use filter values the user explicitly gave — for open-ended requests call with no filters and see the whole menu.', parameters: { type: 'object', properties: { max_price: { type: 'number', description: 'Only items priced at or below this' }, min_price: { type: 'number', description: 'Only items priced at or above this' }, category: { type: 'string', description: 'Exact category name' }, name_contains: { type: 'string', description: 'Partial item name' } }, required: [] } } },
  { type: 'function', function: { name: 'find_ingredient',        description: 'Look up ingredients by (partial) name. Use before update_reorder_level or log_waste to resolve the exact ingredient.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Full or partial ingredient name' } }, required: ['name'] } } },
  { type: 'function', function: { name: 'update_reorder_level',   description: 'WRITE ACTION (user must confirm): change an ingredient\'s reorder level.', parameters: { type: 'object', properties: { ingredient_name: { type: 'string' }, new_level: { type: 'number', description: 'New reorder level in the ingredient\'s unit' } }, required: ['ingredient_name', 'new_level'] } } },
  { type: 'function', function: { name: 'log_waste',              description: `WRITE ACTION (user must confirm): record wasted stock of an ingredient. reason must be one of ${WASTE_REASONS.join(', ')}.`, parameters: { type: 'object', properties: { ingredient_name: { type: 'string' }, quantity: { type: 'number', description: 'Wasted amount in the ingredient\'s unit' }, reason: { type: 'string', enum: WASTE_REASONS }, notes: { type: 'string' } }, required: ['ingredient_name', 'quantity', 'reason'] } } },
  { type: 'function', function: { name: 'get_tables',             description: 'All tables with their number, status (available / occupied / reserved / cleaning), and seats. Check this before placing a dining order.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_active_orders',      description: 'Orders that are not yet paid or cancelled, with order ref, table, items, and amount. Use to find an order before cancelling it.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'place_order',            description: 'WRITE ACTION (user must confirm): place a dining order on a table. Ask the user for the table number and the items with quantities first if you do not have them.', parameters: { type: 'object', properties: { table_number: { type: 'integer' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', description: 'Menu item name' }, quantity: { type: 'integer' }, notes: { type: 'string', description: 'Special instructions, e.g. no onions' } }, required: ['name', 'quantity'] } } }, required: ['table_number', 'items'] } } },
  { type: 'function', function: { name: 'cancel_order',           description: 'WRITE ACTION (user must confirm): cancel an active order. Identify it by order_ref or table_number; if both are missing, use get_active_orders and ask the user which one.', parameters: { type: 'object', properties: { order_ref: { type: 'string', description: 'Order reference like 2606A018' }, table_number: { type: 'integer', description: 'Table the order is on' } }, required: [] } } },
  { type: 'function', function: { name: 'record_purchase',        description: 'WRITE ACTION (user must confirm): record that stock of an ingredient was purchased/arrived — increases stock on hand. Use when the user says they ordered, bought, or received an ingredient.', parameters: { type: 'object', properties: { ingredient_name: { type: 'string' }, quantity: { type: 'number', description: 'Amount received, in the ingredient\'s unit' }, unit_cost: { type: 'number', description: 'Price paid per unit (optional — keeps the current cost if omitted)' } }, required: ['ingredient_name', 'quantity'] } } },
  { type: 'function', function: { name: 'get_settings',           description: 'Current restaurant settings: tax rate, service charge, daily revenue target, loyalty configuration, open/closed state, and more.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'update_setting',         description: `WRITE ACTION (user must confirm): change a restaurant setting. key must be one of: ${SETTABLE_KEYS.join(', ')}. Booleans as 'true'/'false', numbers as plain numbers (e.g. daily_revenue_target: 20000).`, parameters: { type: 'object', properties: { key: { type: 'string', enum: SETTABLE_KEYS }, value: { type: 'string', description: 'The new value, as a string' } }, required: ['key', 'value'] } } },
];

// These actions are admin-only through their normal routers (settings, ingredients),
// so the assistant must not let a non-admin perform them. Enforced both when
// offering tools (below) and again at execution time in confirmAction — the
// /confirm endpoint trusts client-supplied args, so the gate can't live only in
// the proposal step.
const ADMIN_ONLY_TOOLS = new Set(['update_setting', 'update_reorder_level', 'record_purchase']);

function toolsForRole(role) {
  if (role === 'admin') return TOOLS;
  return TOOLS.filter((t) => !ADMIN_ONLY_TOOLS.has(t.function.name));
}

const SYSTEM_PROMPT = `You are CookLyt's assistant for restaurant staff. You answer questions about waste, inventory, recipes, sales, and orders using the provided tools.

Rules:
- Always fetch data through tools — never invent numbers. If a tool returns no rows, say so plainly.
- Be concise. Staff are mid-shift; lead with the answer, use short lists over prose.
- Monetary amounts are in the restaurant's local currency.
- Write actions (changing reorder levels, logging waste) are proposed via tools and the user confirms them in the UI — never claim an action is done unless a tool result says so.
- If an ingredient name is ambiguous, use find_ingredient and ask the user which one they mean.
- Respond to the user's MOST RECENT message only. Earlier questions are settled: never re-fetch their data and never restate their answers.
- For the current question, always fetch fresh data with tools — never answer from memory, general knowledge, or numbers in earlier messages, even if the question looks similar to a previous one.
- Call only the tool(s) the current question needs. One question almost always needs exactly one tool.
- When the user states a constraint (price limit, category, time range), pass it as a tool parameter so the data comes back pre-filtered. Before answering, check every item you list actually satisfies the user's constraints.
- When a tool result says the data is already displayed to the user as a card, reply with at most ONE short sentence containing no numbers from that data. Never list or recite the rows — the user is looking at them. A takeaway that just restates the question ("the worst ones are the ones with the highest percentages") is worse than saying nothing.
- You can place dining orders and cancel orders. Before calling place_order, you need the table number and the items with quantities — ask the user for whatever is missing, one question at a time.
- If the user asks for an action none of your tools can do, say so plainly and mention the closest thing you CAN do. NEVER substitute a different tool or invent arguments to approximate an unsupported request.
- You have no access to anything outside this restaurant's data: no weather, news, holidays, internet, or general real-world facts. If a question depends on any of that — including when it's dressed up as a business question ("should I close early because of the weather tomorrow?") — say plainly that you don't have that information and cannot answer it, even partially. Do not guess, estimate, or invent a plausible-sounding answer to fill the gap. Example: asked about tomorrow's weather, say "I don't have access to weather data" — do not invent a forecast or advise based on one.
- Answer the question that was ASKED, from the field that actually holds it. If a tool result does not contain the specific thing asked for, say it isn't recorded — never substitute a nearby-looking value from a different field and present it as the answer. A licence expiry date is not an inspection date; a next-test due date is not an inspection date; a reorder level is not a stock count. Saying "that isn't in your records" is always correct and always better than a confident answer built from the wrong field.
- When a write tool returns an error with options (occupied table with available alternatives, ambiguous item, multiple matching orders), relay those options to the user and wait for their choice. Do not pick for them.
- Never pass filter values the user did not state. For subjective or open-ended requests ("suggest something", "what's good for a rainy day"), fetch the menu UNFILTERED and pick 3-5 fitting items yourself, with a short reason each.
- If the user shares how they feel, acknowledge it warmly in one sentence, then help with what they need. Don't probe into personal matters — you're a work assistant, not a counselor.`;

// ── Tool execution ───────────────────────────────────────────────────────────

const READ_TOOLS = {
  get_waste_summary:       (rid, a) => repo.getWasteSummary(rid, a.days ?? 7),
  get_top_wasted_items:    (rid, a) => repo.getTopWastedItems(rid, a.days ?? 7, a.limit ?? 10),
  get_low_stock:           (rid)    => repo.getLowStock(rid),
  get_inventory_movements: (rid, a) => repo.getInventoryMovements(rid, a.days ?? 7),
  get_recipe_costs:        (rid, a) => repo.getRecipeCosts(rid, a.order === 'best' ? 'best' : 'worst'),
  get_settings:            (rid)    => settingsRepo.getAll(rid),
  // Both answer strictly from stored compliance records and the operator's own
  // adopted procedures. The model words the answer; it never decides whether a
  // kitchen is compliant.
  get_compliance_status:   (rid)    => complianceService.getOverview(rid),
  // Phase 6. One snapshot covers reviews and rankings because they answer the
  // same question from two sides — what people think of us, and whether they
  // can find us. It deliberately carries no guest names or phone numbers.
  get_reputation:          (rid)    => reputationService.getSnapshot(rid),
  get_sop:                 (rid, a) => complianceService.getSopHistory(rid, a.slug)
    .then((r) => ({ slug: r.slug, adopted: r.versions.length > 0,
                    title: r.versions[0]?.title || r.template.title,
                    content: r.versions[0]?.content || r.template.template,
                    version: r.versions[0]?.version || 0 })),

  get_sales_velocity:      (rid, a) => repo.getSalesVelocity(rid, a.days ?? 7, a.limit ?? 15),
  get_unit_economics:      (rid, a) => insightsService.getEconomics(rid, a.days ?? 30),
  get_coupon_economics:    (rid, a) => insightsService.getCouponEconomics(rid, a.days ?? 30),
  get_category_attach:     (rid, a) => insightsService.getAttachRate(rid, a.days ?? 30),
  get_peak_hours:          (rid, a) => insightsService.getServiceHours(rid, a.days ?? 30),
  get_recent_orders:       (rid, a) => repo.getRecentOrders(rid, a.limit ?? 10),
  // Small models routinely invent filter values for vague requests, hit zero
  // rows, and then either report a dead end or fabricate menu items from
  // training data. Asking the model to retry is unreliable — when filters match
  // nothing, hand it the full menu in the same tool result instead.
  get_menu_items: async (rid, a) => {
    const items = await repo.getMenuItems(rid, { maxPrice: a.max_price, minPrice: a.min_price, category: a.category, nameContains: a.name_contains });
    const filters = Object.fromEntries(
      Object.entries({ max_price: a.max_price, min_price: a.min_price, category: a.category, name_contains: a.name_contains })
        .filter(([, v]) => v !== undefined && v !== null),
    );
    if (!items.length && Object.keys(filters).length) {
      const fullMenu = await repo.getMenuItems(rid, {});
      return {
        note: `No menu items matched ${JSON.stringify(filters)}. Below is the FULL menu instead. Suggest only items from this list — these are the only items that exist.`,
        items: fullMenu,
      };
    }
    return items;
  },
  get_tables:              (rid)    => repo.getTables(rid),
  get_active_orders:       (rid)    => repo.getActiveOrders(rid),
  find_ingredient:         (rid, a) => repo.findIngredientsByName(rid, a.name || ''),
};

async function preparePlaceOrder(restaurantId, args) {
  const tableNumber = Number(args.table_number);
  if (!Number.isInteger(tableNumber)) return { error: 'table_number must be an integer' };
  if (!Array.isArray(args.items) || !args.items.length) return { error: 'items must be a non-empty array' };

  const table = await repo.getTableByNumber(restaurantId, tableNumber);
  if (!table) {
    const tables = await repo.getTables(restaurantId);
    return { error: `There is no table ${tableNumber}`, existingTables: tables.map((t) => t.number) };
  }
  if (table.status !== 'available') {
    const tables = await repo.getTables(restaurantId);
    return {
      error: `Table ${tableNumber} is ${table.status}`,
      availableTables: tables.filter((t) => t.status === 'available').map((t) => `Table ${t.number} (${t.seats} seats)`),
    };
  }

  const resolved = [];
  let total = 0;
  for (const item of args.items) {
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) return { error: `Quantity for "${item.name}" must be a positive integer` };
    const matches = await repo.findMenuItemsByName(restaurantId, item.name || '');
    const exact = matches.find((m) => m.name.toLowerCase() === (item.name || '').toLowerCase());
    const pick = exact || (matches.length === 1 ? matches[0] : null);
    if (!pick) {
      if (!matches.length) return { error: `No menu item matching "${item.name}"` };
      return { error: `"${item.name}" is ambiguous — ask the user which one`, candidates: matches.map((m) => m.name) };
    }
    if (!pick.available) return { error: `${pick.name} is currently unavailable` };
    resolved.push({ menuItemId: pick.id, name: pick.name, quantity: qty, notes: item.notes || null, price: Number(pick.price) });
    total += Number(pick.price) * qty;
  }

  return {
    confirmRequired: true,
    summary: `Place order on Table ${tableNumber}: ${resolved.map((i) => `${i.quantity}× ${i.name}`).join(', ')} — total ${total.toFixed(2)}`,
    tableId: table.id,
    tableNumber,
    items: resolved.map(({ menuItemId, name, quantity, notes }) => ({ menuItemId, name, quantity, notes })),
  };
}

async function prepareCancelOrder(restaurantId, args) {
  const active = await repo.getActiveOrders(restaurantId);
  if (!active.length) return { error: 'There are no active orders to cancel' };

  let candidates = active;
  if (args.order_ref)    candidates = candidates.filter((o) => o.order_ref?.toLowerCase() === String(args.order_ref).toLowerCase());
  if (args.table_number) candidates = candidates.filter((o) => o.table_number === Number(args.table_number));

  if (!candidates.length) {
    return {
      error: 'No active order matches that',
      activeOrders: active.map((o) => `${o.order_ref} (${o.table_number ? `Table ${o.table_number}` : o.channel}, ${o.items || 'no items'}, ${o.amount})`),
    };
  }
  if (candidates.length > 1) {
    return {
      error: 'Multiple active orders match — ask the user which one',
      candidates: candidates.map((o) => `${o.order_ref} (${o.table_number ? `Table ${o.table_number}` : o.channel}, ${o.items || 'no items'}, ${o.amount})`),
    };
  }

  const order = candidates[0];
  return {
    confirmRequired: true,
    summary: `Cancel order ${order.order_ref}${order.table_number ? ` on Table ${order.table_number}` : ''} (${order.items || 'no items'} — ${order.amount})`,
    orderId: order.id,
    orderRef: order.order_ref,
  };
}

// Resolve a write tool's arguments into a concrete, confirmable action.
// Returns { confirmRequired, summary, ...resolved } to halt the loop, or a plain
// object (error / candidates) that goes back to the model as a tool result.
async function prepareUpdateSetting(restaurantId, args) {
  const key = String(args.key || '').toLowerCase();
  if (!SETTABLE_KEYS.includes(key)) {
    return { error: `"${args.key}" cannot be changed from chat. Settable keys: ${SETTABLE_KEYS.join(', ')}` };
  }
  const value = String(args.value ?? '').trim();
  if (!value) return { error: 'value is required' };
  const settings = await settingsRepo.getAll(restaurantId);
  const current = settings[key];
  return {
    confirmRequired: true,
    summary: `Set ${key.replace(/_/g, ' ')} to ${value}${current !== undefined && current !== '' ? ` (currently ${current})` : ''}`,
    key,
    value,
  };
}

async function prepareWriteAction(restaurantId, toolName, args) {
  if (toolName === 'place_order')    return preparePlaceOrder(restaurantId, args);
  if (toolName === 'cancel_order')   return prepareCancelOrder(restaurantId, args);
  if (toolName === 'update_setting') return prepareUpdateSetting(restaurantId, args);

  const matches = await repo.findIngredientsByName(restaurantId, args.ingredient_name || '');
  if (!matches.length) return { error: `No ingredient found matching "${args.ingredient_name}"` };
  if (matches.length > 1) {
    const exact = matches.find((m) => m.name.toLowerCase() === (args.ingredient_name || '').toLowerCase());
    if (!exact) return { error: 'Multiple ingredients match — ask the user which one they mean', candidates: matches.map((m) => m.name) };
    matches[0] = exact;
  }
  const ing = matches[0];

  if (toolName === 'update_reorder_level') {
    const newLevel = Number(args.new_level);
    if (!Number.isFinite(newLevel) || newLevel < 0) return { error: 'new_level must be a non-negative number' };
    return {
      confirmRequired: true,
      summary: `Change reorder level for ${ing.name} from ${ing.reorder_level} to ${newLevel} ${ing.unit}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      newLevel,
    };
  }

  if (toolName === 'record_purchase') {
    const quantity = Number(args.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'quantity must be a positive number' };
    const unitCost = args.unit_cost !== undefined ? Number(args.unit_cost) : null;
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) return { error: 'unit_cost must be a non-negative number' };
    return {
      confirmRequired: true,
      summary: `Record purchase of ${quantity} ${ing.unit} of ${ing.name}${unitCost != null ? ` at ${unitCost}/${ing.unit}` : ''} — stock ${ing.stock_on_hand} → ${(Number(ing.stock_on_hand) + quantity).toFixed(2)}`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      quantity,
      unitCost,
    };
  }

  if (toolName === 'log_waste') {
    const quantity = Number(args.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'quantity must be a positive number' };
    if (!WASTE_REASONS.includes(args.reason)) return { error: `reason must be one of: ${WASTE_REASONS.join(', ')}` };
    return {
      confirmRequired: true,
      summary: `Log ${quantity} ${ing.unit} of ${ing.name} as ${args.reason} waste`,
      ingredientId: ing.id,
      ingredientName: ing.name,
      quantity,
      reason: args.reason,
      notes: args.notes || null,
    };
  }

  return { error: `Unknown write tool: ${toolName}` };
}

async function executeTool(restaurantId, toolName, args) {
  console.log(`[ai] tool_call ${toolName} ${JSON.stringify(args || {})}`);
  if (READ_TOOLS[toolName]) return READ_TOOLS[toolName](restaurantId, args || {});
  return prepareWriteAction(restaurantId, toolName, args || {});
}

// The 8B model tends to re-run the previous turn's tool call and re-narrate its
// answer before addressing the new question (prompt rules don't stop it). Track
// read-tool calls per session; exact repeats within the window get a stub and
// no data card, so settled topics stay settled.
const DUP_WINDOW_MS = 10 * 60 * 1000;
const recentToolCalls = new Map(); // sessionId -> Map(callKey -> timestamp)

function isRepeatCall(sessionId, key) {
  const calls = recentToolCalls.get(sessionId);
  return !!(calls && calls.get(key) && Date.now() - calls.get(key) < DUP_WINDOW_MS);
}

function rememberCalls(sessionId, keys) {
  if (!keys.length) return;
  if (recentToolCalls.size > 500) recentToolCalls.clear(); // crude memory bound
  let calls = recentToolCalls.get(sessionId);
  if (!calls) { calls = new Map(); recentToolCalls.set(sessionId, calls); }
  for (const key of keys) calls.set(key, Date.now());
}

// Repeated read calls still execute (the query is cheap) — the point is to
// suppress the duplicate card and recitation, not to starve follow-up
// questions of the data they need.
const REPEAT_READ_NOTE =
  'You already fetched this exact data in this conversation and the user has seen its card. Do NOT re-show or recite it. Use it to answer the CURRENT question in one short sentence.';

// Config writes the model tends to re-propose with echoed arguments when it has
// no tool for the actual request. Repeating an order or a waste log is a
// legitimate thing to do; repeating an identical setting change is not.
const WRITE_STUB_TOOLS = ['update_setting', 'update_reorder_level'];
const WRITE_REPEAT_STUB = {
  error: 'You already proposed this exact change moments ago. Re-read the user\'s CURRENT message: if it asks for something different and none of your tools can do it, tell the user plainly that you cannot. Do not repeat this proposal.',
};

// Structured payloads for the frontend's data cards. Built from the tool's raw
// rows — exact SQL numbers, independent of how the model narrates them.
async function buildDataCard(restaurantId, toolName, args, result) {
  if (!Array.isArray(result) || !result.length) return null;

  if (toolName === 'get_top_wasted_items' || toolName === 'get_waste_summary') {
    const days = args.days ?? 7;
    const [totalCost, prevCost] = await Promise.all([
      repo.getWasteTotal(restaurantId, days, 0),
      repo.getWasteTotal(restaurantId, days, days),
    ]);
    // A delta against a near-empty previous period is noise (▲465%) — only show
    // it when the baseline is at least a quarter of the current total
    const deltaPct = prevCost >= totalCost * 0.25 && prevCost > 0
      ? Math.round(((totalCost - prevCost) / prevCost) * 100)
      : null;
    const rows = toolName === 'get_top_wasted_items'
      ? result.slice(0, 5).map((r) => ({ label: r.ingredient, cost: Number(r.total_cost) }))
      : result.slice(0, 5).map((r) => ({ label: r.reason.charAt(0) + r.reason.slice(1).toLowerCase(), cost: Number(r.total_cost) }));
    const title = toolName === 'get_top_wasted_items' ? 'Top wasted' : 'Waste by reason';
    return { kind: 'waste', payload: { days, title, totalCost, deltaPct, rows } };
  }
  if (toolName === 'get_low_stock') {
    return { kind: 'stock', payload: { count: result.length, rows: result.slice(0, 6).map((r) => ({ label: r.name, stock: Number(r.stock_on_hand), unit: r.unit })) } };
  }
  if (toolName === 'get_sales_velocity') {
    return { kind: 'sales', payload: { days: args.days ?? 7, rows: result.slice(0, 5).map((r) => ({ label: r.name, qty: r.qty_sold, revenue: Number(r.revenue) })) } };
  }
  if (toolName === 'get_recipe_costs') {
    const rows = result.filter((r) => r.food_cost_pct != null).slice(0, 5);
    if (!rows.length) return null;
    return { kind: 'recipes', payload: { rows: rows.map((r) => ({ label: r.menu_item || r.recipe, pct: Number(r.food_cost_pct) })) } };
  }
  return null;
}

// ── Chat (streaming) ─────────────────────────────────────────────────────────

// Explicit capability manifest, derived from the live TOOLS list so it can't
// drift. Small models improvise around vague boundaries; an enumerated
// can/can't list makes refusals reliable.
const capabilityNoteByRole = new Map();
function capabilities(role) {
  const cacheKey = role === 'admin' ? 'admin' : 'staff';
  if (!capabilityNoteByRole.has(cacheKey)) {
    const names = toolsForRole(role).map((t) => t.function.name);
    const reads  = names.filter((n) => READ_TOOLS[n]).map((n) => n.replace(/^get_/, '').replace(/^find_/, 'look up ').replace(/_/g, ' '));
    const writes = names.filter((n) => !READ_TOOLS[n]).map((n) => n.replace(/_/g, ' '));
    const canChangeSettings = !ADMIN_ONLY_TOOLS.has('update_setting') || role === 'admin';
    capabilityNoteByRole.set(cacheKey,
      `YOUR COMPLETE CAPABILITIES — this list is exhaustive:\n` +
      `- Look up: ${reads.join(', ')}.\n` +
      `- Actions (each shown to the user for confirmation first): ${writes.join(', ')}.\n` +
      (canChangeSettings ? `- Settings you can change: ${SETTABLE_KEYS.join(', ')}.\n` : '') +
      `Everything else is IMPOSSIBLE for you — including (but not limited to): creating or editing menu items and prices, recipes, combos, or coupons; processing payments or refunds; managing reservations; adding or managing staff accounts, shifts, or payroll; sending emails or messages; printers, wifi, or other devices; ` +
      (role === 'admin' ? '' : 'changing restaurant settings, ingredient reorder levels, or recording stock purchases (these are admin-only); ') +
      `anything outside this restaurant's POS data. When asked for any of these, say plainly that you cannot do it and name the closest thing you CAN do. Never improvise with a different tool.`);
  }
  return capabilityNoteByRole.get(cacheKey);
}

// The model has no clock — without this it hallucinates dates from training data.
function dateContext(settings) {
  const timezone = settings.timezone || 'UTC';
  let line;
  try {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(now);
    const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
    const time    = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    line = `It is currently ${weekday}, ${isoDate}, ${time} (${timezone}).`;
  } catch {
    line = `It is currently ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (UTC).`;
  }
  if (settings.currency) line += ` Amounts are in ${settings.currency}.`;
  return line;
}

// ── History compaction ───────────────────────────────────────────────────────
// qwen3's context is small and the system prompt + 15 tool schemas already eat
// a third of it. When the replayed tail outgrows the budget, fold the older
// messages into a model-written summary (kept per session in ai_conversations)
// and replay summary + recent tail — same idea as auto-compaction.

const KEEP_TAIL = 6;                 // most recent messages stay verbatim
const COMPACT_CHAR_BUDGET = 3000;    // ~750 tokens of tail triggers a fold
const COMPACT_MSG_BUDGET = 16;       // or this many tail messages
const FETCH_LIMIT = 60;              // how deep we look past the summary boundary

const tailChars = (msgs) => msgs.reduce((n, m) => n + (m.content?.length || 0), 0);

async function compactHistory(sessionId, restaurantId, userId, oldSummary, toFold) {
  try {
    const result = await llm.chat(
      [
        { role: 'system', content: 'You compact a restaurant POS assistant conversation into a brief memory note (max 120 words, plain text, no preamble). Keep: facts and figures established, actions taken or declined, user preferences, and unresolved threads. Drop pleasantries and repetition.' },
        { role: 'user', content: `${oldSummary ? `Existing summary:\n${oldSummary}\n\n` : ''}Conversation to fold in:\n${toFold.map((m) => `${m.role}: ${m.content}`).join('\n')}` },
      ],
      { maxTokens: 250, temperature: 0.2 },
    );
    const summary = result.content?.trim();
    if (!summary) return null;
    await repo.saveMessage({
      sessionId,
      restaurantId,
      userId,
      role: 'summary',
      content: summary,
      coversUntil: toFold[toFold.length - 1].created_at,
    });
    console.log(`[ai] compacted ${toFold.length} messages for session ${sessionId}`);
    return summary;
  } catch (err) {
    console.error('[ai] compaction failed:', err.message);
    return null;
  }
}

async function buildMessages(sessionId, restaurantId, userId, role, userMessage) {
  const [summaryRow, settings] = await Promise.all([
    repo.getLatestSummary(sessionId, restaurantId),
    settingsRepo.getAll(restaurantId).catch(() => ({})),
  ]);
  let summary = summaryRow?.content || null;
  let tail = await repo.getMessagesSince(sessionId, restaurantId, summaryRow?.covers_until, FETCH_LIMIT);

  if (tail.length > KEEP_TAIL && (tailChars(tail) > COMPACT_CHAR_BUDGET || tail.length > COMPACT_MSG_BUDGET)) {
    const folded = await compactHistory(sessionId, restaurantId, userId, summary, tail.slice(0, tail.length - KEEP_TAIL));
    if (folded) {
      summary = folded;
      tail = tail.slice(tail.length - KEEP_TAIL);
    }
  }

  const system = `${SYSTEM_PROMPT}\n\n${capabilities(role)}\n\n${dateContext(settings)}` +
    (summary ? `\n\nCompacted summary of this conversation so far (older turns):\n${summary}` : '');

  return [
    { role: 'system', content: system },
    ...tail.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: userMessage },
  ];
}

/**
 * One chat turn as an async generator. Yields:
 *   { type: 'text', delta }
 *   { type: 'confirm_required', tool, args, summary }
 *   { type: 'done' }
 * Handles the tool loop internally; persists the user message and final
 * assistant text to ai_conversations.
 */
async function* streamChat({ sessionId, restaurantId, userId, role, message }) {
  if (!sessionId)              throw new ValidationError('sessionId is required');
  if (!message?.trim())        throw new ValidationError('message is required');

  const messages = await buildMessages(sessionId, restaurantId, userId, role, message.trim());
  const tools = toolsForRole(role);
  await repo.saveMessage({ sessionId, restaurantId, userId, role: 'user', content: message.trim() });

  const MAX_ROUNDS = 5;
  let assistantText = '';
  const turnCallKeys = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let roundText = '';
    let toolCalls = null;

    // Low temperature: data answers must be driven by tool results, not sampling
    // creativity — at default temp the model occasionally reuses stale history
    // instead of calling a tool. Avoid 0 exactly (greedy decoding can loop).
    for await (const ev of llm.chatStream(messages, { tools, temperature: 0.2 })) {
      if (ev.type === 'text') {
        roundText += ev.delta;
        yield { type: 'text', delta: ev.delta };
      }
      if (ev.type === 'tool_calls') toolCalls = ev.toolCalls;
    }
    assistantText += roundText;

    if (!toolCalls) break;

    messages.push({ role: 'assistant', content: roundText, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* model sent bad JSON — fall through with {} */ }

      const callKey = `${name}|${JSON.stringify(args)}`;
      const stubbable = !!READ_TOOLS[name] || WRITE_STUB_TOOLS.includes(name);
      const isRepeat = stubbable && isRepeatCall(sessionId, callKey);
      if (stubbable && !isRepeat) turnCallKeys.push(callKey);

      const result = isRepeat
        ? (READ_TOOLS[name]
            ? { note: REPEAT_READ_NOTE, data: await executeTool(restaurantId, name, args) }
            : WRITE_REPEAT_STUB)
        : await executeTool(restaurantId, name, args);

      const card = isRepeat ? null : await buildDataCard(restaurantId, name, args, result);
      if (card) {
        // Don't repeat the big waste-total headline on consecutive waste cards —
        // the second card keeps its rows but drops the duplicate metric header
        if (card.kind === 'waste') {
          if (isRepeatCall(sessionId, '__waste_header')) {
            card.payload.totalCost = null;
            card.payload.deltaPct = null;
          } else {
            turnCallKeys.push('__waste_header');
          }
        }
        yield { type: 'data', kind: card.kind, payload: card.payload };
      }

      // When a card is shown, the model must not recite the same rows as text —
      // wrap the tool result so it comments instead of repeating.
      const toolContent = card
        ? JSON.stringify({
            note: 'This data is ALREADY displayed to the user as a visual card. Reply with at most ONE short sentence: a non-obvious takeaway, anomaly, or next step about THIS data specifically (its top entry is a good anchor). No numbers from this data (the card shows them), no restating the question, no repeating earlier takeaways. If you have nothing genuinely useful to add, reply with an empty string.',
            data: result,
          })
        : JSON.stringify(result ?? null);

      if (result?.confirmRequired) {
        const { confirmRequired, summary, ...resolved } = result;
        if (assistantText.trim()) {
          await repo.saveMessage({ sessionId, restaurantId, userId, role: 'assistant', content: assistantText.trim() });
        }
        // Record the pending proposal so later turns know it was offered, not done
        await repo.saveMessage({ sessionId, restaurantId, userId, role: 'assistant', content: `(Proposed, awaiting the user's confirmation: ${summary})` });
        yield { type: 'confirm_required', tool: name, args: resolved, summary };
        yield { type: 'done' };
        return;
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: toolContent });
    }
  }

  rememberCalls(sessionId, turnCallKeys);
  // Don't persist a takeaway identical to the previous one — duplicates in
  // history compound the echo on later turns
  const prevAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.tool_calls)?.content?.trim();
  if (assistantText.trim() && assistantText.trim() !== prevAssistant) {
    await repo.saveMessage({ sessionId, restaurantId, userId, role: 'assistant', content: assistantText.trim() });
  }
  yield { type: 'done' };
}

// ── Confirmed write execution ────────────────────────────────────────────────

/**
 * Executes a write action the user confirmed in the UI. The args are the
 * resolved payload from the confirm_required event (ingredientId already
 * validated against this restaurant during resolution; services re-check).
 */
async function confirmAction({ sessionId, restaurantId, userId, role, tool, args, confirmed, summary }) {
  if (!confirmed) {
    const message = summary ? `Cancelled: ${summary}` : 'Action cancelled.';
    await repo.saveMessage({ sessionId, restaurantId, userId, role: 'assistant', content: message });
    return { executed: false, message };
  }

  // The /confirm endpoint trusts client-supplied tool+args, so re-check the
  // admin-only gate here rather than relying on the proposal step.
  if (ADMIN_ONLY_TOOLS.has(tool) && role !== 'admin') {
    throw new ForbiddenError('Only an admin can perform this action');
  }

  let result;
  let outcome;

  if (tool === 'update_reorder_level') {
    result = await ingredientsService.update(args.ingredientId, { reorderLevel: args.newLevel }, restaurantId);
    outcome = `Reorder level for ${result.name} set to ${result.reorder_level} ${result.unit}.`;
  } else if (tool === 'log_waste') {
    result = await wasteService.logWaste({
      restaurantId,
      ingredientId: args.ingredientId,
      quantity: args.quantity,
      reason: args.reason,
      notes: args.notes,
      loggedBy: userId,
    });
    outcome = `Logged ${result.quantity} ${result.unit} of ${args.ingredientName} as ${result.reason} (cost ${result.total_cost}).`;
  } else if (tool === 'place_order') {
    result = await ordersService.createOrder({
      restaurantId,
      tableId: args.tableId,
      createdBy: userId,
      items: args.items.map(({ menuItemId, quantity, notes }) => ({ menuItemId, quantity, notes })),
      channel: 'dining',
    });
    outcome = `Order ${result.order_ref} placed on Table ${args.tableNumber} — sent to the kitchen.`;
  } else if (tool === 'cancel_order') {
    await ordersService.updateStatus(args.orderId, 'cancelled', restaurantId);
    outcome = `Order ${args.orderRef} cancelled.`;
  } else if (tool === 'record_purchase') {
    result = await ingredientsService.recordPurchase(
      args.ingredientId,
      { quantity: args.quantity, unitCost: args.unitCost ?? undefined, performedBy: userId },
      restaurantId,
    );
    outcome = `Purchase recorded — ${args.ingredientName} stock is now ${result.stock_on_hand} ${result.unit}.`;
  } else if (tool === 'update_setting') {
    await settingsService.update(args.key, args.value, restaurantId);
    outcome = `Setting updated: ${args.key.replace(/_/g, ' ')} is now ${args.value}.`;
  } else {
    throw new ValidationError(`Unknown write tool: ${tool}`);
  }

  // AI-driven writes hit the same data as the dashboard routes, so they belong in
  // the same audit trail (the /confirm endpoint otherwise leaves no record).
  audit.log({
    actorType: 'user', actorId: userId, restaurantId,
    action: tool === 'cancel_order' ? 'update' : (tool.startsWith('record_') || tool.startsWith('place_') || tool.startsWith('log_') ? 'create' : 'update'),
    resourceType: 'ai_action', resourceId: result?.id ?? args.orderId ?? args.ingredientId ?? null,
    description: `AI assistant: ${outcome}`,
  });

  await repo.saveMessage({ sessionId, restaurantId, userId, role: 'tool', content: outcome, toolName: tool });
  await repo.saveMessage({ sessionId, restaurantId, userId, role: 'assistant', content: outcome });
  return { executed: true, message: outcome };
}

module.exports = { streamChat, confirmAction, TOOLS };
