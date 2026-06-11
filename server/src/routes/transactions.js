const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const Invoice = require('../models/Invoice');
const PendingPayment = require('../models/PendingPayment');
const BankConnection = require('../models/BankConnection');
const { autocategorize } = require('../services/categorize');
const { reconcileTransaction, unreconcileTransaction } = require('../services/reconcile');
const { parseBankFile } = require('../services/bankImport');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /\.(xlsx|xls|csv)$/i.test(file.originalname)
      ? cb(null, true)
      : cb(new Error('Solo se aceptan extractos .xlsx, .xls o .csv')),
});

// Pipeline común de alta: dedupe → autocategorizar → guardar → conciliar.
async function ingestRows(rows, source, categories) {
  const result = { nuevos: 0, duplicados: 0, conciliados: [] };
  for (const row of rows) {
    if (row.externalId && (await Transaction.findOne({ externalId: row.externalId }))) {
      result.duplicados++;
      continue;
    }
    const txn = new Transaction({
      source,
      externalId: row.externalId,
      date: row.date,
      amount: row.amount,
      currency: row.currency || 'EUR',
      description: row.description || '',
      counterparty: row.counterparty || '',
      notes: row.notes || '',
      raw: row.raw ?? null,
    });
    txn.category = autocategorize(txn, categories);
    await txn.save();
    result.nuevos++;
    if (txn.amount > 0) {
      const r = await reconcileTransaction(txn);
      if (r.matched) {
        result.conciliados.push(
          r.type === 'invoice'
            ? `Factura Nº ${r.invoice.number} (${r.invoice.total}€) marcada cobrada`
            : `Cobro pendiente "${r.pending.concept}" (${r.pending.amount}€) marcado cobrado`
        );
      }
    }
  }
  return result;
}

const round2 = (n) => Math.round(n * 100) / 100;

