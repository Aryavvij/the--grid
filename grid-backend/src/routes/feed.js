const express = require('express');
const db      = require('../lib/db');
const { feedLimiter } = require('../middleware/security');
const { buildCalendar } = require('../lib/ics');

// ─── Public .ics subscription feed ────────────────────────────────────────────
// Mounted OUTSIDE the authenticated calendar router on purpose: iOS cannot send
// a cookie or Authorization header when polling a subscribed calendar, so the
// unguessable token in the URL is the credential. Kept in its own file so the
// public-by-design surface is obvious and can't drift into the authed routes.

const router = express.Router();

router.get('/:token.ics', feedLimiter, async (req, res, next) => {
  try {
    const token = req.params.token;
    // Cheap shape check before touching the database.
    if (!token || token.length < 24 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return res.status(404).send('Not found');
    }

    const user = await db.user.findUnique({
      where:  { calendarToken: token },
      select: { id: true, name: true, calendarFeedOpts: true },
    });
    // Same response for a malformed and an unknown token — no enumeration signal.
    if (!user) return res.status(404).send('Not found');

    const opts = user.calendarFeedOpts || {};

    // Window: recent past for context, a year ahead for planning.
    const from = new Date(); from.setMonth(from.getMonth() - 1);
    const to   = new Date(); to.setFullYear(to.getFullYear() + 1);

    const [events, blocks, tasks, split] = await Promise.all([
      opts.events !== false
        ? db.calendarEvent.findMany({
            where: { userId: user.id, startTime: { gte: from, lte: to } },
            select: { id: true, title: true, description: true, startTime: true,
                      endTime: true, allDay: true },
            take: 1000,
          })
        : [],
      opts.timetable !== false
        ? db.timetableBlock.findMany({
            where: { userId: user.id },
            select: { dayIndex: true, startHour: true, endHour: true, label: true },
          })
        : [],
      opts.deadlines !== false
        ? db.weeklyTask.findMany({
            where: { userId: user.id, done: false },
            select: { id: true, name: true, category: true, deadline: true, done: true },
          })
        : [],
      opts.gym === true
        ? db.gymSplit.findFirst({ where: { userId: user.id, isActive: true }, select: { days: true } })
        : null,
    ]);

    const gymDays = [];
    if (split && Array.isArray(split.days)) {
      split.days.forEach((d, i) => {
        if (d && d.title && !/rest|stasis/i.test(d.title)) {
          gymDays.push({ dayIndex: i, title: d.title });
        }
      });
    }

    const ics = buildCalendar({
      name: (user.name ? user.name + ' — ' : '') + 'The Grid',
      events, blocks, tasks, gymDays, opts,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="grid.ics"');
    // Never let a shared cache hold one user's calendar.
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.send(ics);
  } catch (err) { next(err); }
});

module.exports = router;
