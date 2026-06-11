const express = require('express');
const Note = require('../models/Note');

const router = express.Router();

// /api/notes?q=texto para buscar; sin q devuelve todas (el cliente monta el árbol)
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (q) {
    return res.json(await Note.find({ $text: { $search: q } }).sort({ updatedAt: -1 }).limit(100));
  }
  res.json(await Note.find().sort({ order: 1, createdAt: 1 }));
});

router.get('/:id', async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  res.json(note);
});

router.post('/', async (req, res) => {
  try {
    const { title, content, tags, parentId, icon, order } = req.body;
    if (parentId && !(await Note.exists({ _id: parentId }))) {
      return res.status(400).json({ error: 'parentId no corresponde a ninguna nota' });
    }
    const note = await Note.create({
      title: title || '',
      content: content || '',
      tags: tags || [],
      parentId: parentId || null,
      icon: icon || '',
      order: order || 0,
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Comprueba que moviendo `id` bajo `parentId` no se crea un ciclo.
async function createsCycle(id, parentId) {
  let cursor = parentId;
  while (cursor) {
    if (String(cursor) === String(id)) return true;
    const parent = await Note.findById(cursor).select('parentId');
    cursor = parent ? parent.parentId : null;
  }
  return false;
}

router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    for (const key of ['title', 'content', 'tags', 'parentId', 'icon', 'order']) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.parentId) {
      if (!(await Note.exists({ _id: update.parentId }))) {
        return res.status(400).json({ error: 'parentId no corresponde a ninguna nota' });
      }
      if (await createsCycle(req.params.id, update.parentId)) {
        return res.status(400).json({ error: 'No puedes mover una página dentro de sí misma' });
      }
    }
    const note = await Note.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Borra la página y todas sus subpáginas.
router.delete('/:id', async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  const toDelete = [note._id];
  let frontier = [note._id];
  while (frontier.length) {
    const children = await Note.find({ parentId: { $in: frontier } }).select('_id');
    frontier = children.map((c) => c._id);
    toDelete.push(...frontier);
  }
  await Note.deleteMany({ _id: { $in: toDelete } });
  res.json({ ok: true, deleted: toDelete.length });
});

module.exports = router;
