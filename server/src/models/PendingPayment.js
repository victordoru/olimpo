const mongoose = require('mongoose');

// Cobro pendiente SIN factura (p. ej. trabajos cobrados en negro).
// Las facturas emitidas y no cobradas ya viven en Invoice{status:'enviada'};
// esto cubre lo que no se factura pero está pendiente de cobrar.
const pendingPaymentSchema = new mongoose.Schema(
  {
    concept: { type: String, required: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    amount: { type: Number, required: true },
    expectedDate: { type: Date, default: null },
    status: { type: String, enum: ['pendiente', 'cobrado'], default: 'pendiente' },
    paidDate: { type: Date, default: null },
    // Movimiento bancario que lo saldó (si se concilió con el banco).
    paidTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingPayment', pendingPaymentSchema);
