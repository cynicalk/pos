const router  = require('express').Router();
const service = require('./compliance.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');

const adminOnly = [authenticate, authorize('admin')];
// Sign-offs are done by whoever is on shift, so staff may submit a checklist.
// Everything else — the licence, certificates, the evidence pack — is admin.
const anyStaff = [authenticate];

// ── Overview + evidence ────────────────────────────────────────────────────
router.get('/overview', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getOverview(req.user.restaurantId));
}));

router.get('/evidence-pack', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getEvidencePack(req.user.restaurantId));
}));

router.get('/documents', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.listDocs(req.user.restaurantId, req.query.docType));
}));

router.delete('/documents/:id', ...adminOnly, asyncHandler(async (req, res) => {
  await service.deleteDoc(req.params.id, req.user.restaurantId);
  res.status(204).end();
}));

// ── Checklists ─────────────────────────────────────────────────────────────
router.get('/hygiene', ...anyStaff, asyncHandler(async (req, res) => {
  res.json(await service.getHygiene(req.user.restaurantId));
}));

router.post('/hygiene', ...anyStaff, asyncHandler(async (req, res) => {
  res.status(201).json(await service.submitHygieneChecklist(
    req.user.restaurantId, req.body.checked, req.body.signedBy,
  ));
}));

router.get('/shifts', ...anyStaff, asyncHandler(async (req, res) => {
  res.json(await service.getShiftChecklists(req.user.restaurantId));
}));

router.post('/shifts', ...anyStaff, asyncHandler(async (req, res) => {
  res.status(201).json(await service.submitShiftChecklist(
    req.user.restaurantId, req.body.shift, req.body.checked, req.body.signedBy,
  ));
}));

// ── Licence, certificates, tests ───────────────────────────────────────────
router.post('/licence', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.saveLicence(req.user.restaurantId, req.body));
}));

router.post('/certs', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.saveStaffCert(req.user.restaurantId, req.body));
}));

router.get('/testing', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getTestingCalendar(req.user.restaurantId));
}));

router.post('/testing', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.recordTest(req.user.restaurantId, req.body));
}));

// ── SOPs ───────────────────────────────────────────────────────────────────
router.get('/sops', ...anyStaff, asyncHandler(async (req, res) => {
  res.json(await service.getSopLibrary(req.user.restaurantId));
}));

router.get('/sops/:slug', ...anyStaff, asyncHandler(async (req, res) => {
  res.json(await service.getSopHistory(req.user.restaurantId, req.params.slug));
}));

router.post('/sops', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.saveSop(req.user.restaurantId, req.body, req.user.userId));
}));

router.post('/sops/:slug/adopt', ...adminOnly, asyncHandler(async (req, res) => {
  res.status(201).json(await service.adoptTemplate(
    req.user.restaurantId, req.params.slug, req.user.userId,
  ));
}));

router.get('/drift', ...adminOnly, asyncHandler(async (req, res) => {
  res.json(await service.getDrift(req.user.restaurantId));
}));

module.exports = router;
