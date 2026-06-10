const express = require('express');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(await Settings.get());
});

router.patch('/', async (req, res) => {
  try {
    const allowed = [
      'businessName', 'nif', 'address', 'city', 'zip', 'email', 'phone',
      'iban', 'ivaDefault', 'irpfDefault', 'nextInvoiceNumber',
    ];
    const settings = await Settings.get();
    for (const key of allowed) {
      if (req.body[key] !== undefined) settings[key] = req.body[key];
    }
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Consultar el registro de actividad del agente.
router.get('/audit', async (req, res) => {
  res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(100));
});

module.exports = router;
