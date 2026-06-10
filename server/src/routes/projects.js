const express = require('express');
const Project = require('../models/Project');
const Task = require('../models/Task');

const router = express.Router();

// Lista con recuento de tareas no hechas.
router.get('/', async (req, res) => {
  const [projects, counts] = await Promise.all([
    Project.find().sort({ createdAt: 1 }),
    Task.aggregate([
      { $match: { status: { $ne: 'hecha' } } },
      { $group: { _id: '$project', count: { $sum: 1 } } },
    ]),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  res.json(
    projects.map((p) => ({
      ...p.toObject(),
      pendingCount: countMap[String(p._id)] || 0,
    }))
  );
});

router.post('/', async (req, res) => {
  try {
    const { name, color, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Falta "name": el nombre del proyecto o área' });
    const project = await Project.create({ name, color: color || '#b3471d', description: description || '' });
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    for (const key of ['name', 'color', 'description']) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const project = await Project.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const count = await Task.countDocuments({ project: req.params.id, status: { $ne: 'hecha' } });
  if (count > 0) {
    return res.status(409).json({ error: `Este proyecto tiene ${count} tareas sin terminar; complétalas o muévelas antes` });
  }
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
  await Task.deleteMany({ project: req.params.id }); // limpia las hechas que quedaran
  res.json({ ok: true });
});

module.exports = router;
