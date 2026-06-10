const mongoose = require('mongoose');

// Documento único con tus datos de facturación y preferencias.
const settingsSchema = new mongoose.Schema(
  {
    businessName: { type: String, default: '' },
    nif: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    zip: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    iban: { type: String, default: '' },
    ivaDefault: { type: Number, default: 21 },
    irpfDefault: { type: Number, default: 7 },
    // Número que recibirá la PRÓXIMA factura emitida.
    nextInvoiceNumber: { type: Number, default: 1 },
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

// Reserva atómica del siguiente número de factura.
settingsSchema.statics.claimInvoiceNumber = async function () {
  const doc = await this.findOneAndUpdate(
    {},
    { $inc: { nextInvoiceNumber: 1 } },
    { new: false, upsert: true, setDefaultsOnInsert: true }
  );
  return doc ? doc.nextInvoiceNumber : 1;
};

module.exports = mongoose.model('Settings', settingsSchema);
