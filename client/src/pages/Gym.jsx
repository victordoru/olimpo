import { useEffect, useState } from 'react';
import { api, fecha } from '../api';

const emptyEntry = () => ({ exercise: '', sets: '', reps: '', weight: '' });

export default function Gym() {
  const [workouts, setWorkouts] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ date: '', type: '', entries: [emptyEntry()], notes: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/workouts').then(setWorkouts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const setEntry = (i, key, value) =>
    setForm((f) => ({ ...f, entries: f.entries.map((en, idx) => (idx === i ? { ...en, [key]: value } : en)) }));

  const save = async () => {
    setError('');
    try {
      await api.post('/workouts', {
        date: form.date || undefined,
        type: form.type,
        notes: form.notes,
        entries: form.entries
          .filter((en) => en.exercise.trim())
          .map((en) => ({
            exercise: en.exercise,
            sets: Number(en.sets) || 1,
            reps: en.reps === '' ? null : Number(en.reps),
            weight: en.weight === '' ? null : Number(en.weight),
          })),
      });
      setShow(false);
      setForm({ date: '', type: '', entries: [emptyEntry()], notes: '' });
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Gym</h1>
        <button className="btn terra" onClick={() => setShow(!show)}>+ Registrar entreno</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {show && (
        <div className="card pad light" style={{ marginBottom: 22 }}>
          <div className="field-row">
            <div className="field" style={{ maxWidth: 180 }}>
              <label>Fecha</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Tipo (empuje, pierna, cardio…)</label>
              <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
          </div>
          <table className="list invoice-items-table">
            <thead>
              <tr><th>Ejercicio</th><th style={{ width: 80 }}>Series</th><th style={{ width: 80 }}>Reps</th><th style={{ width: 90 }}>Peso kg</th></tr>
            </thead>
            <tbody>
              {form.entries.map((en, i) => (
                <tr key={i}>
                  <td><input value={en.exercise} onChange={(e) => setEntry(i, 'exercise', e.target.value)} /></td>
                  <td><input type="number" value={en.sets} onChange={(e) => setEntry(i, 'sets', e.target.value)} /></td>
                  <td><input type="number" value={en.reps} onChange={(e) => setEntry(i, 'reps', e.target.value)} /></td>
                  <td><input type="number" step="0.5" value={en.weight} onChange={(e) => setEntry(i, 'weight', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setForm((f) => ({ ...f, entries: [...f.entries, emptyEntry()] }))}>
            + Ejercicio
          </button>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={save}>Guardar</button>
            <button className="btn ghost" onClick={() => setShow(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {workouts.map((w) => (
        <div key={w._id} className="card pad" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{w.type || 'Entreno'}</strong>
            <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{fecha(w.date)}</span>
          </div>
          {w.entries.map((en, i) => (
            <div key={i} style={{ fontSize: 13.5, color: 'var(--ink-soft)', padding: '2px 0' }}>
              {en.exercise} — {en.sets}×{en.reps ?? '?'}{en.weight ? ` · ${en.weight} kg` : ''}
            </div>
          ))}
          {w.notes && <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 6 }}>{w.notes}</div>}
        </div>
      ))}
      {workouts.length === 0 && <div className="card"><div className="empty"><span className="big">⚒</span>Ningún entreno registrado aún</div></div>}
    </div>
  );
}
