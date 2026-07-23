const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const {
  scoreFor, resolveStreak, fragility, todayInZone, addDays,
} = require('../lib/metrics');

const router = express.Router();
router.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const METRIC_TYPES = ['BINARY', 'QUANTITY', 'DURATION', 'SCALE', 'DERIVED'];
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const createSchema = z.object({
  name:          z.string().trim().min(1).max(80),
  type:          z.enum(METRIC_TYPES),
  unit:          z.string().trim().max(20).optional().nullable(),
  icon:          z.string().trim().max(40).optional().nullable(),
  color:         z.string().trim().max(30).optional().nullable(),
  target:        z.number().positive().max(1e9).optional().nullable(),
  targetDays:    z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  derivedSource: z.string().trim().max(120).optional().nullable(),
  sortOrder:     z.number().int().min(0).max(9999).optional(),
});

const updateSchema = createSchema.partial();

const logSchema = z.object({
  date:  dateStr,
  value: z.number().min(0).max(1e9),
  mode:  z.enum(['set', 'increment']).optional(),   // increment = repeated quantity taps
});

const commitSchema = z.object({
  entries: z.array(z.object({
    defId: z.string().uuid(),
    value: z.number().min(0).max(1e9),
  })).max(200),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function userToday(userId) {
  const profile = await db.userProfile.findUnique({
    where: { userId }, select: { timezone: true },
  });
  return todayInZone(profile && profile.timezone);
}

/** Write one log, computing score + snapshotting the target that judged it. */
async function upsertLog(userId, def, date, value, source = 'MANUAL', mode = 'set') {
  let finalValue = Number(value) || 0;

  if (mode === 'increment') {
    const existing = await db.metricLog.findUnique({
      where: { defId_loggedDate: { defId: def.id, loggedDate: date } },
      select: { value: true },
    });
    finalValue = (existing ? existing.value : 0) + finalValue;
  }

  const score = scoreFor(def.type, finalValue, def.target);

  return db.metricLog.upsert({
    where:  { defId_loggedDate: { defId: def.id, loggedDate: date } },
    create: { defId: def.id, userId, loggedDate: date, value: finalValue,
              targetAtLog: def.target ?? null, score, source },
    // MANUAL always wins over DERIVED — an explicit tap is the user's intent.
    update: { value: finalValue, targetAtLog: def.target ?? null, score, source },
  });
}

// ─── GET /api/metrics/matrix?from=&to= ────────────────────────────────────────
// Single call hydrating grid + console + heat-wall: defs, logs, streaks, at-risk.

router.get('/matrix', async (req, res, next) => {
  try {
    const today = await userToday(req.user.id);
    const to    = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')   ? req.query.to   : today;
    const from  = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : addDays(to, -365);

    const defs = await db.metricDef.findMany({
      where:   { userId: req.user.id, archived: false },
      orderBy: { sortOrder: 'asc' },
    });

    const logs = await db.metricLog.findMany({
      where:  { userId: req.user.id, loggedDate: { gte: from, lte: to } },
      select: { defId: true, loggedDate: true, value: true, score: true, source: true },
      orderBy: { loggedDate: 'asc' },
    });

    const byDef = new Map(defs.map(d => [d.id, []]));
    for (const l of logs) if (byDef.has(l.defId)) byDef.get(l.defId).push(l);

    const streaks = {};
    let atRisk = null;
    for (const def of defs) {
      const dLogs = byDef.get(def.id) || [];
      streaks[def.id] = resolveStreak(def, dLogs, today);
      const f = fragility(def, dLogs, today);
      if (!atRisk || f > atRisk.score) {
        atRisk = { defId: def.id, name: def.name, score: f };
      }
    }

    // Composite per-day completion — drives the heat-wall intensity.
    const dayScores = {};
    for (const l of logs) {
      if (!dayScores[l.loggedDate]) dayScores[l.loggedDate] = { sum: 0, n: 0 };
      dayScores[l.loggedDate].sum += Math.min(l.score, 1);
      dayScores[l.loggedDate].n++;
    }
    const heat = Object.entries(dayScores).map(([date, v]) => ({
      date, score: defs.length ? +(v.sum / defs.length).toFixed(3) : 0,
    }));

    res.json({ today, from, to, defs, logs, streaks, atRisk, heat });
  } catch (err) { next(err); }
});

// ─── CRUD ─────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const defs = await db.metricDef.findMany({
      where: { userId: req.user.id, archived: false },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(defs);
  } catch (err) { next(err); }
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const def = await db.metricDef.create({
      data: { ...req.body, userId: req.user.id },
    });
    res.status(201).json(def);
  } catch (err) { next(err); }
});

