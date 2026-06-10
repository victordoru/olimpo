const express = require('express');
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(await Client.find().sort({ name: 1 }));
});

router.post('/', async (req, res) => {
  try {
    const { name, nif, address, city, zip, country, email, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Falta "name": el nombre o razón social del cliente' });
    const client = await Client.create({ name, nif, address, city, zip, country, email, notes });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'nif', 'address', 'city', 'zip', 'country', 'email', 'notes'];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const count = await Invoice.countDocuments({ client: req.params.id });
  if (count > 0) {
    return res.status(409).json({ error: `Este cliente tiene ${count} facturas; no se puede borrar` });
  }
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
