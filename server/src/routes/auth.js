const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = jwt.sign({ u: 'victor' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    // Actívalo (COOKIE_SECURE=true) solo si se sirve detrás de HTTPS;
    // por Tailscale en HTTP plano la cookie Secure nunca llegaría.
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (!token) return res.json({ authenticated: false });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ authenticated: true });
  } catch {
    return res.json({ authenticated: false });
  }
});

module.exports = router;
