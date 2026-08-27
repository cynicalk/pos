const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./reputation.service');

/*
 * Reputation routes (MERGE_PLAN.md Phase 6).
 *
 * Admin-only throughout. Reviews carry guest phone numbers and the guest
 * endpoints carry contact details and spend history, which is not floor-staff
 * information — the same boundary /loyalty and /reviews already draw.
 */

const rid = (req) => req.user.restaurantId;

// ── Reviews ────────────────────────────────────────────────────────────────

router.get('/insights', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getInsights(rid(req), { days: req.query.days }));
}));

router.get('/reviews', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.listReviews(rid(req), { days: req.query.days }));
}));

// Explicit re-run of the classifier, with the model. Page loads use keywords
// only so nobody waits on a local model; this is the button for the operator
// who wants the better read and accepts that it takes a moment.
router.post('/classify', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.classifyPending(rid(req), { useModel: true }));
}));

// ── Reply drafts ───────────────────────────────────────────────────────────

router.post('/reviews/:id/draft', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.draftReply(rid(req), req.params.id, req.user.userId));
}));

router.put('/reviews/:id/draft', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.saveReply(rid(req), req.params.id, req.body.draft, req.user.userId));
}));

router.post('/reviews/:id/sent', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.markReplySent(rid(req), req.params.id, req.user.userId));
}));

// ── Rankings ───────────────────────────────────────────────────────────────

router.get('/rankings', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getRankings(rid(req)));
}));

router.post('/rankings/ranks', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.recordRank(rid(req), req.body, req.user.userId));
}));

router.delete('/rankings/ranks/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.deleteRank(rid(req), req.params.id));
}));

router.post('/rankings/competitors', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.status(201).json(await service.recordCompetitorRating(rid(req), req.body, req.user.userId));
}));

router.delete('/rankings/competitors/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.deleteCompetitorRating(rid(req), req.params.id));
}));

// ── Guests ─────────────────────────────────────────────────────────────────

router.get('/guests', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getGuestMetrics(rid(req), { days: req.query.days }));
}));

module.exports = router;
