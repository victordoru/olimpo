const express = require('express');
const Note = require('../models/Note');

const router = express.Router();

// /api/notes?q=texto para buscar
router.get('/', async (req, res) => {
  const { q } = req.query;
  const filter = q ? { $text: { $search: q } } : {};
  res.json(await Note.find(filter).sort({ updatedAt: -1 }).limit(100));
});

router.get('/:id', async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  res.json(note);
});

router.post('/', async (req, res) => {
  try {
    const { title, content, tags } = req.body;
    if (!content) return res.status(400).json({ error: 'Falta "content": el texto de la nota (markdown)' });
    const note = await Note.create({ title: title || '', content, tags: tags || [] });
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    for (const key of ['title', 'content', 'tags']) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const note = await Note.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const note = await Note.findByIdAndDelete(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  res.json({ ok: true });
});

module.exports = router;
