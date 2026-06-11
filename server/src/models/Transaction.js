const mongoose = require('mongoose');

// Un movimiento de la cuenta: del banco (GoCardless), importado (CSV) o manual.
// El signo de "amount" marca el sentido: negativo = gasto, positivo = ingreso.
const transactionSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['manual', 'gocardless', 'import'], default: 'manual' },
    // Id del movimiento en el banco; único para no duplicar al re-sincronizar.
    externalId: { type: String, unique: true, sparse: true },
    account: { type: String, default: '' },
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EUR' },
    description: { type: String, default: '' },
    counterparty: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    kind: { type: String, enum: ['gasto', 'ingreso'], default: 'gasto' },
    // Conciliación: cuando un ingreso casa con una factura o un cobro pendiente.
    reconciledInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    reconciledPending: { type: mongoose.Schema.Types.ObjectId, ref: 'PendingPayment', default: null },
    // Cuando hay varios candidatos, se dejan como sugerencia para confirmar a mano.
    suggestedInvoices: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }], default: [] },
    suggestedPendings: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PendingPayment' }], default: [] },
    // Marcar transferencias internas / movimientos que no cuentan en estadísticas.
    ignored: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    // Payload original del banco, por si hace falta depurar.
    raw: { type: Object, default: null },
  },
  { timestamps: true }
);

// El "kind" se deriva del signo salvo que se fije a mano.
transactionSchema.pre('validate', function () {
  if (this.isModified('amount') && !this.isModified('kind')) {
    this.kind = this.amount < 0 ? 'gasto' : 'ingreso';
  }
});

transactionSchema.index({ date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
