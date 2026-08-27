const router = require('express').Router();
const service = require('./stocktake.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { asyncHandler } = require('../shared/asyncHandler');
const audit = require('../shared/audit');

router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await service.listCounts(req.user.restaurantId));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getCount(req.params.id, req.user.restaurantId));
}));

router.post('/', asyncHandler(async (req, res) => {
  const count = await service.createCount({
    restaurantId: req.user.restaurantId,
    label:        req.body.label,
    notes:        req.body.notes,
    createdBy:    req.user.userId,
  });
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'create', resourceType: 'stock_count', resourceId: count.id,
    description: `Started stock count "${count.label}"`,
  });
  res.status(201).json(count);
}));

router.patch('/:id/lines', asyncHandler(async (req, res) => {
  res.json(await service.saveLines(req.params.id, req.user.restaurantId, req.body.lines || []));
}));

router.post('/:id/import', asyncHandler(async (req, res) => {
  res.status(201).json(await service.importCounts(req.params.id, req.user.restaurantId, req.body.rows));
}));

router.post('/:id/finalize', asyncHandler(async (req, res) => {
  const count = await service.finalize(req.params.id, req.user.restaurantId, {
    reconcile:   req.body.reconcile === true,
    performedBy: req.user.userId,
  });
  audit.log({
    actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId,
    action: 'update', resourceType: 'stock_count', resourceId: req.params.id,
    description: `Finalized stock count "${count?.label || req.params.id}"${req.body.reconcile === true ? ' (stock reconciled)' : ''}`,
  });
  res.json(count);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await service.deleteCount(req.params.id, req.user.restaurantId);
  res.status(204).send();
}));

module.exports = router;
