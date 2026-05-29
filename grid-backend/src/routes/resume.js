const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/resume
router.get('/', async (req, res, next) => {
  try {
    const data = await db.resumeData.findUnique({ where: { userId: req.user.id } });
    res.json(data?.sections || { experience: [], education: [], skills: [], links: {} });
  } catch (err) { next(err); }
});

// PUT /api/resume  — replaces the entire sections blob
router.put('/', async (req, res, next) => {
  try {
    const { sections } = req.body;
    if (!sections) return res.status(400).json({ error: 'sections is required' });
    const data = await db.resumeData.upsert({
      where:  { userId: req.user.id },
      create: { userId: req.user.id, sections },
      update: { sections },
    });
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
