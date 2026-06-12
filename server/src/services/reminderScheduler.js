// Scheduler de recordatorios: cada 30s busca recordatorios vencidos y no
// enviados de tareas sin terminar, y los manda por el canal de notify.js.
// Si un envío falla se reintenta en cada tick durante 30 min; pasado ese
// margen se marca como enviado-con-error para no insistir eternamente.

const Task = require('../models/Task');
const { notify } = require('./notify');

const TICK_MS = 30 * 1000;
const GIVE_UP_MS = 30 * 60 * 1000;

function formatReminder(task) {
  const lines = [`⏰ Recordatorio: ${task.text}`];
  const extras = [];
  if (task.project?.name) extras.push(task.project.name);
  if (task.priority) extras.push(`prioridad ${task.priority}`);
  if (task.due) {
    const opts = { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' };
    if (task.hasTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
    extras.push(`vence ${new Date(task.due).toLocaleString('es-ES', opts)}`);
  }
  if (extras.length) lines.push(extras.join(' · '));
  return lines.join('\n');
}

async function tick() {
  const now = new Date();
  const tasks = await Task.find({
    status: { $ne: 'hecha' },
    reminders: { $elemMatch: { at: { $lte: now }, sentAt: null } },
  }).populate('project', 'name');

  for (const task of tasks) {
    let dirty = false;
    for (const r of task.reminders) {
      if (r.sentAt || r.at > now) continue;
      try {
        const channel = await notify(formatReminder(task));
        r.sentAt = new Date();
        r.error = '';
        console.log(`[reminders] enviado por ${channel}: ${task.text}`);
      } catch (err) {
        r.error = err.message;
        if (now - r.at > GIVE_UP_MS) {
          r.sentAt = new Date(); // dejamos de reintentar, queda el error registrado
          console.error(`[reminders] abandonado tras 30 min: ${err.message}`);
        } else {
          console.error(`[reminders] fallo (se reintenta): ${err.message}`);
        }
      }
      dirty = true;
    }
    if (dirty) await task.save();
  }
}

function startReminderScheduler() {
  setInterval(() => tick().catch((err) => console.error('[reminders] tick:', err.message)), TICK_MS);
  console.log('[reminders] scheduler activo (cada 30s)');
}

module.exports = { startReminderScheduler };
