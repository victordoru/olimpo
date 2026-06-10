const jwt = require('jsonwebtoken');

// Dos formas de entrar:
//  - Web: cookie de sesión (JWT firmado) tras login con APP_PASSWORD.
//  - Agente (Hermes): header Authorization: Bearer AGENT_API_KEY.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const key = header.slice(7);
    if (key && key === process.env.AGENT_API_KEY) {
      req.auth = { type: 'agent' };
      return next();
    }
    return res.status(401).json({ error: 'API key inválida' });
  }

  const token = req.cookies && req.cookies.session;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      req.auth = { type: 'user' };
      return next();
    } catch {
      return res.status(401).json({ error: 'Sesión caducada, vuelve a entrar' });
    }
  }

  return res.status(401).json({ error: 'No autenticado' });
}

module.exports = { requireAuth };
