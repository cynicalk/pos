const router = require('express').Router();
const service = require('./recipes.service');
const ingRepo = require('../ingredients/ingredients.repository');
const { authenticate, authorize } = require('../shared/middleware/auth');
const upload      = require('../shared/middleware/upload');
const parseImport = require('../shared/parseImport');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate, authorize('admin'));

router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rows = await parseImport(req.file.buffer);

  // Group flat rows into recipes (one ingredient per row)
  const recipeMap = new Map();
  for (const row of rows) {
    const name = String(row.recipe_name || '').trim();
    if (!name) continue;
    if (!recipeMap.has(name)) {
      recipeMap.set(name, {
        name,
        yieldQuantity: parseFloat(row.yield_quantity) || 1,
        yieldUnit:     String(row.yield_unit  || 'piece').trim(),
        prepTimeSec:   row.prep_time_min ? Math.round(parseFloat(row.prep_time_min) * 60) : null,
        notes:         String(row.notes || '').trim() || null,
        ingredients:   [],
      });
    }
    const ingName = String(row.ingredient_name || '').trim();
    if (ingName) {
      recipeMap.get(name).ingredients.push({
        ingredientName: ingName,
        quantity:       parseFloat(row.quantity) || 0,
        unit:           String(row.unit || '').trim(),
      });
    }
  }

  // Build name → ingredient lookup for this restaurant
  const allIngredients = await ingRepo.getAll(req.user.restaurantId);
  const byName = new Map(allIngredients.map((i) => [i.name.toLowerCase(), i]));

  const results = { imported: 0, errors: [] };
  let idx = 1;
  for (const [recipeName, recipe] of recipeMap) {
    try {
      const resolved = [];
      for (const ing of recipe.ingredients) {
        const found = byName.get(ing.ingredientName.toLowerCase());
        if (!found) throw new Error(`Ingredient "${ing.ingredientName}" not found — add it in Ingredients first`);
        resolved.push({
          ingredientId: found.id,
          quantity:     ing.quantity,
          unit:         ing.unit || found.unit,
          costPerUnit:  found.latest_unit_cost || 0,
        });
      }
      await service.create({ ...recipe, ingredients: resolved }, req.user.restaurantId);
      results.imported++;
    } catch (e) {
      results.errors.push({ row: idx, reason: `"${recipeName}": ${e.message}` });
    }
    idx++;
  }
  res.json(results);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await service.getAll(req.user.restaurantId));
}));

router.get('/cost-report', asyncHandler(async (req, res) => {
  res.json(await service.getCostReport(req.user.restaurantId));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await service.getById(req.params.id, req.user.restaurantId));
}));

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.body, req.user.restaurantId));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json(await service.update(req.params.id, req.body, req.user.restaurantId));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await service.remove(req.params.id, req.user.restaurantId));
}));

router.get('/:id/cost', asyncHandler(async (req, res) => {
  res.json(await service.getCost(req.params.id, req.user.restaurantId));
}));

router.get('/:id/snapshots', asyncHandler(async (req, res) => {
  res.json(await service.getSnapshots(req.params.id, req.user.restaurantId));
}));

router.post('/:id/snapshot', asyncHandler(async (req, res) => {
  res.json(await service.takeSnapshot(req.params.id, req.user.restaurantId, req.body.triggeredBy));
}));

module.exports = router;
