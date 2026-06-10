const express = require('express');
const Workout = require('../models/Workout');

const router = express.Router();

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  res.json(await Workout.find().sort({ date: -1 }).limit(limit));
});

router.post('/', async (req, res) => {
  try {
    const { date, type, entries, notes } = req.body;
    const workout = await Workout.create({
      date: date ? new Date(date) : new Date(),
      type: type || '',
      entries: entries || [],
      notes: notes || '',
    });
    res.status(201).json(workout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    for (const key of ['date', 'type', 'entries', 'notes']) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const workout = await Workout.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!workout) return res.status(404).json({ error: 'Entreno no encontrado' });
    res.json(workout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const workout = await Workout.findByIdAndDelete(req.params.id);
  if (!workout) return res.status(404).json({ error: 'Entreno no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
