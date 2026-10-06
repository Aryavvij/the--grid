const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const categorySchema = z.object({
  name:         z.string().trim().min(1, 'name is required').max(80),
  type:         z.enum(['income', 'expense']),
  color:        z.string().trim().max(20).nullish(),
  budgetAmount: z.coerce.number().min(0).max(1e12).nullish(),
  sortOrder:    z.number().int().min(0).max(10000).optional(),
});

const txSchema = z.object({
  amount:        z.coerce.number().positive('amount must be above 0').max(1e12),
  description:   z.string().trim().max(200).nullish(),
  date:          dateStr,
  type:          z.enum(['income', 'expense']),
  categoryId:    z.string().uuid().nullish(),
  recurring:     z.boolean().optional(),
  recurringFreq: z.enum(['monthly', 'weekly', 'yearly']).nullish(),
});

/** A categoryId from the body must be one of the caller's own categories. */
async function ownCategory(userId, categoryId) {
  if (!categoryId) return true;
  return !!(await db.budgetCategory.findFirst({ where: { id: categoryId, userId } }));
}

// ─── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', async (req, res, next) => {
  try {
    const cats = await db.budgetCategory.findMany({
      where: { userId: req.user.id },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(cats);
  } catch (err) { next(err); }
});

router.post('/categories', validate(categorySchema), async (req, res, next) => {
  try {
    const { name, type, color, budgetAmount } = req.body;
    const cat = await db.budgetCategory.create({
      data: { userId: req.user.id, name, type, color, budgetAmount: budgetAmount || null },
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.put('/categories/:id', validate(categorySchema.partial()), async (req, res, next) => {
  try {
    const cat = await db.budgetCategory.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const updated = await db.budgetCategory.update({ where: { id: req.params.id }, data: req.body });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const cat = await db.budgetCategory.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    await db.budgetCategory.delete({ where: { id: req.params.id } });
    res.json({ message: 'Category deleted' });
  } catch (err) { next(err); }
});

// ─── Transactions ─────────────────────────────────────────────────────────────

router.get('/transactions', async (req, res, next) => {
  try {
    const { from, to, type, limit = 100 } = req.query;
    const where = { userId: req.user.id };
    if (from)  where.date = { gte: from };
    if (to)    where.date = { ...where.date, lte: to };
    if (type)  where.type = type;
    const txs = await db.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: 'desc' },
      take: parseInt(limit),
    });
    res.json(txs);
  } catch (err) { next(err); }
});

router.post('/transactions', validate(txSchema), async (req, res, next) => {
  try {
    const { amount, description, date, type, categoryId, recurring, recurringFreq } = req.body;
    if (!(await ownCategory(req.user.id, categoryId))) return res.status(400).json({ error: 'Unknown category' });
    const tx = await db.transaction.create({
      data: {
        userId: req.user.id,
        amount,
        description,
        date,
        type,
        categoryId: categoryId || null,
        recurring:  recurring || false,
        recurringFreq: recurringFreq || null,
      },
      include: { category: true },
    });
    res.status(201).json(tx);
  } catch (err) { next(err); }
});

router.put('/transactions/:id', validate(txSchema.partial()), async (req, res, next) => {
  try {
    const tx = await db.transaction.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!(await ownCategory(req.user.id, req.body.categoryId))) return res.status(400).json({ error: 'Unknown category' });
    const updated = await db.transaction.update({ where: { id: req.params.id }, data: req.body, include: { category: true } });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/transactions/:id', async (req, res, next) => {
  try {
    const tx = await db.transaction.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    await db.transaction.delete({ where: { id: req.params.id } });
    res.json({ message: 'Transaction deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
