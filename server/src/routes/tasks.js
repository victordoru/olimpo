const express = require('express');
const Task = require('../models/Task');

const router = express.Router();

// /api/tasks?when=today | pending | all
router.get('/', async (req, res) => {
  const { when = 'pending' } = req.query;
  let filter = {};
  if (when === 'pending') filter = { done: false };
  if (when === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter = { done: false, due: { $gte: start, $lt: end } };
  }
  res.json(await Task.find(filter).sort({ due: 1, createdAt: 1 }));
});

router.post('/', async (req, res) => {
  try {
    const { text, due } = req.body;
    if (!text) return res.status(400).json({ error: 'Falta "text": qué hay que hacer' });
    const task = await Task.create({ text, due: due ? new Date(due) : null });
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (req.body.text !== undefined) task.text = req.body.text;
    if (req.body.due !== undefined) task.due = req.body.due ? new Date(req.body.due) : null;
    if (req.body.done !== undefined) {
      task.done = Boolean(req.body.done);
      task.doneAt = task.done ? new Date() : null;
    }
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json({ ok: true });
});

module.exports = router;
