const express = require('express');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');

const router = express.Router();

// Lista las categorías (sembrando las de por defecto la primera vez).
router.get('/', async (req, res) => {
  res.json(await Category.ensureSeeded());
});

router.post('/', async (req, res) => {
  try {
    const { name, kind, color, emoji, rules } = req.body;
    if (!name) return res.status(400).json({ error: 'Falta "name": el nombre de la categoría' });
    const category = await Category.create({
      name,
      kind: kind === 'ingreso' ? 'ingreso' : 'gasto',
      color: color || '#525252',
      emoji: emoji || '',
      rules: Array.isArray(rules) ? rules : [],
    });
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'kind', 'color', 'emoji', 'rules'];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    const category = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Borrar: los movimientos que la usaran quedan sin categoría (no se borran).
router.delete('/:id', async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });
  await Transaction.updateMany({ category: req.params.id }, { $set: { category: null } });
  res.json({ ok: true });
});

module.exports = router;
