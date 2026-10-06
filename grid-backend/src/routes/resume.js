const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// ─── Schema ───────────────────────────────────────────────────────────────────

// The resume is a free-form blob: category -> list of entries (projects,
// internships, ...) plus a `__profile` object for the PDF header and skills.
// Entries change shape as the editor grows, so this checks structure and size
// rather than every field; the 1mb body cap bounds the rest.
const resumeSchema = z.object({
  sections: z.record(
    z.string().max(40),
    z.union([z.array(z.unknown()).max(500), z.record(z.string(), z.unknown())])
  ).refine(s => Object.keys(s).length <= 40, 'Too many resume sections'),
});

// GET /api/resume
router.get('/', async (req, res, next) => {
  try {
    const data = await db.resumeData.findUnique({ where: { userId: req.user.id } });
    res.json(data?.sections || { experience: [], education: [], skills: [], links: {} });
  } catch (err) { next(err); }
});

// PUT /api/resume  — replaces the entire sections blob
router.put('/', validate(resumeSchema), async (req, res, next) => {
  try {
    const { sections } = req.body;
    const data = await db.resumeData.upsert({
      where:  { userId: req.user.id },
      create: { userId: req.user.id, sections },
      update: { sections },
    });
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
