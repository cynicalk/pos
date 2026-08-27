const express = require('express');
const cors = require('cors');
const db = require('../shared/db');
const menuRepo = require('../menu/menu.repository');
const guestMenuService = require('../guestmenu/guestmenu.service');
const ordersService = require('../orders/orders.service');
const ws = require('../shared/websocket');
const { currencies } = require('../../../shared/settings-options.json');

const authRepo = require('../auth/auth.repository');
const restaurantsRepo = require('../restaurants/restaurants.repository');
const settingsRepo = require('../settings/settings.repository');
const waitlistService = require('../waitlist/waitlist.service');
const { rateLimit } = require('../shared/middleware/rateLimit');
const { asyncHandler } = require('../shared/asyncHandler');

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: (req) => `pin:${req.params.restaurantId}:${req.ip}`,
  message: 'Too many PIN attempts, please try again later',
});

const tableStaffLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: (req) => `pin:${req.params.tableId}:${req.ip}`,
  message: 'Too many PIN attempts, please try again later',
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many requests, please try again later',
});

// Joining the waitlist is keyed per restaurant-token + IP so one device can't
// flood a venue's queue, while different guests at the door are unaffected.
const waitlistJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `wl:${req.body?.restaurantToken || req.ip}:${req.ip}`,
  message: 'Too many requests, please try again later',
});

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Key per table (not just per IP) so one table can't be flooded with reviews
  // from rotating IPs by editing the tableId in the URL.
  key: (req) => `review:${req.body?.tableId || req.ip}`,
  message: 'Too many requests, please try again later',
});

// Guests poll their waitlist status repeatedly. Key per entry-token (the
// capability) so rotating IPs can't bypass it; generous ceiling (~1 poll / 7.5s)
// since the handler is read-only, this just caps abuse of the queue computation.
const waitlistPollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  key: (req) => `wl-poll:${req.params.token}`,
  message: 'Too many requests, please try again later',
});

const router = express.Router();
// Allow any origin — customers scan from mobile phones on any network
router.use(cors({ origin: '*' }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// IMPORTANT: the `:tableId` route params and `tableId` body fields below are the
// table's PUBLIC TOKEN (tables.public_token), NOT its internal primary key. The
// QR URL only ever carries the token; the internal id is never exposed. Each
// handler resolves the token to the real table and uses table.id for DB writes,
// order lookups, and WebSocket payloads (the dashboard keys on the internal id).

// Resolve a table by its public token, but only if the restaurant is active.
// Returns { id, number, restaurant_id, assigned_staff_id } (id = internal PK)
// or null. Every public WRITE action goes through this so a deactivated
// restaurant stops accepting orders, bills, reviews, and staff assignments.
async function getActiveTable(token) {
  const { rows } = await db.query(
    `SELECT t.id, t.number, t.restaurant_id, t.assigned_staff_id
     FROM tables t JOIN restaurants r ON r.id = t.restaurant_id
     WHERE t.public_token = $1 AND r.is_active = true`,
    [token],
  );
  return rows[0] || null;
}

// GET /api/public/table/:tableId
// Returns table + restaurant info for the customer-facing menu page
router.get('/table/:tableId', asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  if (!UUID_RE.test(tableId)) return res.status(404).json({ error: 'Table not found' });

  const { rows } = await db.query(
    `SELECT t.number AS table_number, t.status, t.seats,
            r.id AS restaurant_id, r.name AS restaurant_name,
            COALESCE(cur.value, 'USD') AS currency_code,
            COALESCE(sae.value, 'false') AS staff_assignment_enabled,
            COALESCE(tax.value, '0')::numeric AS tax_rate,
            COALESCE(sc.value,  '0')::numeric AS service_charge,
            CASE WHEN u.id IS NOT NULL THEN COALESCE(u.name, u.email) END AS assigned_staff_name
     FROM tables t
     JOIN restaurants r ON r.id = t.restaurant_id
     LEFT JOIN users u   ON u.id  = t.assigned_staff_id
     LEFT JOIN settings cur ON cur.restaurant_id = t.restaurant_id AND cur.key = 'currency'
     LEFT JOIN settings sae ON sae.restaurant_id = t.restaurant_id AND sae.key = 'staff_assignment_enabled'
     LEFT JOIN settings tax ON tax.restaurant_id = t.restaurant_id AND tax.key = 'tax_rate'
     LEFT JOIN settings sc  ON sc.restaurant_id  = t.restaurant_id AND sc.key  = 'service_charge'
     WHERE t.public_token = $1`,
    [tableId],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Table not found' });

  const row = rows[0];
  const currencyInfo = currencies.find((c) => c.code === row.currency_code)
    || currencies.find((c) => c.code === 'USD');

  res.json({
    ...row,
    staff_assignment_enabled: row.staff_assignment_enabled === 'true',
    tax_rate:       parseFloat(row.tax_rate)       || 0,
    service_charge: parseFloat(row.service_charge) || 0,
    currency: {
      code: currencyInfo.code,
      symbol: currencyInfo.symbol,
      rate: currencyInfo.rate,
      decimals: currencyInfo.decimals,
      // Digit grouping is per currency, and the guest menu formats prices
      // client-side — without this it falls back to grouping in threes and a
      // rupee price on the table QR disagrees with the same price on the till.
      locale: currencyInfo.locale,
    },
  });
}));

// GET /api/public/menu/:restaurantId
// Returns all available menu items for the restaurant
router.get('/menu/:restaurantId', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  if (!UUID_RE.test(restaurantId)) return res.status(404).json({ error: 'Not found' });
  const items = await menuRepo.getAvailable(restaurantId);
  res.json(items);
}));