// Target changes apply to FUTURE days only — past logs keep their targetAtLog.
router.patch('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const owned = await db.metricDef.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!owned) return res.status(404).json({ error: 'Metric not found' });

    const def = await db.metricDef.update({
      where: { id: req.params.id }, data: req.body,
    });
    res.json(def);
  } catch (err) { next(err); }
});

// Soft-archive: logs survive so history stays intact.
router.delete('/:id', async (req, res, next) => {
  try {
    const owned = await db.metricDef.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!owned) return res.status(404).json({ error: 'Metric not found' });

    await db.metricDef.update({
      where: { id: req.params.id }, data: { archived: true },
    });
    res.json({ archived: true });
  } catch (err) { next(err); }
});

// ─── POST /api/metrics/:id/logs ───────────────────────────────────────────────

router.post('/:id/logs', validate(logSchema), async (req, res, next) => {
  try {
    const def = await db.metricDef.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!def) return res.status(404).json({ error: 'Metric not found' });

    const log = await upsertLog(
      req.user.id, def, req.body.date, req.body.value, 'MANUAL', req.body.mode || 'set'
    );

    const today = await userToday(req.user.id);
    const logs  = await db.metricLog.findMany({
      where: { defId: def.id },
      select: { loggedDate: true, score: true, source: true },
    });

    res.json({ log, streak: resolveStreak(def, logs, today) });
  } catch (err) { next(err); }
});

// ─── POST /api/metrics/days/:date/commit ──────────────────────────────────────
// Batched whole-day write. Idempotent via @@unique(defId, loggedDate), so an
// offline queue can replay it safely. Returns recomputed streaks so the client
// never re-derives them.

router.post('/days/:date/commit', validate(commitSchema), async (req, res, next) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    }

    const ids  = req.body.entries.map(e => e.defId);
    const defs = await db.metricDef.findMany({
      where: { id: { in: ids }, userId: req.user.id },
    });
    const defById = new Map(defs.map(d => [d.id, d]));

    const unknown = ids.filter(id => !defById.has(id));
    if (unknown.length) {
      return res.status(400).json({ error: 'Unknown metric ids', details: unknown });
    }

    await db.$transaction(
      req.body.entries.map(e => {
        const def   = defById.get(e.defId);
        const score = scoreFor(def.type, e.value, def.target);
        return db.metricLog.upsert({
          where:  { defId_loggedDate: { defId: def.id, loggedDate: date } },
          create: { defId: def.id, userId: req.user.id, loggedDate: date,
                    value: e.value, targetAtLog: def.target ?? null, score, source: 'MANUAL' },
          update: { value: e.value, targetAtLog: def.target ?? null, score, source: 'MANUAL' },
        });
      })
    );

    const today = await userToday(req.user.id);
    const all   = await db.metricLog.findMany({
      where:  { userId: req.user.id, defId: { in: ids } },
      select: { defId: true, loggedDate: true, score: true, source: true },
    });

    const streaks = {};
    let sealedScore = 0;
    for (const def of defs) {
      const dLogs = all.filter(l => l.defId === def.id);
      streaks[def.id] = resolveStreak(def, dLogs, today);
      const todayLog = dLogs.find(l => l.loggedDate === date);
      sealedScore += todayLog ? Math.min(todayLog.score, 1) : 0;
    }

    const composite = defs.length ? +(sealedScore / defs.length).toFixed(3) : 0;
    res.json({ date, committed: req.body.entries.length, composite, sealed: composite >= 1, streaks });
  } catch (err) { next(err); }
});

module.exports = router;
