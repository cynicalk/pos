const router = require('express').Router();
const service = require('./menu.service');
const { authenticate, authorize } = require('../shared/middleware/auth');
const upload      = require('../shared/middleware/upload');
const parseImport = require('../shared/parseImport');
const audit = require('../shared/audit');
const { asyncHandler } = require('../shared/asyncHandler');

const VALID_CATEGORIES = ['starters', 'mains', 'desserts', 'drinks', 'sides', 'other'];

const pos = (req) => ({ actorType: 'user', actorId: req.user.userId, restaurantId: req.user.restaurantId });

router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId));
}));

router.get('/available', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getAvailable(req.user.restaurantId));
}));

router.get('/popular', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getPopular(req.user.restaurantId));
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  res.json(await service.getById(req.params.id, req.user.restaurantId));
}));

router.post('/import', authenticate, authorize('admin'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rows = await parseImport(req.file.buffer);
  const results = { imported: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name     = String(row.name     || '').trim();
      const price    = parseFloat(row.price);
      const category = String(row.category || 'other').toLowerCase().trim();
      if (!name)                       throw new Error('name is required');
      if (isNaN(price) || price < 0)   throw new Error('price must be a valid non-negative number');
      await service.create({
        name,
        price,
        category: VALID_CATEGORIES.includes(category) ? category : 'other',
        description: String(row.description || '').trim() || null,
        sku:         String(row.sku         || '').trim() || null,
        available:   String(row.available   || 'true').toLowerCase() !== 'false',
      }, req.user.restaurantId);
      results.imported++;
    } catch (e) {
      results.errors.push({ row: i + 2, reason: e.message });
    }
  }
  res.json(results);
}));

router.post('/', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const item = await service.create(req.body, req.user.restaurantId);
  audit.log({ ...pos(req), action: 'create', resourceType: 'menu_item', resourceId: item.id, description: `Created menu item "${item.name}" at ${item.price}` });
  res.status(201).json(item);
}));

router.patch('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.body, req.user.restaurantId);
  const changes = Object.keys(req.body).join(', ');
  audit.log({ ...pos(req), action: 'update', resourceType: 'menu_item', resourceId: req.params.id, description: `Updated menu item "${item.name}" (${changes})`, meta: req.body });
  res.json(item);
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.restaurantId);
  audit.log({ ...pos(req), action: 'delete', resourceType: 'menu_item', resourceId: req.params.id, description: `Deleted menu item ${req.params.id}` });
  res.status(204).send();
}));

module.exports = router;