// ───────── Estadísticas. Mes a mes (ingreso/gasto/neto), desglose por categoría
// del rango pedido, y las dos cifras de ingreso: fiscal (solo facturas) y real.
router.get('/summary', async (req, res) => {
  const now = new Date();
  // Por defecto, los últimos 12 meses naturales.
  const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const to = req.query.to ? new Date(req.query.to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const txMatch = { ignored: { $ne: true }, date: { $gte: from, $lte: to } };

  const [byMonth, byCategory, pendingInv, pendingNegro, fiscalThisYear] = await Promise.all([
    // Ingreso vs gasto por mes.
    Transaction.aggregate([
      { $match: txMatch },
      {
        $group: {
          _id: { y: { $year: '$date' }, m: { $month: '$date' } },
          ingreso: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
          gasto: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    // Gasto por categoría en el rango.
    Transaction.aggregate([
      { $match: { ...txMatch, amount: { $lt: 0 } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: 1 } },
    ]),
    // Pendiente de cobro: facturas enviadas.
    Invoice.aggregate([
      { $match: { status: 'enviada' } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    // Pendiente de cobro: cobros en negro.
    PendingPayment.aggregate([
      { $match: { status: 'pendiente' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // Ingreso fiscal del año en curso (facturas no borrador).
    Invoice.aggregate([
      { $match: { status: { $ne: 'borrador' }, issueDate: { $gte: new Date(now.getFullYear(), 0, 1) } } },
      { $group: { _id: null, base: { $sum: '$base' }, total: { $sum: '$total' } } },
    ]),
  ]);

  const cats = await Category.find().select('name color emoji kind');
  const catMap = Object.fromEntries(cats.map((c) => [String(c._id), c]));

  const conn = await BankConnection.get();
  const pendInvTotal = pendingInv[0] ? round2(pendingInv[0].total) : 0;
  const pendNegroTotal = pendingNegro[0] ? round2(pendingNegro[0].total) : 0;

  res.json({
    rango: { from, to },
    // Último saldo conocido de la cuenta y proyección si se cobrara todo.
    saldo: conn.lastBalance !== null
      ? { amount: conn.lastBalance, date: conn.lastBalanceDate }
      : null,
    proyeccion: conn.lastBalance !== null
      ? round2(conn.lastBalance + pendInvTotal + pendNegroTotal)
      : null,
    porMes: byMonth.map((r) => ({
      año: r._id.y,
      mes: r._id.m,
      ingreso: round2(r.ingreso),
      gasto: round2(Math.abs(r.gasto)),
      neto: round2(r.ingreso + r.gasto),
    })),
    porCategoria: byCategory.map((r) => {
      const c = r._id ? catMap[String(r._id)] : null;
      return {
        categoryId: r._id,
        name: c ? c.name : 'Sin categoría',
        color: c ? c.color : '#525252',
        emoji: c ? c.emoji : '',
        total: round2(Math.abs(r.total)),
        count: r.count,
      };
    }),
    pendienteCobro: {
      facturas: pendingInv[0] ? { total: round2(pendingInv[0].total), count: pendingInv[0].count } : { total: 0, count: 0 },
      negro: pendingNegro[0] ? { total: round2(pendingNegro[0].total), count: pendingNegro[0].count } : { total: 0, count: 0 },
    },
    ingresoFiscalAño: fiscalThisYear[0] ? round2(fiscalThisYear[0].total) : 0,
  });
});

// ───────── Listado con filtros.
router.get('/', async (req, res) => {
  const { from, to, kind, category, q, account, reconciled } = req.query;
  const filter = {};
  if (kind) filter.kind = kind;
  if (category) filter.category = category;
  if (account) filter.account = account;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ description: rx }, { counterparty: rx }, { notes: rx }];
  }
  if (reconciled === 'true') filter.$or = [{ reconciledInvoice: { $ne: null } }, { reconciledPending: { $ne: null } }];
  if (reconciled === 'false') { filter.reconciledInvoice = null; filter.reconciledPending = null; }

  const txns = await Transaction.find(filter)
    .populate('category', 'name color emoji kind')
    .populate('reconciledInvoice', 'number total')
    .populate('reconciledPending', 'concept amount')
    .populate('suggestedInvoices', 'number total')
    .populate('suggestedPendings', 'concept amount')
    .sort({ date: -1, createdAt: -1 })
    .limit(500);
  res.json(txns);
});

// ───────── Crear movimiento manual (autocategoriza y, si entra dinero, concilia).
router.post('/', async (req, res) => {
  try {
    const { date, amount, description, counterparty, account, category, notes } = req.body;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) {
      return res.status(400).json({ error: '"amount" debe ser un número distinto de 0 (negativo = gasto, positivo = ingreso)' });
    }
    if (!date) return res.status(400).json({ error: 'Falta "date" (fecha del movimiento, p. ej. 2026-06-11)' });

    const txn = new Transaction({
      source: 'manual',
      date: new Date(date),
      amount: amt,
      description: description || '',
      counterparty: counterparty || '',
      account: account || '',
      notes: notes || '',
      category: category || null,
    });

    if (!txn.category) {
      const cats = await Category.find();
      txn.category = autocategorize(txn, cats);
    }
    await txn.save();

    let reconcile = null;
    if (txn.amount > 0) reconcile = await reconcileTransaction(txn);

    const populated = await Transaction.findById(txn._id)
      .populate('category', 'name color emoji kind')
      .populate('reconciledInvoice', 'number total')
      .populate('reconciledPending', 'concept amount');
    res.status(201).json({ transaction: populated, reconcile });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ───────── Importar extracto del banco (Excel o CSV de BBVA u otro).
// multipart/form-data con el archivo en el campo "file". Tolera variaciones
// de formato; deduplica, autocategoriza y concilia ingresos. Si el extracto
// trae saldo ("Disponible"), lo guarda como último saldo conocido.
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Falta el archivo: súbelo en el campo "file" (multipart/form-data, .xlsx/.xls/.csv)' });
    }
    const { rows, balance } = parseBankFile(req.file.buffer);
    const categories = await Category.find();
    const result = await ingestRows(
      rows.map((r) => ({ ...r, raw: { disponible: r.disponible, file: req.file.originalname } })),
      'import',
      categories
    );

    if (balance) {
      const conn = await BankConnection.get();
      if (!conn.lastBalanceDate || balance.date >= conn.lastBalanceDate) {
        conn.lastBalance = balance.amount;
        conn.lastBalanceDate = balance.date;
        await conn.save();
      }
    }

    res.json({
      ok: true,
      leidos: rows.length,
      nuevos: result.nuevos,
      duplicados: result.duplicados,
      conciliados: result.conciliados,
      saldo: balance ? balance.amount : null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ───────── Alta masiva en JSON (pensada para Hermes: varios movimientos de una vez).
// Body: { "transactions": [{ "date", "amount", "description", "counterparty?" }] }
router.post('/bulk', async (req, res) => {
  try {
    const list = req.body.transactions;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ error: 'Pasa "transactions": un array de movimientos [{date, amount, description}]' });
    }
    const rows = list.map((t, i) => {
      const amount = Number(t.amount);
      if (!t.date || !Number.isFinite(amount) || amount === 0) {
        throw new Error(`Movimiento ${i + 1} inválido: necesita "date" y "amount" numérico distinto de 0 (negativo = gasto)`);
      }
      const date = new Date(t.date);
      if (isNaN(date)) throw new Error(`Movimiento ${i + 1}: fecha "${t.date}" no válida (usa YYYY-MM-DD)`);
      const description = (t.description || '').trim();
      return {
        date,
        amount,
        description: description || 'Movimiento',
        counterparty: (t.counterparty || '').trim(),
        notes: (t.notes || '').trim(),
        // Idempotente: si Hermes reintenta el mismo lote, no duplica.
        externalId: 'bulk:' + crypto.createHash('sha1')
          .update([date.toISOString().slice(0, 10), amount.toFixed(2), description.toLowerCase()].join('|'))
          .digest('hex'),
      };
    });
    const categories = await Category.find();
    const result = await ingestRows(rows, 'manual', categories);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ───────── Editar: categoría, notas, ignorar, sentido.
router.patch('/:id', async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Movimiento no encontrado' });
    const { category, notes, ignored, kind, description, counterparty } = req.body;
    if (category !== undefined) txn.category = category || null;
    if (notes !== undefined) txn.notes = notes;
    if (ignored !== undefined) txn.ignored = !!ignored;
    if (kind !== undefined) txn.kind = kind;
    if (description !== undefined) txn.description = description;
    if (counterparty !== undefined) txn.counterparty = counterparty;
    await txn.save();
    res.json(await txn.populate('category', 'name color emoji kind'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ───────── Deshacer una conciliación automática.
router.post('/:id/unreconcile', async (req, res) => {
  const txn = await Transaction.findById(req.params.id);
  if (!txn) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const reverted = await unreconcileTransaction(txn);
  res.json({ ok: true, reverted });
});

// ───────── Confirmar una sugerencia ambigua (Victor elige a cuál casa).
// Body: { invoiceId } o { pendingId }.
router.post('/:id/confirm', async (req, res) => {
  const txn = await Transaction.findById(req.params.id);
  if (!txn) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const { invoiceId, pendingId } = req.body;
  if (invoiceId) {
    const inv = await Invoice.findById(invoiceId);
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });
    inv.status = 'cobrada';
    inv.paidDate = txn.date;
    await inv.save();
    txn.reconciledInvoice = inv._id;
  } else if (pendingId) {
    const pen = await PendingPayment.findById(pendingId);
    if (!pen) return res.status(404).json({ error: 'Cobro pendiente no encontrado' });
    pen.status = 'cobrado';
    pen.paidDate = txn.date;
    pen.paidTransaction = txn._id;
    await pen.save();
    txn.reconciledPending = pen._id;
  } else {
    return res.status(400).json({ error: 'Pasa "invoiceId" o "pendingId" para confirmar la conciliación' });
  }
  txn.suggestedInvoices = [];
  txn.suggestedPendings = [];
  await txn.save();
  res.json(txn);
});

// ───────── Borrar: solo movimientos manuales o importados (los del banco se
// regeneran al sincronizar; márcalos como "ignorar" si molestan).
router.delete('/:id', async (req, res) => {
  const txn = await Transaction.findById(req.params.id);
  if (!txn) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (txn.source === 'gocardless') {
    return res.status(409).json({ error: 'Un movimiento del banco no se borra; márcalo como "ignorar" si no quieres contarlo' });
  }
  if (txn.reconciledInvoice || txn.reconciledPending) await unreconcileTransaction(txn);
  await txn.deleteOne();
  res.json({ ok: true });
});

module.exports = router;
