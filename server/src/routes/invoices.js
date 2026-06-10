const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const Settings = require('../models/Settings');
const { generateInvoicePdf, renderInvoiceHtml, STORAGE_DIR } = require('../services/pdf');
const { parseInvoiceText } = require('../services/nl');

const router = express.Router();

const upload = multer({
  dest: path.join(STORAGE_DIR, 'importadas'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Solo se aceptan PDF')),
});

function parseItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('La factura necesita al menos una línea en "items": [{concept, quantity, price}]');
  }
  return items.map((it) => {
    if (!it.concept || typeof it.concept !== 'string') {
      throw new Error('Cada línea necesita un "concept" (texto)');
    }
    const quantity = it.quantity === undefined ? 1 : Number(it.quantity);
    const price = Number(it.price);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`"quantity" inválida en "${it.concept}"`);
    if (!Number.isFinite(price)) throw new Error(`"price" inválido en "${it.concept}": debe ser un número en euros, p. ej. 350`);
    return { concept: it.concept.trim(), quantity, price };
  });
}

// Resumen: cuánto te deben y cuánto has facturado.
router.get('/summary', async (req, res) => {
  const [pending, byYear] = await Promise.all([
    Invoice.aggregate([
      { $match: { status: 'enviada' } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { status: { $ne: 'borrador' } } },
      { $group: { _id: { $year: '$issueDate' }, base: { $sum: '$base' }, total: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),
  ]);
  res.json({
    pendienteCobro: pending[0] ? { total: pending[0].total, facturas: pending[0].count } : { total: 0, facturas: 0 },
    porAño: byYear.map((y) => ({ año: y._id, base: y.base, total: y.total, facturas: y.count })),
  });
});

// Crear borrador desde texto libre (dictado o escrito).
router.post('/nl', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Falta "text": describe la factura' });

    const clients = await Client.find().select('name');
    const today = new Date().toISOString().slice(0, 10);
    const parsed = await parseInvoiceText(text.trim(), clients.map((c) => c.name), today);

    const wanted = (parsed.clientName || '').toLowerCase();
    const client =
      clients.find((c) => c.name.toLowerCase() === wanted) ||
      clients.find((c) => c.name.toLowerCase().includes(wanted) || wanted.includes(c.name.toLowerCase()));
    if (!client) {
      return res.status(400).json({
        error: `No encuentro el cliente "${parsed.clientName}". Clientes: ${clients.map((c) => c.name).join(', ') || 'ninguno'}. Créalo primero.`,
      });
    }

    const settings = await Settings.get();
    const invoice = await Invoice.create({
      client: client._id,
      subject: parsed.subject || '',
      items: parseItems(parsed.items),
      ivaPct: settings.ivaDefault,
      irpfPct: settings.irpfDefault,
      notes: parsed.notes || '',
    });
    res.status(201).json(await invoice.populate('client'));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const invoices = await Invoice.find(filter).populate('client').sort({ number: -1, createdAt: -1 });
  res.json(invoices);
});

router.get('/:id', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('client');
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json(invoice);
});

// Previsualización HTML con la misma plantilla que se usa para generar el PDF.
router.get('/:id/preview', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('client');
  if (!invoice) return res.status(404).send('Factura no encontrada');

  if (!invoice.clientSnapshot && invoice.client) invoice.clientSnapshot = invoice.client.toObject();
  const settings = await Settings.get();
  res.type('html').send(renderInvoiceHtml(invoice, settings));
});

