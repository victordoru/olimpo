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
    doneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, project: 1, due: 1 });

module.exports = mongoose.model('Task', taskSchema);
