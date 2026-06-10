import { useEffect, useState } from 'react';
import { api, fecha } from '../api';

export default function Notas() {
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = (query = '') =>
    api.get(`/notes${query ? `?q=${encodeURIComponent(query)}` : ''}`).then(setNotes).catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const open = (n) => {
    setSelected(n);
    setDraft({ title: n.title, content: n.content });
  };

  const openNew = () => {
    setSelected(null);
    setDraft({ title: '', content: '' });
  };

  const save = async () => {
    setError('');
    try {
      if (selected) {
        const updated = await api.patch(`/notes/${selected._id}`, draft);
        setSelected(updated);
      } else {
        const created = await api.post('/notes', draft);
        setSelected(created);
      }
      load(q);
    } catch (e) { setError(e.message); }
  };

  const remove = async () => {
    if (!selected || !confirm('¿Borrar esta nota?')) return;
    try {
      await api.del(`/notes/${selected._id}`);
      openNew();
      load(q);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Notas</h1>
        <button className="btn terra" onClick={openNew}>+ Nueva nota</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="notes-layout">
        <div className="card light" style={{ overflow: 'hidden' }}>
          <div className="note-search">
            <input
              placeholder="Buscar…"
              value={q}
              onChange={(e) => { setQ(e.target.value); load(e.target.value); }}
            />
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {notes.map((n) => (
              <button key={n._id} className={`note-link ${selected?._id === n._id ? 'on' : ''}`} onClick={() => open(n)}>
                <div className="t">{n.title || 'Sin título'}</div>
                <div className="p">{n.content.slice(0, 60)}</div>
              </button>
            ))}
            {notes.length === 0 && <div className="empty">Sin notas</div>}
          </div>
        </div>

        <div className="card pad light">
          <div className="field">
            <label>Título</label>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Contenido (markdown)</label>
            <textarea
              rows={14}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              style={{ resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" onClick={save} disabled={!draft.content.trim()}>Guardar</button>
            {selected && <button className="btn ghost" onClick={remove}>Borrar</button>}
            {selected && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-faint)' }}>Editada {fecha(selected.updatedAt)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
