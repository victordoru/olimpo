const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nif: { type: String, default: '', trim: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    zip: { type: String, default: '' },
    country: { type: String, default: 'España' },
    email: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Client', clientSchema);
