const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

noteSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Note', noteSchema);
