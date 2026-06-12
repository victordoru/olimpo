const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');

const router = express.Router();

// Filtros combinables:
//   ?when=today | pending | all   (pending = no hechas; por defecto)
//   ?project=<id> | none          (none = sin proyecto)
//   ?status=pendiente | en_curso | hecha
router.get('/', async (req, res) => {
  const { when = 'pending', project, status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  else if (when === 'pending') filter.status = { $ne: 'hecha' };
  if (when === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.status = { $ne: 'hecha' };
    filter.due = { $gte: start, $lt: end };
  }
  if (project === 'none') filter.project = null;
  else if (project) filter.project = project;

  res.json(await Task.find(filter).populate('project', 'name color').sort({ due: 1, createdAt: 1 }));
});

// reminders llega como array de fechas ISO; lo normalizamos al subdocumento.
// Se conserva el estado de envío de los recordatorios que no cambian.
function buildReminders(input, existing = []) {
  if (!Array.isArray(input)) throw new Error('"reminders" debe ser un array de fechas ISO');
  return input.map((value) => {
    const at = new Date(value);
    if (isNaN(at)) throw new Error(`Fecha de recordatorio inválida: ${value}`);
    const prev = existing.find((r) => r.at?.getTime() === at.getTime());
    return prev || { at, sentAt: null, error: '' };
  });
}

async function resolveProject(projectId) {
  if (projectId === undefined) return undefined;
  if (!projectId) return null;
  const project = await Project.findById(projectId);
  if (!project) {
    const all = await Project.find().select('name');
    throw new Error(`Proyecto no encontrado. Disponibles: ${all.map((p) => `${p.name} (${p._id})`).join(', ') || 'ninguno'}`);
  }
  return project._id;
}

router.post('/', async (req, res) => {
  try {
    const { text, due, priority, status, project, hasTime, reminders } = req.body;
    if (!text) return res.status(400).json({ error: 'Falta "text": qué hay que hacer' });
    const task = await Task.create({
      text,
      due: due ? new Date(due) : null,
      // due con hora explícita ("2026-06-12T17:30") marca hasTime salvo que venga dado.
      hasTime: hasTime ?? (typeof due === 'string' && due.includes('T')),
      reminders: reminders ? buildReminders(reminders) : [],
      priority: priority || '',
      status: status || 'pendiente',
      project: (await resolveProject(project)) ?? null,
    });
    res.status(201).json(await task.populate('project', 'name color'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (req.body.text !== undefined) task.text = req.body.text;
    if (req.body.due !== undefined) {
      task.due = req.body.due ? new Date(req.body.due) : null;
      if (req.body.hasTime === undefined) {
        task.hasTime = typeof req.body.due === 'string' && req.body.due.includes('T');
      }
    }
    if (req.body.hasTime !== undefined) task.hasTime = !!req.body.hasTime;
    if (req.body.reminders !== undefined) {
      task.reminders = buildReminders(req.body.reminders || [], task.reminders);
    }
    if (req.body.priority !== undefined) task.priority = req.body.priority;
    if (req.body.project !== undefined) task.project = await resolveProject(req.body.project);
    // Compatibilidad: done:true equivale a status:'hecha'.
    if (req.body.done !== undefined) req.body.status = req.body.done ? 'hecha' : 'pendiente';
    if (req.body.status !== undefined) {
      task.status = req.body.status;
      task.doneAt = task.status === 'hecha' ? new Date() : null;
    }
    await task.save();
    res.json(await task.populate('project', 'name color'));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json({ ok: true });
});

module.exports = router;
