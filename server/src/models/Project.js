const mongoose = require('mongoose');

// Áreas de vida / proyectos que agrupan tareas (estilo Linear).
const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: '#b3471d' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
