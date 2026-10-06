const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// Split days and logged exercises are free-form JSON the editor owns; these
// check shape and size, and keep ids/owners out of reach of the request body.
const splitSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  days: z.array(z.record(z.string(), z.unknown())).min(1, 'days array is required').max(14),
});

const logSchema = z.object({
  workoutDate: dateStr,
  dayIndex:    z.number().int().min(0).max(13).nullish(),
  exercises:   z.array(z.unknown()).max(100),
  notes:       z.string().max(2000).nullish(),
  durationMin: z.number().int().min(0).max(1440).nullish(),
  splitId:     z.string().uuid().nullish(),
});

const registrySchema = z.object({
  savedAt:      z.number().int().min(0),
  exercises:    z.record(z.string().max(60), z.unknown()),
  muscleGroups: z.array(z.record(z.string(), z.unknown())).max(60),
});

/** A splitId from the body must be one of the caller's own splits. */
async function ownSplit(userId, splitId) {
  if (!splitId) return true;
  return !!(await db.gymSplit.findFirst({ where: { id: splitId, userId } }));
}

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
router.put('/split', validate(splitSchema), async (req, res, next) => {
  try {
    const { name, days } = req.body;

    const existing = await db.gymSplit.findFirst({ where: { userId: req.user.id, isActive: true } });

    const split = existing
      ? await db.gymSplit.update({ where: { id: existing.id }, data: { name, days } })
      : await db.gymSplit.create({ data: { userId: req.user.id, name: name || 'My Split', days } });

    res.json(split);
  } catch (err) { next(err); }
});

// ─── Exercise registry ────────────────────────────────────────────────────────

// GET /api/gym/registry  — exercises per muscle group, PRs, muscle groups (or null)
router.get('/registry', async (req, res, next) => {
  try {
    const split = await db.gymSplit.findFirst({ where: { userId: req.user.id, isActive: true } });
    res.json(split?.registry || null);
  } catch (err) { next(err); }
});

// PUT /api/gym/registry  — newer copy wins; an older one gets 409 with the stored copy
router.put('/registry', validate(registrySchema), async (req, res, next) => {
  try {
    const existing = await db.gymSplit.findFirst({ where: { userId: req.user.id, isActive: true } });
    if (existing?.registry?.savedAt > req.body.savedAt) {
      return res.status(409).json({ error: 'A newer copy is already saved', registry: existing.registry });
    }
    const split = existing
      ? await db.gymSplit.update({ where: { id: existing.id }, data: { registry: req.body } })
      : await db.gymSplit.create({ data: { userId: req.user.id, name: 'My Split', days: [], registry: req.body } });
    res.json({ savedAt: split.registry.savedAt });
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
router.post('/logs', validate(logSchema), async (req, res, next) => {
  try {
    const { workoutDate, dayIndex, exercises, notes, durationMin, splitId } = req.body;
    if (!(await ownSplit(req.user.id, splitId))) return res.status(400).json({ error: 'Unknown split' });
    const log = await db.gymLog.create({
      data: { userId: req.user.id, workoutDate, dayIndex, exercises, notes, durationMin: durationMin || null, splitId: splitId || null },
    });
    res.status(201).json(log);
  } catch (err) { next(err); }
});

// PUT /api/gym/logs/:id
router.put('/logs/:id', validate(logSchema.partial()), async (req, res, next) => {
  try {
    const log = await db.gymLog.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!log) return res.status(404).json({ error: 'Log not found' });
    if (!(await ownSplit(req.user.id, req.body.splitId))) return res.status(400).json({ error: 'Unknown split' });
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
