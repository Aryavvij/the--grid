const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const MAX_IMAGE = 750_000, MAX_THUMB = 60_000;                       // base64 characters; the 1 MB body cap is the outer limit
const MAX_PHOTOS = 400;

// ─── Weight ───────────────────────────────────────────────────────────────────

router.get('/weight', async (req, res, next) => {
  try {
    const q = z.object({ from: dateStr.optional(), to: dateStr.optional() }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
    const where = { userId: req.user.id };
    if (q.data.from || q.data.to) where.date = { ...(q.data.from && { gte: q.data.from }), ...(q.data.to && { lte: q.data.to }) };
    res.json(await db.weightLog.findMany({ where, orderBy: { date: 'asc' }, take: 1500 }));
  } catch (err) { next(err); }
});

router.put('/weight/:date', validate(z.object({ kg: z.number().min(30).max(250) })), async (req, res, next) => {
  try {
    const d = dateStr.safeParse(req.params.date);
    if (!d.success) return res.status(400).json({ error: d.error.issues[0].message });
    res.json(await db.weightLog.upsert({ where: { userId_date: { userId: req.user.id, date: d.data } }, update: { kg: req.body.kg }, create: { userId: req.user.id, date: d.data, kg: req.body.kg } }));
  } catch (err) { next(err); }
});

router.delete('/weight/:date', async (req, res, next) => {
  try {
    const d = dateStr.safeParse(req.params.date);
    if (!d.success) return res.status(400).json({ error: d.error.issues[0].message });
    await db.weightLog.deleteMany({ where: { userId: req.user.id, date: d.data } });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ─── Photos ───────────────────────────────────────────────────────────────────

// JPEG only: checked by prefix AND by the file's magic bytes, so nothing else can be stored.
const jpegDataUrl = (max) => z.string().max(max, 'Image is too large').refine((s) => {
  if (!s.startsWith('data:image/jpeg;base64,')) return false;
  const head = Buffer.from(s.slice(23, 23 + 8), 'base64');
  return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}, 'Only JPEG images are accepted');

const photoSchema = z.object({
  date: dateStr, note: z.string().trim().max(300).nullish(), weightKg: z.number().min(30).max(250).nullish(),
  image: jpegDataUrl(MAX_IMAGE), thumb: jpegDataUrl(MAX_THUMB),
});

// GET /api/progress/photos — metadata + thumbnail only
router.get('/photos', async (req, res, next) => {
  try {
    res.json(await db.progressPhoto.findMany({ where: { userId: req.user.id }, orderBy: { date: 'asc' }, take: MAX_PHOTOS, select: { id: true, date: true, note: true, weightKg: true, thumb: true } }));
  } catch (err) { next(err); }
});

// GET /api/progress/photos/:id — full image
router.get('/photos/:id', async (req, res, next) => {
  try {
    const p = await db.progressPhoto.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!p) return res.status(404).json({ error: 'Photo not found' });
    res.json(p);
  } catch (err) { next(err); }
});

router.post('/photos', validate(photoSchema), async (req, res, next) => {
  try {
    if ((await db.progressPhoto.count({ where: { userId: req.user.id } })) >= MAX_PHOTOS) return res.status(409).json({ error: `Photo limit reached (${MAX_PHOTOS}). Delete some first.` });
    const row = await db.progressPhoto.create({ data: { ...req.body, userId: req.user.id }, select: { id: true, date: true, note: true, weightKg: true, thumb: true } });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete('/photos/:id', async (req, res, next) => {
  try {
    const p = await db.progressPhoto.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!p) return res.status(404).json({ error: 'Photo not found' });
    await db.progressPhoto.delete({ where: { id: p.id } });
    res.json({ message: 'Photo deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
