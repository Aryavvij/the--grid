const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

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

router.post('/categories', async (req, res, next) => {
  try {
    const { name, type, color, budgetAmount } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    const cat = await db.budgetCategory.create({
      data: { userId: req.user.id, name, type, color, budgetAmount: budgetAmount ? parseFloat(budgetAmount) : null },
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.put('/categories/:id', async (req, res, next) => {
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

router.post('/transactions', async (req, res, next) => {
  try {
    const { amount, description, date, type, categoryId, recurring, recurringFreq } = req.body;
    if (!amount || !date || !type) return res.status(400).json({ error: 'amount, date, and type are required' });
    const tx = await db.transaction.create({
      data: {
        userId: req.user.id,
        amount: parseFloat(amount),
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

router.put('/transactions/:id', async (req, res, next) => {
  try {
    const tx = await db.transaction.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
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
