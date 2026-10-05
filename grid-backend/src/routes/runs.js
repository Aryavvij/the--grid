const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// ─── List / detail ────────────────────────────────────────────────────────────

// GET /api/runs?from=&to=&limit=  — list view omits the heavy route/streams columns
router.get('/', async (req, res, next) => {
  try {
    const q = z.object({ from: dateStr.optional(), to: dateStr.optional(), limit: z.coerce.number().int().min(1).max(5000).default(1000) }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
    const { from, to, limit } = q.data;
    const where = { userId: req.user.id };
    if (from || to) where.date = { ...(from && { gte: from }), ...(to && { lte: to }) };
    res.json(await db.runActivity.findMany({
      where, orderBy: { startTime: 'desc' }, take: limit,
      select: {
        id: true, date: true, startTime: true, name: true, distanceM: true, movingSec: true, elapsedSec: true,
        avgHr: true, maxHr: true, cadence: true, elevGainM: true, calories: true, gear: true, sourceFormat: true,
      },
    }));
  } catch (err) { next(err); }
});

// GET /api/runs/:id — full detail including splits, route, streams
router.get('/:id', async (req, res, next) => {
  try {
    const run = await db.runActivity.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (err) { next(err); }
});

// ─── Import ───────────────────────────────────────────────────────────────────
// The browser parses the files and posts normalised runs. Dedupe is by fileHash
// (unique per user), so re-uploading the same export is a no-op.

const runSchema = z.object({
  date:         dateStr,
  startTime:    z.string().datetime({ offset: true }),
  name:         z.string().trim().max(200).nullish(),
  distanceM:    z.number().min(0).max(1_000_000),
  movingSec:    z.number().int().min(0).max(1_000_000),
  elapsedSec:   z.number().int().min(0).max(1_000_000).nullish(),
  avgHr:        z.number().int().min(20).max(250).nullish(),
  maxHr:        z.number().int().min(20).max(250).nullish(),
  cadence:      z.number().int().min(0).max(300).nullish(),
  elevGainM:    z.number().min(0).max(20000).nullish(),
  calories:     z.number().int().min(0).max(20000).nullish(),
  gear:         z.string().trim().max(120).nullish(),
  splits:       z.array(z.any()).max(500).nullish(),
  hrZones:      z.record(z.string(), z.number()).nullish(),
  route:        z.array(z.array(z.number()).length(2)).max(2000).nullish(),
  streams:      z.record(z.string(), z.array(z.number().nullable()).max(2000)).nullish(),
  fileHash:     z.string().min(8).max(128),
  sourceFormat: z.enum(['fit', 'gpx', 'tcx', 'csv']),
});
const importSchema = z.object({ runs: z.array(runSchema).min(1).max(500) });

// POST /api/runs/import  → { imported, duplicates }
router.post('/import', validate(importSchema), async (req, res, next) => {
  try {
    const result = await db.runActivity.createMany({
      data: req.body.runs.map(r => ({ ...r, startTime: new Date(r.startTime), userId: req.user.id })),
      skipDuplicates: true,
    });
    res.status(201).json({ imported: result.count, duplicates: req.body.runs.length - result.count });
  } catch (err) { next(err); }
});

// DELETE /api/runs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const run = await db.runActivity.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    await db.runActivity.delete({ where: { id: run.id } });
    res.json({ message: 'Run deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
