const crypto = require('crypto');
const repo = require('./guest.repository');
const guestMenuService = require('../guestmenu/guestmenu.service');
const ordersService = require('../orders/orders.service');
const crossSell = require('../modules/menu/cross-sell');
const ws = require('../shared/websocket');

/**
 * The /api/guest/* surface, in the guest app's own terms.
 *
 * This service exists to satisfy a finished, polished client without changing
 * a line of it: the guest app speaks in dish names, an "outlet" id, and a human
 * order number, and this layer translates that to the POS's ids and services.
 * Every response shape here is dictated by what the app parses — see the app's
 * lib/backend.ts — not chosen freshly.
 *
 * It reuses existing POS logic wherever the POS already does the thing (menu
 * dietary derivation, order creation, cross-sell), and only adds new storage for
 * the one capability the POS lacked: the shared-table Joined Cart.
 */

/** A NotFound the router turns into a 404 rather than a 500. */
class OutletNotFound extends Error {}

async function outlet(outletId) {
  const o = await repo.resolveOutlet(outletId);
  if (!o) throw new OutletNotFound();
  return o;
}

// ── Menu ─────────────────────────────────────────────────────────────────────

// Maps the POS's derived diet verdict to the app's boolean veg flag. The POS
// verdict is one of vegan | vegetarian | non_vegetarian | unknown (dietary.js).
// `unknown` is deliberately false: a dish whose ingredients were never declared
// is not asserted vegetarian — the same "don't claim what we can't establish"
// rule the rest of the system follows. This only drives the app's veg filter;
// every dish still shows.
const DIET_IS_VEG = { vegan: true, vegetarian: true, non_vegetarian: false, unknown: false };

/**
 * The live menu in the app's { restaurant, dishes } shape.
 *
 * Delegates dish + dietary derivation to the guest-menu service (the same code
 * that backs the public menu card), then maps to the app's ApiDish. Fields the
 * POS genuinely does not hold — spice level, nutrition — are null, never faked;
 * the app already treats them as optional.
 */
async function getMenu(outletId) {
  const o = await outlet(outletId);
  const menu = await guestMenuService.getGuestMenu(o.id);

  const dishes = (menu.dishes || []).map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description || '',
    price: Number(d.price),
    category: d.category,
    tags: [],
    allergens: Array.isArray(d.allergens) ? d.allergens : [],
    // Derived from declared ingredients; unknown stays non-veg-safe (false), and
    // the app shows dishes either way — this only drives its veg filter.
    isVeg: DIET_IS_VEG[d.diet] ?? false,
    spiceLevel: null,
    ingredients: Array.isArray(d.ingredients) ? d.ingredients : [],
    nutrition: null,
  }));

  return { restaurant: { name: o.name, location: null }, dishes };
}

// ── Affinities ───────────────────────────────────────────────────────────────

/** Mined item-affinity pairs the recommender uses: { pairs: [{a, b, lift}] }. */
async function getAffinities(outletId) {
  const o = await outlet(outletId);
  const lines = await repo.getOrderLinesForAffinities(o.id, 90);
  const { pairs } = crossSell.buildCrossSellMap(lines, 40);
  return { pairs: pairs.map((p) => ({ a: p.a, b: p.b, lift: p.lift })) };
}

// ── Shared table (Joined Cart) ───────────────────────────────────────────────

// A short, unambiguous join code — no 0/O/1/I. Unique per restaurant.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

async function openTable(outletId, { shared, phone }) {
  const o = await outlet(outletId);
  // Retry on the rare collision within a restaurant's active codes.
  let code = makeCode();
  for (let i = 0; i < 5 && await repo.codeExists(o.id, code); i++) code = makeCode();
  const session = await repo.createSession(o.id, code, shared);
  void phone; // reserved for future guest-CRM linkage; not stored presentationally
  return { success: true, visitId: session.id, code: session.code };
}

async function fetchTable(outletId, code) {
  const o = await outlet(outletId);
  const session = await repo.findSessionByCode(o.id, String(code || '').toUpperCase());
  if (!session) return { success: false };
  return { success: true, visitId: session.id, code: session.code, shared: session.doc };
}

