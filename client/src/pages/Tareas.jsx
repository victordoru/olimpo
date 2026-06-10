import { useEffect, useState } from 'react';
import { api, fecha } from '../api';

export default function Tareas() {
  const [tasks, setTasks] = useState([]);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    api.get(`/tasks?when=${showDone ? 'all' : 'pending'}`).then(setTasks).catch((e) => setError(e.message));

  useEffect(() => { load(); }, [showDone]);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.post('/tasks', { text: text.trim(), due: due || null });
      setText('');
      setDue('');
      load();
    } catch (err) { setError(err.message); }
  };

  const toggle = async (t) => {
    try { await api.patch(`/tasks/${t._id}`, { done: !t.done }); load(); } catch (e) { setError(e.message); }
  };

  const remove = async (t) => {
    try { await api.del(`/tasks/${t._id}`); load(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tareas</h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={!showDone ? 'on' : ''} onClick={() => setShowDone(false)}>Pendientes</button>
          <button className={showDone ? 'on' : ''} onClick={() => setShowDone(true)}>Todas</button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <form className="card pad" style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'center' }} onSubmit={add}>
        <input
          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}
          placeholder="¿Qué hay que hacer?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          type="date"
          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <button className="btn terra">Añadir</button>
      </form>

      <div className="card">
        {tasks.map((t) => (
          <div key={t._id} className={`task-item ${t.done ? 'done' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
            <span className="text">{t.text}</span>
            <span className="due">{fecha(t.due)}</span>
            <button className="del" onClick={() => remove(t)} title="Borrar">×</button>
          </div>
        ))}
        {tasks.length === 0 && <div className="empty"><span className="big">✓</span>Todo hecho</div>}
      </div>
    </div>
  );
}
