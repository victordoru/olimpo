const AuditLog = require('../models/AuditLog');

// Rutas (por prefijo) donde el agente puede escribir.
// Todo lo que no esté aquí es de solo lectura para Hermes.
const AGENT_WRITE_WHITELIST = [
  '/invoices', // crear borradores y editarlos (la ruta valida que sean borradores)
  '/recurring', // generar la siguiente factura de una plantilla recurrente
  '/tasks',
  '/projects', // crear/editar áreas de tareas (borrar sigue vetado)
  '/notes',
  '/workouts',
  '/transactions', // apuntar gastos manuales y categorizar movimientos
  '/categories', // crear/editar categorías de gasto e ingreso
  '/pending', // crear cobros pendientes (en negro) y marcarlos cobrados
  // OJO: '/bank' queda FUERA a propósito: conectar el banco es sensible y solo se hace desde la web.
];

function agentGuard(req, res, next) {
  if (req.auth.type !== 'agent') return next();

  const isWrite = req.method !== 'GET';
  if (!isWrite) return next();

  // El agente nunca borra nada.
  if (req.method === 'DELETE') {
    return res.status(403).json({
      error: 'El agente no puede borrar. Hazlo desde la web si de verdad quieres eliminarlo.',
    });
  }

  const allowed = AGENT_WRITE_WHITELIST.some((p) => req.path.startsWith(p));
  if (!allowed) {
    return res.status(403).json({
      error: `El agente no tiene permiso de escritura en ${req.path}. Rutas permitidas: ${AGENT_WRITE_WHITELIST.join(', ')}`,
    });
  }

  // Toda escritura del agente debe explicar su motivo (campo "motivo" o header).
  const reason = (req.body && req.body.motivo) || req.headers['x-motivo'] || '';
  if (!reason) {
    return res.status(400).json({
      error: 'Falta el campo "motivo": explica en una frase por qué haces este cambio.',
    });
  }
  req.agentReason = reason;
  if (req.body) delete req.body.motivo; // que no llegue a los modelos

  // Auditoría: se registra al terminar la respuesta, con el código de estado real.
  res.on('finish', () => {
    AuditLog.create({
      actor: 'agent',
      method: req.method,
      path: req.originalUrl,
      body: req.body,
      reason,
      statusCode: res.statusCode,
    }).catch((err) => console.error('[audit] error guardando log:', err.message));
  });

  next();
}

module.exports = { agentGuard };
