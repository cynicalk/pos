const router = require('express').Router();
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const service = require('./accounting.service');

/*
 * Accounting bridge (payouts family). Admin-only: the export carries the whole
 * period's takings, which is finance data, not floor data.
 */

router.get('/preview', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  res.json(await service.preview(req.user.restaurantId, {
    from: req.query.from, to: req.query.to, tz: req.query.tz,
  }));
}));

router.get('/export', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { filename, contentType, body } = await service.exportFile(req.user.restaurantId, {
    from: req.query.from, to: req.query.to, tz: req.query.tz, format: req.query.format,
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}));

module.exports = router;
