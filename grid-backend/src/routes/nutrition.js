const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const slot    = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const macro   = z.number().min(0).max(5000);

// ─── Meal presets ─────────────────────────────────────────────────────────────

const presetSchema = z.object({
  code:        z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/, 'Code: 1–12 letters, digits or _'),
  name:        z.string().trim().min(1).max(80),
  serving:     z.string().trim().max(80).nullish(),
  calories:    z.number().int().min(0).max(10000),
  protein:     macro.default(0),
  carbs:       macro.default(0),
  fat:         macro.default(0),
  defaultSlot: slot.nullish(),
  color:       z.string().trim().max(20).nullish(),
  favorite:    z.boolean().optional(),
});

router.get('/presets', async (req, res, next) => {
  try {
    res.json(await db.mealPreset.findMany({ where: { userId: req.user.id }, orderBy: [{ favorite: 'desc' }, { useCount: 'desc' }, { code: 'asc' }] }));
  } catch (err) { next(err); }
});

router.post('/presets', validate(presetSchema), async (req, res, next) => {
  try {
    const dupe = await db.mealPreset.findUnique({ where: { userId_code: { userId: req.user.id, code: req.body.code } } });
    if (dupe) return res.status(409).json({ error: `Preset ${req.body.code} already exists` });
    res.status(201).json(await db.mealPreset.create({ data: { ...req.body, userId: req.user.id } }));
  } catch (err) { next(err); }
});

router.put('/presets/:id', validate(presetSchema.partial()), async (req, res, next) => {
  try {
    const p = await db.mealPreset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!p) return res.status(404).json({ error: 'Preset not found' });
    if (req.body.code && req.body.code !== p.code) {
      const dupe = await db.mealPreset.findUnique({ where: { userId_code: { userId: req.user.id, code: req.body.code } } });
      if (dupe) return res.status(409).json({ error: `Preset ${req.body.code} already exists` });
    }
    res.json(await db.mealPreset.update({ where: { id: p.id }, data: req.body }));
  } catch (err) { next(err); }
});

router.delete('/presets/:id', async (req, res, next) => {
  try {
    const p = await db.mealPreset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!p) return res.status(404).json({ error: 'Preset not found' });
    await db.mealPreset.delete({ where: { id: p.id } });
    res.json({ message: 'Preset deleted' });
  } catch (err) { next(err); }
});

// POST /api/nutrition/log-preset  { code, qty?, slot?, date? } — the quick-log bar ("2x S1 dinner")
const logPresetSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/),
  qty:  z.number().min(0.1).max(20).default(1),
  slot: slot.optional(),
  date: dateStr,
});
router.post('/log-preset', validate(logPresetSchema), async (req, res, next) => {
  try {
    const { code, qty, date } = req.body;
    const p = await db.mealPreset.findUnique({ where: { userId_code: { userId: req.user.id, code } } });
    if (!p) return res.status(404).json({ error: `No preset '${code}'`, code: 'PRESET_NOT_FOUND' });
    const log = await db.foodLog.create({
      data: {
        userId: req.user.id, date, slot: req.body.slot || p.defaultSlot || 'snack',
        name: p.name, serving: p.serving, qty, presetId: p.id, presetCode: p.code,
        calories: Math.round(p.calories * qty), protein: +(p.protein * qty).toFixed(1),
        carbs: +(p.carbs * qty).toFixed(1), fat: +(p.fat * qty).toFixed(1), confidence: 'exact',
      },
    });
    await db.mealPreset.update({ where: { id: p.id }, data: { useCount: { increment: 1 } } });
    res.status(201).json(log);
  } catch (err) { next(err); }
});

// ─── Food log ─────────────────────────────────────────────────────────────────

const foodSchema = z.object({
  date: dateStr, slot,
  name: z.string().trim().min(1).max(120),
  serving: z.string().trim().max(80).nullish(),
  qty: z.number().min(0.1).max(50).default(1),
  calories: z.number().int().min(0).max(10000),
  protein: macro.default(0), carbs: macro.default(0), fat: macro.default(0),
  confidence: z.enum(['exact', 'estimated', 'rough']).default('estimated'),
});

