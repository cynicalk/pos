const express = require('express');
const cors = require('cors');
const service = require('./guest.service');
const { asyncHandler } = require('../shared/asyncHandler');
const { rateLimit } = require('../shared/middleware/rateLimit');

/**
 * /api/guest/* — the surface the guest dine-in app talks to.
 *
 * Public and unauthenticated, like /api/public: a phone at a table has no
 * login. Any origin is allowed because guests scan from any network. Every
 * response shape here is the one the app parses (see the app's lib/backend.ts);
 * this router only marshals HTTP, all logic is in guest.service.
 *
 * The app degrades gracefully on any non-OK response, so handlers answer with a
 * plain { success: false } (or a 4xx) rather than throwing — the guest should
 * never see a stack trace, only the app's offline fallback.
 */

const router = express.Router();
router.use(cors({ origin: '*' }));

const outletOf = (req) => req.query.outlet || req.body?.outletId || null;

// Writes are rate-limited per IP so one device cannot flood a venue.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many requests, please try again later',
});

// A NotFound outlet is the one error worth a status code — everything else the
// app treats as "unreachable" and falls back, so we keep 200 + success:false.
function guard(handler) {
  return asyncHandler(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof service.OutletNotFound) {
        return res.status(404).json({ success: false, error: 'Outlet not found' });
      }
      throw err;
    }
  });
}

// ── Menu & recommender ───────────────────────────────────────────────────────

router.get('/menu', guard(async (req, res) => {
  res.json(await service.getMenu(outletOf(req)));
}));

router.get('/affinities', guard(async (req, res) => {
  res.json(await service.getAffinities(outletOf(req)));
}));

// ── Shared table (Joined Cart) ───────────────────────────────────────────────

// One path, three verbs — matching the app: POST opens, GET fetches by code,
// PUT pushes an updated doc.
router.post('/table', writeLimiter, guard(async (req, res) => {
  res.json(await service.openTable(outletOf(req), {
    shared: req.body?.shared, phone: req.body?.phone,
  }));
}));

router.get('/table', guard(async (req, res) => {
  res.json(await service.fetchTable(outletOf(req), req.query.code));
}));

router.put('/table', writeLimiter, guard(async (req, res) => {
  const { visitId, shared } = req.body || {};
  if (!visitId) return res.status(400).json({ success: false });
  res.json(await service.pushTable(visitId, shared));
}));

// ── Ordering ─────────────────────────────────────────────────────────────────

router.post('/order', writeLimiter, guard(async (req, res) => {
  const result = await service.placeOrder(req.body || {});
  // A structured refusal (unknown items) is a 200 with { error } — the app reads
  // `error` to show "rejected", distinct from an unreachable backend.
  res.status(result.success ? 201 : 200).json(result);
}));

router.get('/order/status', guard(async (req, res) => {
  res.json(await service.orderStatus(outletOf(req), req.query.orderNumber));
}));

// ── Feedback, service call, pay, receipt ─────────────────────────────────────

router.post('/feedback', writeLimiter, guard(async (req, res) => {
  res.json(await service.submitFeedback(outletOf(req), {
    aspects: req.body?.aspects, comment: req.body?.comment, orderNumber: req.body?.orderNumber,
  }));
}));

router.post('/service', writeLimiter, guard(async (req, res) => {
  res.json(await service.requestService(outletOf(req), {
    orderNumber: req.body?.orderNumber, type: req.body?.type,
  }));
}));

router.post('/pay', writeLimiter, guard(async (req, res) => {
  res.json(await service.settle(outletOf(req), {
    orderNumber: req.body?.orderNumber,
    method: req.body?.method,
    tipAmount: req.body?.tipAmount,
    splitMode: req.body?.splitMode,
    splitCount: req.body?.splitCount,
  }));
}));

router.get('/receipt', guard(async (req, res) => {
  res.json(await service.getReceipt(outletOf(req), req.query.orderNumber));
}));

module.exports = router;
