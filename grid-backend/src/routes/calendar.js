const crypto  = require('crypto');
const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// ─── Subscription feed management ─────────────────────────────────────────────
// The feed itself is served publicly from /api/feed; these endpoints mint,
// inspect and revoke the token that authorises it.

const feedOptsSchema = z.object({
  events:    z.boolean().optional(),
  timetable: z.boolean().optional(),
  deadlines: z.boolean().optional(),
  gym:       z.boolean().optional(),
});

function newToken() {
  // 32 random bytes, URL-safe — far beyond guessable at 60 requests/15min.
  return crypto.randomBytes(32).toString('base64url');
}

router.get('/feed-token', async (req, res, next) => {
  try {
    const u = await db.user.findUnique({
      where: { id: req.user.id },
      select: { calendarToken: true, calendarFeedOpts: true },
    });
    res.json({ token: u && u.calendarToken, options: (u && u.calendarFeedOpts) || {} });
  } catch (err) { next(err); }
});

// Mint on first use, or rotate to revoke every existing subscription.
router.post('/feed-token', async (req, res, next) => {
  try {
    const token = newToken();
    await db.user.update({ where: { id: req.user.id }, data: { calendarToken: token } });
    res.json({ token });
  } catch (err) { next(err); }
});

router.delete('/feed-token', async (req, res, next) => {
  try {
    await db.user.update({ where: { id: req.user.id }, data: { calendarToken: null } });
    res.json({ revoked: true });
  } catch (err) { next(err); }
});

router.put('/feed-options', validate(feedOptsSchema), async (req, res, next) => {
  try {
    const u = await db.user.update({
      where: { id: req.user.id },
      data:  { calendarFeedOpts: req.body },
      select: { calendarFeedOpts: true },
    });
    res.json({ options: u.calendarFeedOpts });
  } catch (err) { next(err); }
});

// GET /api/calendar/events?from=&to=
router.get('/events', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { userId: req.user.id };
    if (from) where.startTime = { gte: new Date(from) };
    if (to)   where.startTime = { ...where.startTime, lte: new Date(to) };
    const events = await db.calendarEvent.findMany({ where, orderBy: { startTime: 'asc' } });
    res.json(events);
  } catch (err) { next(err); }
});

// POST /api/calendar/events
router.post('/events', async (req, res, next) => {
  try {
    const { title, description, startTime, endTime, allDay, color, recurrence } = req.body;
    if (!title || !startTime) return res.status(400).json({ error: 'title and startTime are required' });
    const event = await db.calendarEvent.create({
      data: { userId: req.user.id, title, description, startTime: new Date(startTime), endTime: endTime ? new Date(endTime) : null, allDay: allDay || false, color, recurrence },
    });
    res.status(201).json(event);
  } catch (err) { next(err); }
});

// PUT /api/calendar/events/:id
router.put('/events/:id', async (req, res, next) => {
  try {
    const event = await db.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const data = { ...req.body };
    if (data.startTime) data.startTime = new Date(data.startTime);
    if (data.endTime)   data.endTime   = new Date(data.endTime);
    const updated = await db.calendarEvent.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', async (req, res, next) => {
  try {
    const event = await db.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    await db.calendarEvent.delete({ where: { id: req.params.id } });
    res.json({ message: 'Event deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
