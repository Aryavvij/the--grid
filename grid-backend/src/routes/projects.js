const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const projectSchema = z.object({
  title:       z.string().trim().min(1, 'title is required').max(200),
  description: z.string().trim().max(500).nullish(),
  status:      z.string().trim().max(30).optional(),
  priority:    z.string().trim().max(20).nullish(),
  deadline:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Deadline must be YYYY-MM-DD').nullish(),
  color:       z.string().trim().max(20).nullish(),
  tasks:       z.array(z.unknown()).max(500).optional(),
  notes:       z.string().max(5000).nullish(),
  progress:    z.number().int().min(0).max(100).optional(),
  sortOrder:   z.number().int().min(0).max(10000).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { userId: req.user.id };
    if (status) where.status = status;
    const projects = await db.project.findMany({ where, orderBy: { sortOrder: 'asc' } });
    res.json(projects);
  } catch (err) { next(err); }
});

router.post('/', validate(projectSchema), async (req, res, next) => {
  try {
    const { title, description, status, priority, deadline, color, tasks, notes, progress } = req.body;
    const project = await db.project.create({
      data: { userId: req.user.id, title, description, status: status || 'active', priority, deadline, color, tasks: tasks || [], notes, progress: progress || 0 },
    });
    res.status(201).json(project);
  } catch (err) { next(err); }
});

router.put('/:id', validate(projectSchema.partial()), async (req, res, next) => {
  try {
    const project = await db.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const updated = await db.project.update({ where: { id: req.params.id }, data: req.body });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const project = await db.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await db.project.delete({ where: { id: req.params.id } });
    res.json({ message: 'Project deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