async function pushTable(visitId, shared) {
  const updated = await repo.updateSessionDoc(visitId, shared);
  return { success: !!updated };
}

// ── Ordering ─────────────────────────────────────────────────────────────────

/**
 * Place an order the guest built at the table.
 *
 * The app sends items by name and prices nothing itself — "it prices from its
 * own menu" — so we resolve names to menu items, reject the whole order if any
 * dish is no longer available (rather than silently dropping it), create the
 * order through the same service the POS uses, and hand back the human order_ref
 * and the total the POS computed.
 */
async function placeOrder(payload) {
  const o = await outlet(payload.outletId);

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return { error: 'No items in the order' };

  const names = items.map((i) => i.name);
  const { matched, unknown } = await repo.matchDishesByName(o.id, names);
  if (unknown.length) {
    return {
      error: unknown.length === names.length
        ? 'None of these dishes are on the menu right now.'
        : 'Some dishes are no longer on the menu.',
      unknownItems: unknown,
    };
  }

  // A named physical table if the guest is at one (per-table QR); otherwise the
  // outlet's app table, so the order stays genuine dine-in on a real table —
  // the POS requires every dining order to sit on one.
  const table = (await repo.findTableByLabel(o.id, payload.tableLabel))
    || (await repo.findOrCreateAppTable(o.id));

  const orderItems = items.map((line) => {
    const dish = matched.get(String(line.name).trim().toLowerCase());
    return {
      menuItemId: dish.id,
      quantity: Math.max(1, parseInt(line.qty, 10) || 1),
      notes: payload.kitchenNote ? String(payload.kitchenNote).slice(0, 200) : null,
      customizations: {},
    };
  });

  const created = await ordersService.createOrder({
    restaurantId: o.id,
    tableId: table ? table.id : null,
    createdBy: null,
    assignedStaffId: null,
    items: orderItems,
    channel: 'dining',
  });

  // Re-read to get the human order_ref and the priced lines the POS assigned.
  // getById returns the order header without lines, so we read the lines through
  // the same by-ref path the status/receipt endpoints use.
  const order = await ordersService.getById(created.id, o.id);
  const orderRef = order.order_ref || created.id;
  const withItems = await repo.getOrderByRef(o.id, orderRef);
  const total = (withItems?.items || []).reduce(
    (s, it) => s + Number(it.unit_price ?? 0) * Number(it.qty), 0,
  );

  return {
    success: true,
    orderNumber: orderRef,
    total: Math.round(total * 100) / 100,
  };
}

// The kitchen progression the guest is shown, derived from the POS's order and
// item statuses. Ordered most-advanced first.
function kitchenStatusOf(order) {
  if (!order) return null;
  if (order.status === 'paid' || order.status === 'served') return 'served';
  const statuses = (order.items || []).map((i) => i.status);
  if (statuses.length && statuses.every((s) => s === 'served' || s === 'cancelled')) return 'served';
  if (statuses.includes('ready')) return 'ready';
  if (statuses.includes('preparing') || order.status === 'preparing') return 'preparing';
  return 'received';
}

async function orderStatus(outletId, orderNumber) {
  const o = await outlet(outletId);
  const order = await repo.getOrderByRef(o.id, orderNumber);
  if (!order) return { success: false };
  return { success: true, kitchenStatus: kitchenStatusOf(order) };
}

// ── Feedback ─────────────────────────────────────────────────────────────────

/**
 * Capture the guest's rating. Always recorded privately first; the response
 * only invites a public review when the guest is happy AND the outlet has a
 * public review URL configured — which today it does not, so routePublic is
 * always false. That is honest: the app then simply thanks them.
 */
async function submitFeedback(outletId, { aspects, comment, orderNumber }) {
  const o = await outlet(outletId);

  const values = Object.values(aspects || {}).map(Number).filter((n) => n >= 1 && n <= 5);
  const overall = values.length
    ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
    : null;
  if (!overall) return { success: false };

  const order = orderNumber ? await repo.getOrderByRef(o.id, orderNumber) : null;

  await repo.createReview({
    restaurantId: o.id,
    overallRating: overall,
    foodRating: Number(aspects?.food) || null,
    serviceRating: Number(aspects?.service) || null,
    comment: comment ? String(comment).slice(0, 1000) : null,
  });
  void order;

  return { success: true, rating: overall, routePublic: false, reviewUrl: null };
}