// GET /api/nutrition/log?from=&to=
router.get('/log', async (req, res, next) => {
  try {
    const q = z.object({ from: dateStr.optional(), to: dateStr.optional() }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
    const where = { userId: req.user.id };
    if (q.data.from || q.data.to) where.date = { ...(q.data.from && { gte: q.data.from }), ...(q.data.to && { lte: q.data.to }) };
    res.json(await db.foodLog.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'asc' }], take: 2000 }));
  } catch (err) { next(err); }
});

router.post('/log', validate(foodSchema), async (req, res, next) => {
  try {
    res.status(201).json(await db.foodLog.create({ data: { ...req.body, userId: req.user.id } }));
  } catch (err) { next(err); }
});

// PUT /api/nutrition/log/:id — fix an entry (quantity, numbers, meal). The date cannot change.
const foodEditSchema = z.object({
  slot: slot.optional(), name: z.string().trim().min(1).max(120).optional(), serving: z.string().trim().max(80).nullish(), qty: z.number().min(0.1).max(50).optional(),
  calories: z.number().int().min(0).max(10000).optional(), protein: macro.optional(), carbs: macro.optional(), fat: macro.optional(), confidence: z.enum(['exact', 'estimated', 'rough']).optional(),
}).refine(v => Object.keys(v).length > 0, 'Nothing to update');
router.put('/log/:id', validate(foodEditSchema), async (req, res, next) => {
  try {
    const row = await db.foodLog.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!row) return res.status(404).json({ error: 'Entry not found' });
    res.json(await db.foodLog.update({ where: { id: row.id }, data: req.body }));
  } catch (err) { next(err); }
});

router.delete('/log/:id', async (req, res, next) => {
  try {
    const row = await db.foodLog.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!row) return res.status(404).json({ error: 'Entry not found' });
    await db.foodLog.delete({ where: { id: row.id } });
    res.json({ message: 'Entry deleted' });
  } catch (err) { next(err); }
});

// ─── Water ────────────────────────────────────────────────────────────────────

router.get('/water', async (req, res, next) => {
  try {
    const q = z.object({ from: dateStr.optional(), to: dateStr.optional() }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
    const where = { userId: req.user.id };
    if (q.data.from || q.data.to) where.date = { ...(q.data.from && { gte: q.data.from }), ...(q.data.to && { lte: q.data.to }) };
    res.json(await db.waterLog.findMany({ where, orderBy: { date: 'desc' }, take: 400 }));
  } catch (err) { next(err); }
});

router.put('/water/:date', validate(z.object({ ml: z.number().int().min(0).max(20000) })), async (req, res, next) => {
  try {
    const d = dateStr.safeParse(req.params.date);
    if (!d.success) return res.status(400).json({ error: d.error.issues[0].message });
    res.json(await db.waterLog.upsert({
      where: { userId_date: { userId: req.user.id, date: d.data } },
      update: { ml: req.body.ml }, create: { userId: req.user.id, date: d.data, ml: req.body.ml },
    }));
  } catch (err) { next(err); }
});

// ─── Targets ──────────────────────────────────────────────────────────────────

const targetsSchema = z.object({
  calories: z.number().int().min(800).max(10000),
  protein:  z.number().int().min(0).max(600),
  carbs:    z.number().int().min(0).max(1500),
  fat:      z.number().int().min(0).max(500),
  waterMl:  z.number().int().min(500).max(10000).default(3000),
  plan:     z.any().nullish(),
});

router.get('/targets', async (req, res, next) => {
  try { res.json((await db.nutritionTargets.findUnique({ where: { userId: req.user.id } })) || null); }
  catch (err) { next(err); }
});

router.put('/targets', validate(targetsSchema), async (req, res, next) => {
  try {
    res.json(await db.nutritionTargets.upsert({
      where: { userId: req.user.id }, update: req.body, create: { ...req.body, userId: req.user.id },
    }));
  } catch (err) { next(err); }
});

module.exports = router;
