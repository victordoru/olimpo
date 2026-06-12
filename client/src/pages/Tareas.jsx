import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const STATUS_ORDER = ['en_curso', 'pendiente', 'hecha'];
const STATUS_LABEL = { en_curso: 'En curso', pendiente: 'Pendiente', hecha: 'Hechas' };
const NEXT_STATUS = { pendiente: 'en_curso', en_curso: 'hecha', hecha: 'pendiente' };
const PRIORITIES = ['', 'baja', 'media', 'alta', 'urgente'];
const PRIORITY_LABEL = { '': '—', baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const PALETTE = ['#39ff14', '#f2f2f2', '#525252', '#9bff7a', '#2bd60e', '#8c8c8c', '#1d6a9e'];

// Avisos relativos al vencimiento (minutos antes). Sin hora, la base es las 09:00.
const REMINDER_PRESETS = [
  ['', 'Sin aviso'],
  ['0', 'Al vencer'],
  ['10', '10 min antes'],
  ['60', '1 h antes'],
  ['1440', '1 día antes'],
];

function buildDue(date, time) {
  if (!date) return { due: null, hasTime: false };
  return time ? { due: `${date}T${time}`, hasTime: true } : { due: date, hasTime: false };
}

function buildReminders(date, time, preset) {
  if (!date || preset === '') return [];
  const base = new Date(`${date}T${time || '09:00'}`);
  return [new Date(base.getTime() - Number(preset) * 60000).toISOString()];
}

// "Hoy 17:30", "Mañana", "Lun 23 jun", o vencida en rojo.
function dueLabel(t) {
  if (!t.due) return null;
  const d = new Date(t.due);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  let label =
    diff === 0 ? 'Hoy' :
    diff === 1 ? 'Mañana' :
    diff === -1 ? 'Ayer' :
    d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  if (t.hasTime) label += ` · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  const overdue = t.status !== 'hecha' && (t.hasTime ? d < new Date() : diff < 0);
  return { label, overdue };
}

function toDateInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function StatusIcon({ status, onClick }) {
  return (
    <button className={`status-icon ${status}`} onClick={onClick} title={`Pasar a ${STATUS_LABEL[NEXT_STATUS[status]].toLowerCase()}`}>
      {status === 'hecha' ? (
        <svg viewBox="0 0 14 14" width="15" height="15"><circle cx="7" cy="7" r="6.2" fill="currentColor" /><path d="M4.2 7.2l1.9 1.9 3.7-4" stroke="#fffdf8" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
      ) : status === 'en_curso' ? (
        <svg viewBox="0 0 14 14" width="15" height="15"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M7 1 A6 6 0 0 1 7 13 Z" fill="currentColor" /></svg>
      ) : (
        <svg viewBox="0 0 14 14" width="15" height="15"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 2" /></svg>
      )}
    </button>
  );
}

function Bell() {
  return (
    <svg className="bell" viewBox="0 0 14 14" width="12" height="12" aria-label="Con recordatorio">
      <path d="M7 1.6c-2 0-3.2 1.5-3.2 3.4 0 2.6-1 3.4-1.5 3.9h9.4c-.5-.5-1.5-1.3-1.5-3.9 0-1.9-1.2-3.4-3.2-3.4z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.8 11.2a1.3 1.3 0 0 0 2.4 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// Editor inline de fecha/hora/aviso de una tarea existente.
function DueEditor({ task, onSave, onClose }) {
  const [date, setDate] = useState(task.due ? toDateInput(task.due) : '');
  const [time, setTime] = useState(
    task.due && task.hasTime
      ? new Date(task.due).toTimeString().slice(0, 5)
      : ''
  );
  const [preset, setPreset] = useState('keep');

  const save = (overrides = {}) => {
    const d = overrides.date !== undefined ? overrides.date : date;
    const t = overrides.time !== undefined ? overrides.time : time;
    const body = buildDue(d, t);
    if (preset !== 'keep') body.reminders = buildReminders(d, t, preset);
    else if (!d) body.reminders = []; // sin fecha no hay aviso que mantener
    onSave(body);
  };

  const quick = (days) => {
    if (days === null) { setDate(''); setTime(''); save({ date: '', time: '' }); return; }
    const d = new Date(); d.setDate(d.getDate() + days);
    save({ date: toDateInput(d) });
  };

  return (
    <div className="due-editor">
      <div className="quick-chips">
        <button type="button" onClick={() => quick(0)}>Hoy</button>
        <button type="button" onClick={() => quick(1)}>Mañana</button>
        <button type="button" onClick={() => quick(7)}>+1 semana</button>
        <button type="button" onClick={() => quick(null)}>Sin fecha</button>
      </div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
      <select value={preset} onChange={(e) => setPreset(e.target.value)} disabled={!date} title="Aviso por WhatsApp/Telegram">
        <option value="keep">Aviso: mantener</option>
        {REMINDER_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button type="button" className="btn small" onClick={() => save()}>Guardar</button>
      <button type="button" className="btn ghost small" onClick={onClose}>×</button>
    </div>
  );
}

export default function Tareas() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [sel, setSel] = useState('all'); // 'all' | 'none' | projectId
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [time, setTime] = useState('');
  const [reminder, setReminder] = useState('');
  const [priority, setPriority] = useState('');
  const [newProject, setNewProject] = useState(null); // null | {name, color}
  const [editing, setEditing] = useState(null); // id de la tarea con editor abierto
  const [error, setError] = useState('');

  const loadProjects = () => api.get('/projects').then(setProjects).catch((e) => setError(e.message));
  const loadTasks = () => {
    const p = sel === 'all' ? '' : `&project=${sel}`;
    api.get(`/tasks?when=all${p}`).then(setTasks).catch((e) => setError(e.message));
  };

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { loadTasks(); }, [sel]);

  const reload = () => { loadTasks(); loadProjects(); };

  const grouped = useMemo(() => {
    const g = { en_curso: [], pendiente: [], hecha: [] };
    for (const t of tasks) g[t.status]?.push(t);
    // vencidas y con fecha primero; sin fecha al final
    const rank = (t) => (t.due ? new Date(t.due).getTime() : Infinity);
    g.en_curso.sort((a, b) => rank(a) - rank(b));
    g.pendiente.sort((a, b) => rank(a) - rank(b));
    g.hecha = g.hecha.slice(-8).reverse(); // las hechas recientes, sin inundar
    return g;
  }, [tasks]);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.post('/tasks', {
        text: text.trim(),
        ...buildDue(due, time),
        reminders: buildReminders(due, time, reminder),
        priority,
        project: sel === 'all' || sel === 'none' ? null : sel,
      });
      setText(''); setDue(''); setTime(''); setReminder(''); setPriority('');
      reload();
    } catch (err) { setError(err.message); }
  };

  const patch = async (t, body) => {
    try { await api.patch(`/tasks/${t._id}`, body); setEditing(null); reload(); } catch (e) { setError(e.message); }
  };

  const cycle = (t) => patch(t, { status: NEXT_STATUS[t.status] });
  const setPrio = (t, value) => patch(t, { priority: value });

  const remove = async (t) => {
    try { await api.del(`/tasks/${t._id}`); reload(); } catch (e) { setError(e.message); }
  };

  const createProject = async () => {
    try {
      const p = await api.post('/projects', newProject);
      setNewProject(null);
      setSel(p._id);
      loadProjects();
    } catch (e) { setError(e.message); }
  };

  const removeProject = async (p) => {
    if (!confirm(`¿Borrar el proyecto "${p.name}"?`)) return;
    try {
      await api.del(`/projects/${p._id}`);
      if (sel === p._id) setSel('all');
      reload();
    } catch (e) { setError(e.message); }
  };

  const currentProject = projects.find((p) => p._id === sel);
  const totalPending = tasks.filter((t) => t.status !== 'hecha').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{currentProject ? currentProject.name : 'Tareas'}</h1>
          <p className="sub">{totalPending} sin terminar</p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="tasks-layout">
        {/* raíl de proyectos */}
        <div className="card light projects-rail">
          <button className={`proj-link ${sel === 'all' ? 'on' : ''}`} onClick={() => setSel('all')}>
            <span className="dot" style={{ background: 'var(--ink)' }} />
            <span className="name">Todas</span>
          </button>
          {projects.map((p) => (
            <div key={p._id} className={`proj-link ${sel === p._id ? 'on' : ''}`} onClick={() => setSel(p._id)}>
              <span className="dot" style={{ background: p.color }} />
              <span className="name">{p.name}</span>
              {p.pendingCount > 0 && <span className="count">{p.pendingCount}</span>}
              <button className="del" onClick={(e) => { e.stopPropagation(); removeProject(p); }} title="Borrar proyecto">×</button>
            </div>
          ))}

          {newProject ? (
            <div className="proj-new">
              <input
                autoFocus
                placeholder="Nombre del área"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && newProject.name.trim() && createProject()}
              />
              <div className="swatches">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${newProject.color === c ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewProject({ ...newProject, color: c })}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn small" onClick={createProject} disabled={!newProject.name.trim()}>Crear</button>
                <button className="btn ghost small" onClick={() => setNewProject(null)}>×</button>
              </div>
            </div>
          ) : (
            <button className="proj-link add" onClick={() => setNewProject({ name: '', color: PALETTE[0] })}>
              + Nuevo proyecto
            </button>
          )}
        </div>

        {/* tareas agrupadas por estado */}
        <div>
          <form className="card light quick-add" onSubmit={add}>
            <input
              className="grow"
              placeholder={currentProject ? `Nueva tarea en ${currentProject.name}…` : '¿Qué hay que hacer?'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p ? PRIORITY_LABEL[p] : 'Prioridad'}</option>)}
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Fecha (opcional)" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!due} title="Hora (opcional)" />
            <select value={reminder} onChange={(e) => setReminder(e.target.value)} disabled={!due} title="Aviso por WhatsApp/Telegram">
              {REMINDER_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn terra">Añadir</button>
          </form>

          {STATUS_ORDER.map((status) =>
            grouped[status].length === 0 ? null : (
              <div key={status} className="status-group">
                <div className="status-head">
                  <span className={`status-icon static ${status}`}>
                    {status === 'hecha' ? '●' : status === 'en_curso' ? '◐' : '○'}
                  </span>
                  {STATUS_LABEL[status]}
                  <span className="count">{grouped[status].length}</span>
                </div>
                <div className={`card ${status === 'en_curso' ? 'light' : ''}`}>
                  {grouped[status].map((t) => {
                    const dl = dueLabel(t);
                    const hasPendingReminder = t.reminders?.some((r) => !r.sentAt);
                    return (
                      <div key={t._id}>
                        <div className={`task-row ${status === 'hecha' ? 'done' : ''}`}>
                          <StatusIcon status={t.status} onClick={() => cycle(t)} />
                          {t.priority && <span className={`prio ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>}
                          <span className="text">{t.text}</span>
                          {sel === 'all' && t.project && (
                            <span className="proj-tag" style={{ color: t.project.color }}>● {t.project.name}</span>
                          )}
                          {hasPendingReminder && <Bell />}
                          <button
                            type="button"
                            className={`due ${dl?.overdue ? 'overdue' : ''} ${dl ? '' : 'empty'}`}
                            onClick={() => setEditing(editing === t._id ? null : t._id)}
                            title="Cambiar fecha, hora o aviso"
                          >
                            {dl ? dl.label : '+ fecha'}
                          </button>
                          <select
                            className="prio-select"
                            value={t.priority}
                            onChange={(e) => setPrio(t, e.target.value)}
                            title="Prioridad"
                          >
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p ? PRIORITY_LABEL[p] : '—'}</option>)}
                          </select>
                          <button className="del" onClick={() => remove(t)} title="Borrar">×</button>
                        </div>
                        {editing === t._id && (
                          <DueEditor task={t} onSave={(body) => patch(t, body)} onClose={() => setEditing(null)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {tasks.length === 0 && (
            <div className="card light"><div className="empty"><span className="big">✓</span>Nada por aquí. Añade la primera tarea.</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
