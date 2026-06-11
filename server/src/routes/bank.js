const express = require('express');
const BankConnection = require('../models/BankConnection');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const gc = require('../services/gocardless');
const { autocategorize } = require('../services/categorize');
const { reconcileTransaction } = require('../services/reconcile');

const router = express.Router();

// Estado de la conexión (y si GoCardless está configurado en este servidor).
router.get('/status', async (req, res) => {
  const conn = await BankConnection.get();
  res.json({
    configured: gc.isConfigured(),
    status: conn.status,
    institutionName: conn.institutionName,
    accounts: conn.accountIds.length,
    agreementExpires: conn.agreementExpires,
    lastSync: conn.lastSync,
  });
});

// Lista de bancos de un país (para elegir el tuyo).
router.get('/institutions', async (req, res) => {
  try {
    const list = await gc.getInstitutions(req.query.country || 'es');
    res.json(list);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Paso 1: crea la requisición y devuelve el link de autorización del banco.
router.post('/connect', async (req, res) => {
  try {
    const { institutionId, institutionName } = req.body;
    if (!institutionId) return res.status(400).json({ error: 'Falta "institutionId" (elige tu banco con GET /bank/institutions)' });
    const redirect = process.env.GOCARDLESS_REDIRECT_URI || `${req.protocol}://${req.get('host')}/finanzas`;
    const requisition = await gc.createRequisition(institutionId, redirect);
    const conn = await BankConnection.get();
    conn.institutionId = institutionId;
    conn.institutionName = institutionName || institutionId;
    conn.requisitionId = requisition.id;
    conn.status = 'pendiente_autorizacion';
    conn.accountIds = [];
    await conn.save();
    res.json({ link: requisition.link, requisitionId: requisition.id });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Paso 2: tras autorizar en el banco, recoge las cuentas conectadas.
router.post('/finalize', async (req, res) => {
  try {
    const conn = await BankConnection.get();
    if (!conn.requisitionId) return res.status(400).json({ error: 'No hay ninguna conexión iniciada. Empieza por POST /bank/connect' });
    const requisition = await gc.getRequisition(conn.requisitionId);
    conn.accountIds = requisition.accounts || [];
    conn.status = conn.accountIds.length ? 'conectado' : 'pendiente_autorizacion';
    await conn.save();
    res.json({ status: conn.status, accounts: conn.accountIds.length });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Paso 3: descarga movimientos, deduplica por externalId, autocategoriza y concilia.
router.post('/sync', async (req, res) => {
  try {
    const conn = await BankConnection.get();
    if (conn.status !== 'conectado' || !conn.accountIds.length) {
      return res.status(400).json({ error: 'No hay cuentas conectadas. Conecta el banco primero.' });
    }
    const categories = await Category.find();
    let nuevos = 0, conciliados = 0;

    for (const accountId of conn.accountIds) {
      const data = await gc.getTransactions(accountId);
      const booked = data.transactions?.booked || [];
      for (const raw of booked) {
        const norm = gc.normalize(raw, accountId);
        const exists = await Transaction.findOne({ externalId: norm.externalId });
        if (exists) continue;
        const txn = new Transaction(norm);
        txn.category = autocategorize(txn, categories);
        await txn.save();
        nuevos++;
        if (txn.amount > 0) {
          const r = await reconcileTransaction(txn);
          if (r.matched) conciliados++;
        }
      }
    }
    conn.lastSync = new Date();
    await conn.save();
    res.json({ ok: true, nuevos, conciliados, lastSync: conn.lastSync });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
