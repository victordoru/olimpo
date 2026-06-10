const express = require('express');
const Recurring = require('../models/Recurring');
const Invoice = require('../models/Invoice');
const Client = require('../models/Client');

const router = express.Router();

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

router.get('/', async (req, res) => {
  res.json(await Recurring.find().populate('client', 'name').sort({ createdAt: 1 }));
});

router.post('/', async (req, res) => {
  try {
    const { name, clientId, items, subjectTemplate, ivaPct, irpfPct, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Falta "name": el nombre de la recurrente' });
    const client = await Client.findById(clientId);
    if (!client) return res.status(400).json({ error: 'Cliente no encontrado' });
    const recurring = await Recurring.create({
      name,
      client: client._id,
      items,
      subjectTemplate: subjectTemplate || '',
      ivaPct: ivaPct ?? 21,
      irpfPct: irpfPct ?? 7,
      notes: notes || '',
    });
    res.status(201).json(await recurring.populate('client', 'name'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Genera el borrador del periodo. Por defecto, el MES ANTERIOR al actual
// (las mensualidades se facturan a primeros del mes siguiente).
// Body opcional: { "month": 4, "year": 2026 } (month 1-12).
router.post('/:id/generate', async (req, res) => {
  try {
    const recurring = await Recurring.findById(req.params.id);
    if (!recurring) return res.status(404).json({ error: 'Recurrente no encontrada' });

    let { month, year } = req.body || {};
    if (!month) {
      const prev = new Date();
      prev.setDate(1);
      prev.setMonth(prev.getMonth() - 1);
      month = prev.getMonth() + 1;
      year = year || prev.getFullYear();
    }
    year = year || new Date().getFullYear();
    const mes = MESES[month - 1];
    if (!mes) return res.status(400).json({ error: '"month" debe estar entre 1 y 12' });

    const fill = (s) => (s || '').replaceAll('{MES}', mes).replaceAll('{AÑO}', String(year));

    const invoice = await Invoice.create({
      client: recurring.client,
      subject: fill(recurring.subjectTemplate),
      items: recurring.items.map((it) => ({ ...it.toObject(), concept: fill(it.concept) })),
      ivaPct: recurring.ivaPct,
      irpfPct: recurring.irpfPct,
      notes: recurring.notes,
    });
    res.status(201).json(await invoice.populate('client'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const recurring = await Recurring.findByIdAndDelete(req.params.id);
  if (!recurring) return res.status(404).json({ error: 'Recurrente no encontrada' });
  res.json({ ok: true });
});

module.exports = router;
