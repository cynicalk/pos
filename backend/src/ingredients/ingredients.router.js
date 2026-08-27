const router = require('express').Router();
const service = require('./ingredients.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const upload      = require('../shared/middleware/upload');
const parseImport = require('../shared/parseImport');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate, authorize('admin'));

router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rows = await parseImport(req.file.buffer);
  const results = { imported: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = String(row.name || '').trim();
      const unit = String(row.unit || '').trim();
      if (!name) throw new Error('name is required');
      if (!unit) throw new Error('unit is required');
      await service.create({
        name,
        unit,
        latestUnitCost: parseFloat(row.latest_unit_cost || 0) || 0,
        reorderLevel:   parseFloat(row.reorder_level    || 0) || 0,
        reorderQty:     parseFloat(row.reorder_qty      || 0) || 0,
      }, req.user.restaurantId);
      results.imported++;
    } catch (e) {
      results.errors.push({ row: i + 2, reason: e.message });
    }
  }
  res.json(results);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId));
}));

router.get('/low-stock', asyncHandler(async (req, res) => {
  res.json(await service.getLowStock(req.user.restaurantId));
}));

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.body, req.user.restaurantId));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json(await service.update(req.params.id, req.body, req.user.restaurantId));
}));

router.post('/:id/purchase', asyncHandler(async (req, res) => {
  res.json(
    await service.recordPurchase(
      req.params.id,
      { ...req.body, performedBy: req.user.userId },
      req.user.restaurantId,
    ),
  );
}));

module.exports = router;
