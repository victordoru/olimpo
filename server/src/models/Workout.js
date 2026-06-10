const mongoose = require('mongoose');

const setSchema = new mongoose.Schema(
  {
    exercise: { type: String, required: true },
    sets: { type: Number, default: 1 },
    reps: { type: Number, default: null },
    weight: { type: Number, default: null },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const workoutSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    type: { type: String, default: '' },
    entries: { type: [setSchema], default: [] },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Workout', workoutSchema);