// GET /api/public/menu/:restaurantId/card
// The Phase 7 guest menu card: dish names and descriptions in the guest's
// language, dietary verdicts derived from declared ingredients, and ingredient
// disclosure. Mounted here rather than on /api/guestmenu so it inherits this
// router's CORS policy and no-auth contract — the table QR flow has no login.
//
// This path never calls a model: translations are served from cache and dietary
// verdicts from declared data. A guest sitting at a table must not wait on one.
router.get('/menu/:restaurantId/card', asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  if (!UUID_RE.test(restaurantId)) return res.status(404).json({ error: 'Not found' });
  const avoid = req.query.avoid ? String(req.query.avoid).split(',') : [];
  res.json(await guestMenuService.getGuestMenu(restaurantId, {
    language: req.query.language,
    diet: req.query.diet || null,
    avoid,
  }));
}));

// GET /api/public/staff/verify-pin/:restaurantId/:pin
// Returns staff display name if PIN is valid for this restaurant
router.get('/staff/verify-pin/:restaurantId/:pin', pinLimiter, asyncHandler(async (req, res) => {
  const { restaurantId, pin } = req.params;
  if (!UUID_RE.test(restaurantId) || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const staff = await authRepo.findUserByPin(restaurantId, pin);
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  res.json({ id: staff.id, name: staff.name || staff.email.split('@')[0] });
}));

// PATCH /api/public/table/:tableId/staff
// Assigns a staff member to a table by PIN — no order required
router.patch('/table/:tableId/staff', tableStaffLimiter, asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  const { staffPin } = req.body;
  if (!UUID_RE.test(tableId)) return res.status(404).json({ error: 'Table not found' });
  if (!staffPin || !/^\d{4}$/.test(String(staffPin))) {
    return res.status(400).json({ error: 'Invalid staff PIN' });
  }

  const table = await getActiveTable(tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  const restaurantId = table.restaurant_id;

  const staff = await authRepo.findUserByPin(restaurantId, String(staffPin));
  if (!staff) return res.status(404).json({ error: 'Staff not found' });

  await db.query('UPDATE tables SET assigned_staff_id = $1 WHERE id = $2', [staff.id, table.id]);
  ws.broadcast('TABLE_UPDATED', { tableId: table.id }, restaurantId);

  // Notify the self-assigned staff member AND all admins
  const staffName = staff.name || staff.email.split('@')[0];
  const assignPayload = { tableId: table.id, tableNumber: table.number ?? null, staffName };
  ws.broadcastToRolesOrUser('STAFF_ASSIGNED', assignPayload, restaurantId, ['admin'], staff.id);

  res.json({ success: true, name: staffName });
}));

