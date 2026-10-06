const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const habitSchema = z.object({
  name:       z.string().trim().min(1, 'Name is required').max(120),
  icon:       z.string().trim().max(40).nullish(),
  color:      z.string().trim().max(20).nullish(),
  frequency:  z.string().trim().max(20).optional(),
  targetDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  sortOrder:  z.number().int().min(0).max(10000).optional(),
  archived:   z.boolean().optional(),
});

const logSchema = z.object({
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required (YYYY-MM-DD)'),
  completed: z.boolean().optional(),
});

// GET /api/habits
router.get('/', async (req, res, next) => {
  try {
    const habits = await db.habit.findMany({
      where: { userId: req.user.id, archived: false },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(habits);
  } catch (err) { next(err); }
});

// POST /api/habits
router.post('/', validate(habitSchema), async (req, res, next) => {
  try {
    const { name, icon, color, frequency, targetDays } = req.body;
    const habit = await db.habit.create({
      data: { userId: req.user.id, name, icon, color, frequency: frequency || 'daily', targetDays },
    });
    res.status(201).json(habit);
  } catch (err) { next(err); }
});

// PUT /api/habits/:id
router.put('/:id', validate(habitSchema.partial()), async (req, res, next) => {
  try {
    const habit = await db.habit.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    const updated = await db.habit.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/habits/:id  (soft-deletes via archive)
router.delete('/:id', async (req, res, next) => {
  try {
    const habit = await db.habit.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    await db.habit.update({ where: { id: req.params.id }, data: { archived: true } });
    res.json({ message: 'Habit archived' });
  } catch (err) { next(err); }
});

// POST /api/habits/:id/log  — toggle completion for a date
router.post('/:id/log', validate(logSchema), async (req, res, next) => {
  try {
    const { date, completed = true } = req.body;

    const habit = await db.habit.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    const log = await db.habitLog.upsert({
      where:  { habitId_loggedDate: { habitId: req.params.id, loggedDate: date } },
      create: { habitId: req.params.id, userId: req.user.id, loggedDate: date, completed },
      update: { completed },
    });
    res.json(log);
  } catch (err) { next(err); }
});

// GET /api/habits/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/logs', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { userId: req.user.id };
    if (from) where.loggedDate = { gte: from };
    if (to)   where.loggedDate = { ...where.loggedDate, lte: to };
    const logs = await db.habitLog.findMany({ where, orderBy: { loggedDate: 'asc' } });
    res.json(logs);
  } catch (err) { next(err); }
});

module.exports = router;
