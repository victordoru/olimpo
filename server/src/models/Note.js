const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    content: { type: String, default: '' },
    tags: { type: [String], default: [] },
    // Jerarquía estilo Notion: null = página raíz.
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null },
    icon: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

noteSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Note', noteSchema);
