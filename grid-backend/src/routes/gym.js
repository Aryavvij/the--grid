const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ─── Split ────────────────────────────────────────────────────────────────────

// GET /api/gym/split  — returns the user's active split (or null)
router.get('/split', async (req, res, next) => {
  try {
    const split = await db.gymSplit.findFirst({
      where: { userId: req.user.id, isActive: true },
    });
    res.json(split || null);
  } catch (err) { next(err); }
});

// PUT /api/gym/split  — create or update active split
router.put('/split', async (req, res, next) => {
  try {
    const { name, days } = req.body;
    if (!days) return res.status(400).json({ error: 'days array is required' });

    const existing = await db.gymSplit.findFirst({ where: { userId: req.user.id, isActive: true } });

    const split = existing
      ? await db.gymSplit.update({ where: { id: existing.id }, data: { name, days } })
      : await db.gymSplit.create({ data: { userId: req.user.id, name: name || 'My Split', days } });

    res.json(split);
  } catch (err) { next(err); }
});

// ─── Logs ─────────────────────────────────────────────────────────────────────

// GET /api/gym/logs?from=&to=&limit=50
router.get('/logs', async (req, res, next) => {
  try {
    const { from, to, limit = 50 } = req.query;
    const where = { userId: req.user.id };
    if (from) where.workoutDate = { gte: from };
    if (to)   where.workoutDate = { ...where.workoutDate, lte: to };
    const logs = await db.gymLog.findMany({
      where,
      orderBy: { workoutDate: 'desc' },
      take: parseInt(limit),
    });
    res.json(logs);
  } catch (err) { next(err); }
});

// POST /api/gym/logs
router.post('/logs', async (req, res, next) => {
  try {
    const { workoutDate, dayIndex, exercises, notes, durationMin, splitId } = req.body;
    if (!workoutDate || !exercises) return res.status(400).json({ error: 'workoutDate and exercises are required' });
    const log = await db.gymLog.create({
      data: { userId: req.user.id, workoutDate, dayIndex, exercises, notes, durationMin: durationMin ? parseInt(durationMin) : null, splitId: splitId || null },
    });
    res.status(201).json(log);
  } catch (err) { next(err); }
});

// PUT /api/gym/logs/:id
router.put('/logs/:id', async (req, res, next) => {
  try {
    const log = await db.gymLog.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!log) return res.status(404).json({ error: 'Log not found' });
    const updated = await db.gymLog.update({ where: { id: req.params.id }, data: req.body });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/gym/logs/:id
router.delete('/logs/:id', async (req, res, next) => {
  try {
    const log = await db.gymLog.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!log) return res.status(404).json({ error: 'Log not found' });
    await db.gymLog.delete({ where: { id: req.params.id } });
    res.json({ message: 'Log deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
