const mongoose = require('mongoose');

// Estado de la conexión con el banco vía GoCardless (Bank Account Data).
// Documento único: Victor enlaza una cuenta. Inerte hasta que haya claves
// en el .env del servidor (GOCARDLESS_SECRET_ID / _KEY).
const bankConnectionSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: '' },
    institutionName: { type: String, default: '' },
    requisitionId: { type: String, default: '' },
    accountIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['desconectado', 'pendiente_autorizacion', 'conectado', 'caducado'],
      default: 'desconectado',
    },
    agreementExpires: { type: Date, default: null },
    lastSync: { type: Date, default: null },
    // Último saldo conocido de la cuenta (lo trae el extracto importado
    // en la columna "Disponible" o, en su día, la sincronización del banco).
    lastBalance: { type: Number, default: null },
    lastBalanceDate: { type: Date, default: null },
  },
  { timestamps: true }
);

bankConnectionSchema.statics.get = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('BankConnection', bankConnectionSchema);
