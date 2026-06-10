const mongoose = require('mongoose');

// Registro de toda escritura que haga el agente (Hermes) a través de la API.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: String, enum: ['agent', 'user'], required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    body: { type: Object, default: null },
    reason: { type: String, default: '' },
    statusCode: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
