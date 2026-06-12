const express = require('express');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const { notify, activeChannel } = require('../services/notify');

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

// Canal de notificaciones configurado y prueba de envío (solo web).
router.get('/notify', (req, res) => {
  res.json({ channel: activeChannel() });
});

router.post('/notify-test', async (req, res) => {
  try {
    const channel = await notify('🔔 Prueba de notificación de Olimpo. Si lees esto, los recordatorios funcionan.');
    if (channel === 'console') {
      return res.status(400).json({ error: 'Ningún canal configurado: añade las variables de WhatsApp/Telegram al .env del servidor.' });
    }
    res.json({ ok: true, channel });
  } catch (err) {
    res.status(502).json({ error: `El envío falló: ${err.message}` });
  }
});

// Consultar el registro de actividad del agente.
router.get('/audit', async (req, res) => {
  res.json(await AuditLog.find().sort({ createdAt: -1 }).limit(100));
});

module.exports = router;
