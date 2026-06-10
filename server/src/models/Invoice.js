const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    concept: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 0 },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    // Sin número hasta que se emite: los borradores no consumen numeración.
    number: { type: Number, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['borrador', 'enviada', 'cobrada'],
      default: 'borrador',
    },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    // Copia de los datos del cliente en el momento de emitir,
    // para que la factura no cambie si luego editas el cliente.
    clientSnapshot: { type: Object, default: null },
    // Línea bajo la fecha: "Servicios correspondientes al mes de abril de 2026".
    subject: { type: String, default: '' },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    ivaPct: { type: Number, default: 21 },
    irpfPct: { type: Number, default: 7 },
    base: { type: Number, default: 0 },
    iva: { type: Number, default: 0 },
    irpf: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    issueDate: { type: Date, default: null },
    paidDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    // PDF subido a mano (facturas históricas importadas).
    importedPdf: { type: String, default: null },
  },
  { timestamps: true }
);

const round2 = (n) => Math.round(n * 100) / 100;

invoiceSchema.methods.recalc = function () {
  const base = this.items.reduce((sum, it) => sum + it.quantity * it.price, 0);
  this.base = round2(base);
  this.iva = round2(base * (this.ivaPct / 100));
  this.irpf = round2(base * (this.irpfPct / 100));
  this.total = round2(this.base + this.iva - this.irpf);
};

invoiceSchema.pre('validate', function () {
  this.recalc();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
