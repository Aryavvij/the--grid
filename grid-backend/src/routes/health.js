const express = require('express');
const jwt     = require('jsonwebtoken');
const db      = require('../lib/db');
const gh      = require('../lib/googleHealth');
const { saveToken, syncUser } = require('../lib/healthSync');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

const returnUrl = () => process.env.HEALTH_RETURN_URL || (process.env.FRONTEND_URL || '').split(',')[0].trim();

// ─── Public-by-design endpoints (placed BEFORE requireAuth) ───────────────────

// GET /api/health/google/callback — Google redirects the browser here. The user is
// identified by a short-lived signed `state`, not the cookie (cross-site cookies are unreliable here).
router.get('/google/callback', async (req, res) => {
  const back = (q) => res.redirect(`${returnUrl()}/?health=${q}`);
  try {
    const { code, state, error } = req.query;
    if (error || !code || !state) return back('denied');
    const { uid } = jwt.verify(String(state), process.env.JWT_SECRET, { audience: 'health-oauth' });
    const t = await gh.exchangeCode(String(code));
    if (!t.refresh_token) return back('no_refresh_token');
    await saveToken(uid, t.refresh_token, t.scope);
    syncUser(uid, 30).catch(e => console.error('[health] first sync failed:', e.message));   // fire and forget
    back('connected');
  } catch (e) { console.error('[health] callback:', e.message); back('error'); }
});

// GET /api/health/cron/sync — Vercel cron (daily). Authorised by CRON_SECRET, never by a user cookie.
router.get('/cron/sync', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
    const tokens = await db.healthToken.findMany({ select: { userId: true } });
    const results = [];
    for (const { userId } of tokens) {
      try { results.push({ userId, ...(await syncUser(userId, 7)) }); } catch (e) { results.push({ userId, error: e.message }); }
    }
    res.json({ synced: results.length, results });
  } catch (err) { next(err); }
});

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

// ─── Google connection ────────────────────────────────────────────────────────

// GET /api/health/google/connect → { url } (the frontend navigates to it)
router.get('/google/connect', (req, res, next) => {
  try {
    const state = jwt.sign({ uid: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m', audience: 'health-oauth' });
    res.json({ url: gh.authUrl(state) });
  } catch (err) { err.status = 500; next(err); }
});

// POST /api/health/sync { days } — "Sync now"
router.post('/sync', validate(z.object({ days: z.number().int().min(1).max(90).default(7) })), async (req, res, next) => {
  try { res.json(await syncUser(req.user.id, req.body.days)); } catch (err) { next(err); }
});

// DELETE /api/health/google — disconnect (stored data is kept)
router.delete('/google', async (req, res, next) => {
  try { await db.healthToken.deleteMany({ where: { userId: req.user.id } }); res.json({ message: 'Disconnected' }); } catch (err) { next(err); }
});

module.exports = router;
