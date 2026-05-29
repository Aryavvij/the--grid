const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

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