// POST /api/public/orders
// Body: { tableId, items: [{menuItemId, quantity, notes?}], staffPin? }
// Table UUID is the implicit authorization — only someone at the table can scan the QR
router.post('/orders', orderLimiter, asyncHandler(async (req, res) => {
  const { tableId, items, staffPin } = req.body;
  if (!tableId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'tableId and items are required' });
  }
  if (!UUID_RE.test(tableId)) return res.status(404).json({ error: 'Table not found' });

  const table = await getActiveTable(tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const restaurantId = table.restaurant_id;

  // Resolve staffPin → assignedStaffId (silently ignored if invalid)
  let assignedStaffId = null;
  if (staffPin && /^\d{4}$/.test(String(staffPin))) {
    const staff = await authRepo.findUserByPin(restaurantId, String(staffPin));
    if (staff) assignedStaffId = staff.id;
  }

  const order = await ordersService.createOrder({
    restaurantId,
    tableId: table.id,
    createdBy: null,
    assignedStaffId,
    items: items.map((i) => ({
      menuItemId: String(i.menuItemId),
      quantity: Math.max(1, parseInt(i.quantity) || 1),
      notes: i.notes ? String(i.notes).slice(0, 200) : null,
      customizations: i.customizations && typeof i.customizations === 'object' ? i.customizations : {},
    })),
    channel: 'dining',
  });

  res.status(201).json({ orderId: order.id });
}));

// GET /api/public/orders/table/:tableId
// Returns active (non-paid, non-cancelled) orders for this table
router.get('/orders/table/:tableId', asyncHandler(async (req, res) => {
  const { tableId } = req.params;
  if (!UUID_RE.test(tableId)) return res.status(404).json({ error: 'Table not found' });

  const { rows: tableRows } = await db.query(
    'SELECT id FROM tables WHERE public_token = $1',
    [tableId],
  );
  if (!tableRows[0]) return res.status(404).json({ error: 'Table not found' });
  const internalTableId = tableRows[0].id;

  const { rows } = await db.query(
    `SELECT o.id, o.status, o.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'name',     COALESCE(oi.item_name, mi.name),
                  'quantity', oi.quantity,
                  'price',    COALESCE(oi.unit_price, mi.price),
                  'notes',    oi.notes
                ) ORDER BY mi.name
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'::json
            ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
     WHERE o.table_id = $1 AND o.status NOT IN ('paid', 'cancelled')
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [internalTableId],
  );
  res.json(rows);
}));

// POST /api/public/orders/:orderId/cancel
// Cancels order if status is still 'received'; tableId in body acts as auth
router.post('/orders/:orderId/cancel', orderLimiter, asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { tableId } = req.body;
  if (!UUID_RE.test(orderId) || !UUID_RE.test(tableId)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // tableId is the public token — resolve it to the internal id, which is
  // what orders.table_id references.
  const { rows: t } = await db.query('SELECT id FROM tables WHERE public_token = $1', [tableId]);
  if (!t[0]) return res.status(404).json({ error: 'Order not found' });

  const { rows } = await db.query(
    'SELECT id, status FROM orders WHERE id = $1 AND table_id = $2',
    [orderId, t[0].id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  if (rows[0].status !== 'received') {
    return res.status(409).json({ error: 'Cannot cancel — preparation has already started' });
  }

  await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
  res.json({ success: true });
}));

// POST /api/public/request-bill
// Customer requests the bill; broadcasts a WS notification to staff
router.post('/request-bill', orderLimiter, asyncHandler(async (req, res) => {
  const { tableId } = req.body;
  if (!tableId || !UUID_RE.test(tableId)) {
    return res.status(400).json({ error: 'tableId is required' });
  }

  const table = await getActiveTable(tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const { number: tableNumber, restaurant_id: restaurantId, assigned_staff_id: staffId } = table;

  // Persist the request so the ETA engine can shorten this table's estimate and
  // the session log can record when the bill was asked for. Stamp only the
  // first time (don't overwrite an earlier request) across all active orders.
  await db.query(
    `UPDATE orders SET requested_bill_at = NOW()
     WHERE table_id = $1 AND status NOT IN ('paid', 'cancelled')
       AND requested_bill_at IS NULL`,
    [table.id],
  );

  const payload = { tableId: table.id, tableNumber };
  if (staffId) {
    // Notify the assigned staff member + all admins + cashiers
    ws.broadcastToRolesOrUser('BILL_REQUESTED', payload, restaurantId, ['admin', 'cashier'], staffId);
  } else {
    ws.broadcast('BILL_REQUESTED', payload, restaurantId);
  }

  res.json({ success: true });
}));

// POST /api/public/reviews
// Submits a customer review; tableId acts as implicit auth (same as order placement)
router.post('/reviews', reviewLimiter, asyncHandler(async (req, res) => {
  const { tableId, overallRating, foodRating, serviceRating, comment, customerPhone } = req.body;
  if (!tableId || !UUID_RE.test(tableId)) {
    return res.status(400).json({ error: 'tableId is required' });
  }
  const overall = parseInt(overallRating, 10);
  if (!overall || overall < 1 || overall > 5) {
    return res.status(400).json({ error: 'overallRating must be between 1 and 5' });
  }

  // Validate phone before hitting the DB
  const rawPhone = customerPhone ? String(customerPhone).trim() : null;
  const PHONE_RE = /^[0-9 +\-().]{7,20}$/;
  if (rawPhone && !PHONE_RE.test(rawPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }
  const phone = rawPhone || null;

  const table = await getActiveTable(tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  // A review must come from a table that actually has an order — otherwise the
  // tableId in the URL could be swapped to post reviews against any table.
  const { rows: hasOrder } = await db.query(
    "SELECT 1 FROM orders WHERE table_id = $1 AND status <> 'cancelled' LIMIT 1",
    [table.id],
  );
  if (!hasOrder[0]) return res.status(403).json({ error: 'No order found for this table' });

  const toRating = (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 5 ? n : null; };

  // Try to match phone to an existing loyalty customer
  let loyaltyCustomerId = null;
  if (phone) {
    const { rows: lc } = await db.query(
      'SELECT id FROM loyalty_customers WHERE restaurant_id = $1 AND phone = $2',
      [table.restaurant_id, phone],
    );
    loyaltyCustomerId = lc[0]?.id ?? null;
  }

  await db.query(
    `INSERT INTO reviews
       (restaurant_id, table_id, overall_rating, food_rating, service_rating, comment, customer_phone, loyalty_customer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      table.restaurant_id,
      table.id,
      overall,
      toRating(foodRating),
      toRating(serviceRating),
      comment ? String(comment).slice(0, 500) : null,
      phone,
      loyaltyCustomerId,
    ],
  );

  res.status(201).json({ success: true });
}));

