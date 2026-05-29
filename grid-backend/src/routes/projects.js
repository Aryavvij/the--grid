const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { userId: req.user.id };
    if (status) where.status = status;
    const projects = await db.project.findMany({ where, orderBy: { sortOrder: 'asc' } });
    res.json(projects);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description, status, priority, deadline, color, tasks, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const project = await db.project.create({
      data: { userId: req.user.id, title, description, status: status || 'active', priority, deadline, color, tasks: tasks || [], notes },
    });
    res.status(201).json(project);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
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
