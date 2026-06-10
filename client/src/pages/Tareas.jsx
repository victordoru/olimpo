import { useEffect, useMemo, useState } from 'react';
import { api, fecha } from '../api';

const STATUS_ORDER = ['en_curso', 'pendiente', 'hecha'];
const STATUS_LABEL = { en_curso: 'En curso', pendiente: 'Pendiente', hecha: 'Hechas' };
const NEXT_STATUS = { pendiente: 'en_curso', en_curso: 'hecha', hecha: 'pendiente' };
const PRIORITIES = ['', 'baja', 'media', 'alta', 'urgente'];
const PRIORITY_LABEL = { '': '—', baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const PALETTE = ['#39ff14', '#f2f2f2', '#525252', '#9bff7a', '#2bd60e', '#8c8c8c', '#1d6a9e'];

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

export default function Tareas() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [sel, setSel] = useState('all'); // 'all' | 'none' | projectId
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('');
  const [newProject, setNewProject] = useState(null); // null | {name, color}
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
    g.hecha = g.hecha.slice(-8).reverse(); // las hechas recientes, sin inundar
    return g;
  }, [tasks]);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.post('/tasks', {
        text: text.trim(),
        due: due || null,
        priority,
        project: sel === 'all' || sel === 'none' ? null : sel,
      });
      setText(''); setDue(''); setPriority('');
      reload();
    } catch (err) { setError(err.message); }
  };

  const cycle = async (t) => {
    try { await api.patch(`/tasks/${t._id}`, { status: NEXT_STATUS[t.status] }); reload(); } catch (e) { setError(e.message); }
  };

  const setPrio = async (t, value) => {
    try { await api.patch(`/tasks/${t._id}`, { priority: value }); reload(); } catch (e) { setError(e.message); }
  };

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
        <div className="card projects-rail">
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
          <form className="card quick-add" onSubmit={add}>
            <input
              className="grow"
              placeholder={currentProject ? `Nueva tarea en ${currentProject.name}…` : '¿Qué hay que hacer?'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p ? PRIORITY_LABEL[p] : 'Prioridad'}</option>)}
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
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
                <div className="card">
                  {grouped[status].map((t) => (
                    <div key={t._id} className={`task-row ${status === 'hecha' ? 'done' : ''}`}>
                      <StatusIcon status={t.status} onClick={() => cycle(t)} />
                      {t.priority && <span className={`prio ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>}
                      <span className="text">{t.text}</span>
                      {sel === 'all' && t.project && (
                        <span className="proj-tag" style={{ color: t.project.color }}>● {t.project.name}</span>
                      )}
                      {t.due && <span className="due">{fecha(t.due)}</span>}
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
                  ))}
                </div>
              </div>
            )
          )}

          {tasks.length === 0 && (
            <div className="card"><div className="empty"><span className="big">✓</span>Nada por aquí. Añade la primera tarea.</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