// ── Walk-in waitlist (door QR) ───────────────────────────────────────────────
// These key on the RESTAURANT public_token (the door/host-stand QR), not a table.

// GET /api/public/restaurant/:restaurantToken
// Minimal restaurant info for the waitlist onboarding screen.
router.get('/restaurant/:restaurantToken', asyncHandler(async (req, res) => {
  const { restaurantToken } = req.params;
  if (!UUID_RE.test(restaurantToken)) return res.status(404).json({ error: 'Not found' });

  const restaurant = await restaurantsRepo.findByPublicToken(restaurantToken);
  if (!restaurant) return res.status(404).json({ error: 'Not found' });

  const settings = await settingsRepo.getAll(restaurant.id);
  res.json({
    restaurant_id:   restaurant.id,
    restaurant_name: restaurant.name,
    eta_enabled:     settings.eta_enabled === 'true',
    allow_extra_chair: settings.allow_extra_chair === 'true',
  });
}));

// POST /api/public/waitlist  { restaurantToken, guestName, guestPhone, partySize, allowExtraChair, whatsappOptIn, prefs }
// A walk-in joins the queue. Returns the entry's own token to poll status with.
router.post('/waitlist', waitlistJoinLimiter, asyncHandler(async (req, res) => {
  const { restaurantToken } = req.body;
  if (!restaurantToken || !UUID_RE.test(restaurantToken)) {
    return res.status(400).json({ error: 'restaurantToken is required' });
  }
  const restaurant = await restaurantsRepo.findByPublicToken(restaurantToken);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

  const entry = await waitlistService.join(restaurant.id, {
    guestName:       req.body.guestName,
    guestPhone:      req.body.guestPhone,
    partySize:       req.body.partySize,
    allowExtraChair: !!req.body.allowExtraChair,
    whatsappOptIn:   !!req.body.whatsappOptIn,
    prefs:           req.body.prefs && typeof req.body.prefs === 'object' ? req.body.prefs : {},
  });
  res.status(201).json(entry);
}));

// GET /api/public/waitlist/:token — guest polls their own live position + ETA.
router.get('/waitlist/:token', waitlistPollLimiter, asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) return res.status(404).json({ error: 'Not found' });
  res.json(await waitlistService.getStatusByToken(token));
}));

// POST /api/public/waitlist/:token/cancel — guest leaves the queue.
router.post('/waitlist/:token/cancel', orderLimiter, asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!UUID_RE.test(token)) return res.status(404).json({ error: 'Not found' });
  res.json(await waitlistService.cancelByToken(token));
}));

module.exports = router;
