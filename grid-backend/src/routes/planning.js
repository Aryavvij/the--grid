const express = require('express');
const db      = require('../lib/db');
const { requireAuth }   = require('../middleware/auth');
const { validate, z }   = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const dayIndex = z.number().int().min(0).max(6);
const dateStr  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const timetableSchema = z.object({
  blocks: z.array(z.object({
    dayIndex,
    startHour: z.number().int().min(0).max(23),
    endHour:   z.number().int().min(1).max(24),
    label:     z.string().trim().min(1).max(60),
  })).max(500),
});

const tasksSchema = z.object({
  tasks: z.array(z.object({
    dayIndex,
    name:      z.string().trim().min(1).max(200),
    category:  z.string().trim().max(40).optional(),
    status:    z.string().trim().max(20).optional(),
    done:      z.boolean().optional(),
    deadline:  dateStr.optional().nullable(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })).max(500),
});

const sessionSchema = z.object({
  date:      dateStr,
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  minutes:   z.number().int().min(1).max(1440),
  category:  z.string().trim().max(40).optional(),
  note:      z.string().trim().max(500).optional().nullable(),
});

// ─── Timetable ────────────────────────────────────────────────────────────────
// The grid is small and always edited as a whole, so a replace-all write keeps
// the client simple and the stored state exactly consistent with what is shown.

router.get('/timetable', async (req, res, next) => {
  try {
    const blocks = await db.timetableBlock.findMany({
      where:   { userId: req.user.id },
      orderBy: [{ dayIndex: 'asc' }, { startHour: 'asc' }],
      select:  { dayIndex: true, startHour: true, endHour: true, label: true },
    });
    res.json({ blocks });
  } catch (err) { next(err); }
});

router.put('/timetable', validate(timetableSchema), async (req, res, next) => {
  try {
    const blocks = req.body.blocks.filter(b => b.endHour > b.startHour);
    await db.$transaction([
      db.timetableBlock.deleteMany({ where: { userId: req.user.id } }),
      db.timetableBlock.createMany({
        data: blocks.map(b => ({ ...b, userId: req.user.id })),
      }),
    ]);
    res.json({ saved: blocks.length });
  } catch (err) { next(err); }
});

// ─── Weekly tasks ─────────────────────────────────────────────────────────────

router.get('/tasks', async (req, res, next) => {
  try {
    const tasks = await db.weeklyTask.findMany({
      where:   { userId: req.user.id },
      orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }],
      select:  { id: true, dayIndex: true, name: true, category: true,
                 status: true, done: true, deadline: true, sortOrder: true },
    });
    res.json({ tasks });
  } catch (err) { next(err); }
});

router.put('/tasks', validate(tasksSchema), async (req, res, next) => {
  try {
    await db.$transaction([
      db.weeklyTask.deleteMany({ where: { userId: req.user.id } }),
      db.weeklyTask.createMany({
        data: req.body.tasks.map((t, i) => ({
          userId:    req.user.id,
          dayIndex:  t.dayIndex,
          name:      t.name,
          category:  (t.category || 'general').toLowerCase(),
          status:    t.status || 'pending',
          done:      !!t.done,
          deadline:  t.deadline || null,
          sortOrder: t.sortOrder ?? i,
        })),
      }),
    ]);
    res.json({ saved: req.body.tasks.length });
  } catch (err) { next(err); }
});

// ─── Study sessions ───────────────────────────────────────────────────────────
// Append-only, unlike the two above — history matters and is queried by range.

router.get('/study', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { userId: req.user.id };
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || '') || /^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      where.date = {};
      if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) where.date.gte = from;
      if (/^\d{4}-\d{2}-\d{2}$/.test(to   || '')) where.date.lte = to;
    }
    const sessions = await db.studySession.findMany({
      where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500,
      select: { id: true, date: true, startTime: true, minutes: true, category: true, note: true },
    });
    res.json({ sessions });
  } catch (err) { next(err); }
});

router.post('/study', validate(sessionSchema), async (req, res, next) => {
  try {
    const session = await db.studySession.create({
      data: {
        userId:    req.user.id,
        date:      req.body.date,
        startTime: req.body.startTime || null,
        minutes:   req.body.minutes,
        category:  (req.body.category || 'general').toLowerCase(),
        note:      req.body.note || null,
      },
    });
    res.status(201).json({ session });
  } catch (err) { next(err); }
});

router.delete('/study/:id', async (req, res, next) => {
  try {
    const owned = await db.studySession.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!owned) return res.status(404).json({ error: 'Session not found' });
    await db.studySession.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ─── Plan vs actual ───────────────────────────────────────────────────────────
// Planned hours come from the timetable, actual hours from logged sessions.
// Computed server-side so any client gets the same answer.

router.get('/plan-vs-actual', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const [blocks, sessions] = await Promise.all([
      db.timetableBlock.findMany({
        where: { userId: req.user.id },
        select: { label: true, startHour: true, endHour: true },
      }),
      db.studySession.findMany({
        where: { userId: req.user.id, date: { gte: sinceStr } },
        select: { category: true, minutes: true },
      }),
    ]);

    const IGNORE = new Set(['sleep', 'break', 'idle', 'maint', 'recovery']);
    const planned = {}, actual = {};

    blocks.forEach(b => {
      const key = b.label.toLowerCase().replace(/_/g, ' ');
      if (IGNORE.has(key)) return;
      planned[key] = (planned[key] || 0) + (b.endHour - b.startHour);
    });
    sessions.forEach(s => {
      const key = (s.category || 'general').toLowerCase();
      actual[key] = (actual[key] || 0) + s.minutes / 60;
    });

    const rows = [...new Set([...Object.keys(planned), ...Object.keys(actual)])]
      .map(label => ({
        label,
        planned: +(planned[label] || 0).toFixed(1),
        actual:  +(actual[label]  || 0).toFixed(1),
      }))
      .sort((a, b) => (b.planned + b.actual) - (a.planned + a.actual));

    res.json({ days, rows });
  } catch (err) { next(err); }
});

module.exports = router;
