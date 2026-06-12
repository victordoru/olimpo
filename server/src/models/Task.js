const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    status: {
      type: String,
      enum: ['pendiente', 'en_curso', 'hecha'],
      default: 'pendiente',
    },
    priority: {
      type: String,
      enum: ['', 'baja', 'media', 'alta', 'urgente'],
      default: '',
    },
    due: { type: Date, default: null },
    // Si due tiene hora concreta (false = tarea "de todo el día").
    hasTime: { type: Boolean, default: false },
    // Recordatorios: el scheduler los envía por el canal configurado
    // (WhatsApp/Telegram) cuando `at` vence. `sentAt` evita reenvíos.
    reminders: [
      {
        at: { type: Date, required: true },
        sentAt: { type: Date, default: null },
        error: { type: String, default: '' },
      },
    ],
    doneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, project: 1, due: 1 });
taskSchema.index({ 'reminders.at': 1, 'reminders.sentAt': 1 });

module.exports = mongoose.model('Task', taskSchema);