// ── Call the server ──────────────────────────────────────────────────────────

/**
 * Raise a "call the server" request from the table. The floor sees it live over
 * the dashboard WebSocket. A bill request also stamps the order so it shows in
 * the ops bill queue, matching the POS's own request-bill behaviour.
 */
async function requestService(outletId, { orderNumber, type }) {
  const o = await outlet(outletId);
  const order = orderNumber ? await repo.getOrderByRef(o.id, orderNumber) : null;
  if (!order) return { success: false };

  if (type === 'bill') await repo.setRequestedBillAt(order.id);

  ws.broadcast('guest_service_request', {
    orderId: order.id,
    orderRef: order.order_ref,
    type,
    at: new Date().toISOString(),
  }, o.id);

  return { success: true };
}

// ── Pay at the table ─────────────────────────────────────────────────────────

/**
 * Record how the guest is settling — no charge is made. Prices from the order's
 * own lines so the amount is the POS's, not the phone's, then marks the order
 * paid so it leaves the floor's open list.
 */
async function settle(outletId, { orderNumber, method, tipAmount, splitMode, splitCount }) {
  const o = await outlet(outletId);
  const order = await repo.getOrderByRef(o.id, orderNumber);
  if (!order) return { success: false };

  const subtotal = (order.items || []).reduce(
    (s, it) => s + Number(it.unit_price || 0) * Number(it.qty), 0,
  );
  const taxRate = await repo.getTaxRate(o.id);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const tip = Number(tipAmount) > 0 ? Math.round(Number(tipAmount) * 100) / 100 : 0;
  const total = Math.round((subtotal + taxAmount + tip) * 100) / 100;

  const validMethod = ['cash', 'card', 'upi'].includes(method) ? method : 'cash';

  await repo.recordPayment(order.id, {
    method: validMethod === 'upi' ? 'mobile' : validMethod, // POS calls UPI "mobile"
    subtotal, taxRate, taxAmount, total, tip,
    tenders: { tip, splitMode: splitMode || null, splitCount: splitCount || null },
  });
  await repo.markOrderPaid(order.id);

  ws.broadcast('order_paid', { orderId: order.id, orderRef: order.order_ref }, o.id);
  return { success: true };
}

// ── Receipt ──────────────────────────────────────────────────────────────────

const PAY_METHOD_OUT = { cash: 'cash', card: 'card', mobile: 'upi' };

async function getReceipt(outletId, orderNumber) {
  const o = await outlet(outletId);
  const order = await repo.getOrderByRef(o.id, orderNumber);
  if (!order) return { success: false };

  const items = (order.items || []).map((it) => ({
    name: it.name,
    qty: Number(it.qty),
    unitPrice: Number(it.unit_price || 0),
    lineTotal: Math.round(Number(it.unit_price || 0) * Number(it.qty) * 100) / 100,
  }));
  const subtotal = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;

  const payment = await repo.getPaymentForOrder(order.id);
  const gst = payment ? Number(payment.tax_amount || 0)
    : Math.round(subtotal * (await repo.getTaxRate(o.id)) * 100) / 100;
  const tip = payment?.tenders?.tip ? Number(payment.tenders.tip) : 0;
  const total = Math.round((subtotal + gst) * 100) / 100;

  return {
    success: true,
    receipt: {
      restaurant: { name: o.name, location: null },
      orderNumber: order.order_ref,
      orderDate: order.created_at,
      items,
      subtotal,
      gst,
      total,
      tip,
      grandTotal: Math.round((total + tip) * 100) / 100,
      paymentMethod: payment ? (PAY_METHOD_OUT[payment.method] || null) : null,
      settledAt: payment ? payment.created_at : null,
      splitMode: payment?.tenders?.splitMode ?? null,
      splitCount: payment?.tenders?.splitCount ?? null,
    },
  };
}

module.exports = {
  OutletNotFound,
  kitchenStatusOf,
  getMenu,
  getAffinities,
  openTable,
  fetchTable,
  pushTable,
  placeOrder,
  orderStatus,
  submitFeedback,
  requestService,
  settle,
  getReceipt,
};
