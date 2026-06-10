import { useEffect, useState } from 'react';
import { api } from '../api';

const empty = { name: '', nif: '', address: '', city: '', zip: '', country: 'España', email: '' };

export default function Clientes() {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null); // null = cerrado; {..., _id?} = abierto
  const [error, setError] = useState('');

  const load = () => api.get('/clients').then(setClients).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    try {
      if (form._id) await api.patch(`/clients/${form._id}`, form);
      else await api.post('/clients', form);
      setForm(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (c) => {
    if (!confirm(`¿Borrar a ${c.name}?`)) return;
    try { await api.del(`/clients/${c._id}`); load(); } catch (e) { setError(e.message); }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Clientes</h1>
        <button className="btn terra" onClick={() => setForm({ ...empty })}>+ Nuevo cliente</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {form && (
        <div className="card pad light" style={{ marginBottom: 22 }}>
          <h3 style={{ marginBottom: 16 }}>{form._id ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <div className="field-row">
            <div className="field"><label>Nombre / Razón social</label><input value={form.name} onChange={set('name')} /></div>
            <div className="field" style={{ maxWidth: 180 }}><label>NIF / CIF</label><input value={form.nif} onChange={set('nif')} /></div>
          </div>
          <div className="field"><label>Dirección</label><input value={form.address} onChange={set('address')} /></div>
          <div className="field-row">
            <div className="field"><label>Ciudad</label><input value={form.city} onChange={set('city')} /></div>
            <div className="field" style={{ maxWidth: 120 }}><label>CP</label><input value={form.zip} onChange={set('zip')} /></div>
            <div className="field"><label>País</label><input value={form.country} onChange={set('country')} /></div>
          </div>
          <div className="field"><label>Email</label><input value={form.email} onChange={set('email')} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={save} disabled={!form.name}>Guardar</button>
            <button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card light table-card">
        <table className="list client-table">
          <thead>
            <tr><th>Nombre</th><th>NIF</th><th>Ciudad</th><th>Email</th><th></th></tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c._id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.nif}</td>
                <td>{c.city}</td>
                <td>{c.email}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn ghost small" onClick={() => setForm({ ...empty, ...c })}>Editar</button>
                    <button className="btn ghost small" onClick={() => remove(c)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={5}><div className="empty"><span className="big">◉</span>Añade tu primer cliente para poder facturar</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
