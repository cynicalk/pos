const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./payouts.service');

/*
 * Settlement routes (MERGE_PLAN.md Phase 8). Admin-only: a settlement is the
 * restaurant's full financial position for a period.
 */

// Memory storage, not disk. A settlement file is parsed once and its rows are
// persisted as structured data; keeping the raw file on disk would leave the
// platform's per-order financials sitting in /uploads with nothing rotating it.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: service.MAX_FILE_BYTES },
});

const rid = (req) => req.user.restaurantId;

router.get('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.listSettlements(rid(req)));
}));

router.get('/contracts', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getContracts(rid(req)));
}));

router.put('/contracts/:platform', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.saveContract(
    rid(req), req.params.platform, req.body.commissionRatePct, req.user.userId,
  ));
}));

// Parse and check WITHOUT saving, so the operator sees what was read and what
// was rejected before anything is committed.
router.post('/preview', authenticate, authorize('admin'), upload.single('file'),
  asyncHandler(async (req, res) => {
    res.json(await service.preview(rid(req), {
      buffer: req.file?.buffer,
      fileName: req.file?.originalname || 'settlement.csv',
      platform: req.body.platform || null,
    }));
  }));

router.post('/import', authenticate, authorize('admin'), upload.single('file'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.importSettlement(rid(req), {
      buffer: req.file?.buffer,
      fileName: req.file?.originalname || 'settlement.csv',
      platform: req.body.platform || null,
      userId: req.user.userId,
    }));
  }));

router.get('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.getSettlementDetail(rid(req), req.params.id));
}));

module.exports = router;
