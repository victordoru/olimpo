const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    due: { type: Date, default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ done: 1, due: 1 });

module.exports = mongoose.model('Task', taskSchema);
