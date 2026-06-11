const mongoose = require('mongoose');

// Categoría de gasto o ingreso. Las "rules" son subcadenas (en minúsculas) que,
// si aparecen en la descripción de un movimiento, lo autocategorizan.
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['gasto', 'ingreso'], default: 'gasto' },
    color: { type: String, default: '#525252' },
    emoji: { type: String, default: '' },
    rules: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Categorías iniciales para empezar con algo útil (autónomo en España).
const DEFAULTS = [
  { name: 'Software y suscripciones', kind: 'gasto', color: '#39FF14', emoji: '💾', rules: ['adobe', 'google', 'openai', 'github', 'notion', 'figma', 'vercel', 'aws', 'apple.com/bill'] },
  { name: 'Material y equipo', kind: 'gasto', color: '#7DD3FC', emoji: '📦', rules: ['amazon', 'pccomponentes', 'mediamarkt', 'leroy'] },
  { name: 'Transporte', kind: 'gasto', color: '#FBBF24', emoji: '⛽', rules: ['repsol', 'cepsa', 'galp', 'renfe', 'uber', 'cabify', 'bla bla', 'parking'] },
  { name: 'Comida y dietas', kind: 'gasto', color: '#FB7185', emoji: '🍽️', rules: ['mercadona', 'carrefour', 'lidl', 'restaurante', 'glovo', 'just eat', 'uber eats'] },
  { name: 'Cuotas e impuestos', kind: 'gasto', color: '#A78BFA', emoji: '🏛️', rules: ['seguridad social', 'agencia tributaria', 'aeat', 'tgss', 'autonomo'] },
  { name: 'Comisiones bancarias', kind: 'gasto', color: '#94A3B8', emoji: '🏦', rules: ['comision', 'comisión', 'mantenimiento cuenta'] },
  { name: 'Servicios y suministros', kind: 'gasto', color: '#34D399', emoji: '💡', rules: ['iberdrola', 'endesa', 'naturgy', 'movistar', 'vodafone', 'orange', 'o2'] },
  { name: 'Otros gastos', kind: 'gasto', color: '#525252', emoji: '•', rules: [] },
  { name: 'Ingresos por facturas', kind: 'ingreso', color: '#39FF14', emoji: '🧾', rules: [] },
  { name: 'Otros ingresos', kind: 'ingreso', color: '#34D399', emoji: '💶', rules: [] },
];

// Devuelve las categorías; si no hay ninguna, siembra las de por defecto.
categorySchema.statics.ensureSeeded = async function () {
  const count = await this.estimatedDocumentCount();
  if (count === 0) await this.insertMany(DEFAULTS);
  return this.find().sort({ kind: 1, name: 1 });
};

module.exports = mongoose.model('Category', categorySchema);
