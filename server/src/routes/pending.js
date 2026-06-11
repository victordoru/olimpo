const express = require('express');
const PendingPayment = require('../models/PendingPayment');
const Client = require('../models/Client');

const router = express.Router();

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  res.json(await PendingPayment.find(filter).populate('client', 'name').sort({ status: 1, expectedDate: 1, createdAt: -1 }));
});

router.post('/', async (req, res) => {
  try {
    const { concept, clientId, amount, expectedDate, notes } = req.body;
    if (!concept) return res.status(400).json({ error: 'Falta "concept": qué cobro es' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: '"amount" debe ser un número positivo en euros' });
    let client = null;
    if (clientId) {
      client = await Client.findById(clientId);
      if (!client) return res.status(400).json({ error: 'Cliente no encontrado' });
    }
    const pending = await PendingPayment.create({
      concept,
      client: client ? client._id : null,
      amount: amt,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes: notes || '',
    });
    res.status(201).json(await pending.populate('client', 'name'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const pending = await PendingPayment.findById(req.params.id);
    if (!pending) return res.status(404).json({ error: 'Cobro pendiente no encontrado' });
    const { concept, clientId, amount, expectedDate, notes } = req.body;
    if (concept !== undefined) pending.concept = concept;
    if (clientId !== undefined) pending.client = clientId || null;
    if (amount !== undefined) pending.amount = Number(amount);
    if (expectedDate !== undefined) pending.expectedDate = expectedDate ? new Date(expectedDate) : null;
    if (notes !== undefined) pending.notes = notes;
    await pending.save();
    res.json(await pending.populate('client', 'name'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Marcar cobrado a mano.
router.post('/:id/paid', async (req, res) => {
  const pending = await PendingPayment.findById(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Cobro pendiente no encontrado' });
  pending.status = 'cobrado';
  pending.paidDate = req.body.paidDate ? new Date(req.body.paidDate) : new Date();
  await pending.save();
  res.json(pending);
});

router.delete('/:id', async (req, res) => {
  const pending = await PendingPayment.findByIdAndDelete(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Cobro pendiente no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
