const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const rangeQuery = z.object({ from: dateStr.optional(), to: dateStr.optional(), limit: z.coerce.number().int().min(1).max(400).default(120) });

// ─── Daily metrics ────────────────────────────────────────────────────────────

const dailySchema = z.object({
  restingHr:      z.number().int().min(20).max(220).nullish(),
  hrvMs:          z.number().min(0).max(400).nullish(),
  spo2Avg:        z.number().min(50).max(100).nullish(),
  spo2Min:        z.number().min(50).max(100).nullish(),
  skinTempDelta:  z.number().min(-10).max(10).nullish(),
  breathingRate:  z.number().min(0).max(60).nullish(),
  steps:          z.number().int().min(0).max(200000).nullish(),
  distanceM:      z.number().min(0).max(500000).nullish(),
  caloriesTotal:  z.number().int().min(0).max(20000).nullish(),
  caloriesActive: z.number().int().min(0).max(20000).nullish(),
  azmMinutes:     z.number().int().min(0).max(1440).nullish(),
  sedentaryMin:   z.number().int().min(0).max(1440).nullish(),
  cardioLoad:     z.number().min(0).max(1000).nullish(),
  readiness:      z.number().int().min(0).max(100).nullish(),
  hrZones:        z.record(z.string(), z.number()).nullish(),
  intraday:       z.any().nullish(),
  source:         z.string().max(40).optional(),
});

// GET /api/health/daily?from=&to=&limit=
router.get('/daily', async (req, res, next) => {
  try {
    const q = rangeQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
    const { from, to, limit } = q.data;
    const where = { userId: req.user.id };
    if (from || to) where.date = { ...(from && { gte: from }), ...(to && { lte: to }) };
    res.json(await db.healthDaily.findMany({ where, orderBy: { date: 'desc' }, take: limit }));
  } catch (err) { next(err); }
});

// PUT /api/health/daily/:date — upsert one day (used by the sync job and manual backfill)
router.put('/daily/:date', validate(dailySchema), async (req, res, next) => {
  try {
    const d = dateStr.safeParse(req.params.date);
    if (!d.success) return res.status(400).json({ error: d.error.issues[0].message });
    const row = await db.healthDaily.upsert({
      where:  { userId_date: { userId: req.user.id, date: d.data } },
      update: { ...req.body, syncedAt: new Date() },
      create: { ...req.body, userId: req.user.id, date: d.data },
    });
    res.json(row);
  } catch (err) { next(err); }
});

// ─── Sleep ────────────────────────────────────────────────────────────────────

// GET /api/health/sleep?from=&to=&limit=
router.get('/sleep', async (req, res, next) => {
  try {
    const q = rangeQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
    const { from, to, limit } = q.data;
    const where = { userId: req.user.id };
    if (from || to) where.date = { ...(from && { gte: from }), ...(to && { lte: to }) };
    res.json(await db.healthSleep.findMany({ where, orderBy: { date: 'desc' }, take: limit }));
  } catch (err) { next(err); }
});

// ─── Sync status ──────────────────────────────────────────────────────────────

// GET /api/health/status — never returns the token itself
router.get('/status', async (req, res, next) => {
  try {
    const t = await db.healthToken.findUnique({ where: { userId: req.user.id } });
    res.json({
      connected:      !!t,
      lastSyncAt:     t?.lastSyncAt || null,
      lastSyncStatus: t?.lastSyncStatus || null,
      lastSyncError:  t?.lastSyncError || null,
    });
  } catch (err) { next(err); }
});

module.exports = router;
