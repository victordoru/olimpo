const mongoose = require('mongoose');

// Plantilla de factura recurrente (p. ej. la mensualidad del Teatro).
// {MES} y {AÑO} en subjectTemplate y en los conceptos se sustituyen al generar.
const recurringSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    items: {
      type: [
        {
          concept: { type: String, required: true },
          quantity: { type: Number, default: 1 },
          price: { type: Number, required: true },
          _id: false,
        },
      ],
      validate: (v) => v.length > 0,
    },
    subjectTemplate: { type: String, default: '' },
    ivaPct: { type: Number, default: 21 },
    irpfPct: { type: Number, default: 7 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recurring', recurringSchema);