// Crear borrador.
router.post('/', async (req, res) => {
  try {
    const { clientId, items, ivaPct, irpfPct, notes, subject } = req.body;
    const client = await Client.findById(clientId);
    if (!client) {
      const clients = await Client.find().select('name');
      return res.status(400).json({
        error: `Cliente no encontrado. Pasa "clientId" con uno de: ${clients.map((c) => `${c.name} (${c._id})`).join(', ') || 'ninguno aún — crea el cliente primero'}`,
      });
    }
    const settings = await Settings.get();
    const invoice = await Invoice.create({
      client: client._id,
      subject: subject || '',
      items: parseItems(items),
      ivaPct: ivaPct ?? settings.ivaDefault,
      irpfPct: irpfPct ?? settings.irpfDefault,
      notes: notes || '',
    });
    res.status(201).json(await invoice.populate('client'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Editar: solo borradores (las facturas emitidas son inmutables salvo su estado).
router.patch('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    if (invoice.status !== 'borrador') {
      return res.status(409).json({ error: `La factura Nº ${invoice.number} ya está emitida y no se puede editar. Crea una rectificativa si hace falta.` });
    }
    const { clientId, items, ivaPct, irpfPct, notes, subject } = req.body;
    if (subject !== undefined) invoice.subject = subject;
    if (clientId) {
      const client = await Client.findById(clientId);
      if (!client) return res.status(400).json({ error: 'Cliente no encontrado' });
      invoice.client = client._id;
    }
    if (items !== undefined) invoice.items = parseItems(items);
    if (ivaPct !== undefined) invoice.ivaPct = Number(ivaPct);
    if (irpfPct !== undefined) invoice.irpfPct = Number(irpfPct);
    if (notes !== undefined) invoice.notes = notes;
    await invoice.save();
    res.json(await invoice.populate('client'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Emitir: asigna número correlativo, congela datos del cliente y genera el PDF.
router.post('/:id/emit', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('client');
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  if (invoice.status !== 'borrador') {
    return res.status(409).json({ error: `Esta factura ya fue emitida como Nº ${invoice.number}` });
  }
  invoice.number = await Settings.claimInvoiceNumber();
  invoice.status = 'enviada';
  invoice.issueDate = req.body.issueDate ? new Date(req.body.issueDate) : new Date();
  invoice.clientSnapshot = invoice.client.toObject();
  await invoice.save();
  const settings = await Settings.get();
  await generateInvoicePdf(invoice, settings);
  res.json(invoice);
});

// Marcar cobrada.
router.post('/:id/paid', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  if (invoice.status === 'borrador') {
    return res.status(409).json({ error: 'Un borrador no puede marcarse como cobrado: emítelo primero' });
  }
  invoice.status = 'cobrada';
  invoice.paidDate = req.body.paidDate ? new Date(req.body.paidDate) : new Date();
  await invoice.save();
  res.json(invoice);
});

// Descargar PDF (se regenera si no existe; los borradores llevan marca de agua).
router.get('/:id/pdf', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('client');
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  if (invoice.importedPdf && fs.existsSync(invoice.importedPdf)) {
    return res.download(invoice.importedPdf, `factura-${invoice.number}.pdf`);
  }
  if (!invoice.clientSnapshot) invoice.clientSnapshot = invoice.client.toObject();
  const settings = await Settings.get();
  const { path: pdfPath, filename } = await generateInvoicePdf(invoice, settings);
  res.download(pdfPath, filename);
});

// Importar factura histórica con su PDF original (multipart/form-data).
router.post('/import', upload.single('pdf'), async (req, res) => {
  try {
    const { clientId, number, total, base, issueDate, status } = req.body;
    const client = await Client.findById(clientId);
    if (!client) return res.status(400).json({ error: 'Cliente no encontrado' });
    if (!number) return res.status(400).json({ error: 'Falta "number": el número que tenía la factura' });

    const baseNum = Number(base ?? total);
    const settings = await Settings.get();
    const invoice = new Invoice({
      number: Number(number),
      status: status === 'cobrada' ? 'cobrada' : 'enviada',
      client: client._id,
      clientSnapshot: client.toObject(),
      items: [{ concept: req.body.concept || 'Factura importada', quantity: 1, price: baseNum }],
      ivaPct: req.body.ivaPct !== undefined ? Number(req.body.ivaPct) : settings.ivaDefault,
      irpfPct: req.body.irpfPct !== undefined ? Number(req.body.irpfPct) : settings.irpfDefault,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      importedPdf: req.file ? req.file.path : null,
    });
    await invoice.save();
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Borrar: solo borradores y nunca el agente (bloqueado en agentGuard).
router.delete('/:id', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  if (invoice.status !== 'borrador') {
    return res.status(409).json({ error: 'Las facturas emitidas no se borran: romperías la numeración correlativa' });
  }
  await invoice.deleteOne();
  res.json({ ok: true });
});

module.exports = router;
