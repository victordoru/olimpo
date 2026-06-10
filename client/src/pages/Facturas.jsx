import { useEffect, useMemo, useState } from 'react';
import { api, euros, fecha } from '../api';

const TABS = [
  { key: '', label: 'Todas' },
  { key: 'borrador', label: 'Borradores' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'cobrada', label: 'Cobradas' },
];

const emptyItem = () => ({ concept: '', quantity: 1, price: '' });

export default function Facturas() {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // factura en edición (borrador)
  const [error, setError] = useState('');

  const [form, setForm] = useState({ clientId: '', items: [emptyItem()], ivaPct: 21, irpfPct: 7, notes: '' });

  const load = () => {
    api.get('/invoices').then(setInvoices).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    api.get('/clients').then(setClients).catch(() => {});
    api.get('/settings').then((s) => {
      setSettings(s);
      setForm((f) => ({ ...f, ivaPct: s.ivaDefault, irpfPct: s.irpfDefault }));
    }).catch(() => {});
  }, []);

  const visible = tab ? invoices.filter((i) => i.status === tab) : invoices;

  const totals = useMemo(() => {
    const base = form.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
    const iva = base * (Number(form.ivaPct) || 0) / 100;
    const irpf = base * (Number(form.irpfPct) || 0) / 100;
    return { base, iva, irpf, total: base + iva - irpf };
  }, [form]);

  const openNew = () => {
    setEditing(null);
    setForm({
      clientId: clients[0]?._id || '',
      items: [emptyItem()],
      ivaPct: settings?.ivaDefault ?? 21,
      irpfPct: settings?.irpfDefault ?? 7,
      notes: '',
    });
    setShowForm(true);
    setError('');
  };

  const openEdit = (inv) => {
    setEditing(inv);
    setForm({
      clientId: inv.client?._id || '',
      items: inv.items.map((it) => ({ ...it })),
      ivaPct: inv.ivaPct,
      irpfPct: inv.irpfPct,
      notes: inv.notes || '',
    });
    setShowForm(true);
    setError('');
  };

  const setItem = (i, key, value) => {
    setForm((f) => {
      const items = f.items.map((it, idx) => (idx === i ? { ...it, [key]: value } : it));
      return { ...f, items };
    });
  };

  const save = async () => {
    setError('');
    try {
      const payload = {
        clientId: form.clientId,
        items: form.items
          .filter((it) => it.concept.trim())
          .map((it) => ({ concept: it.concept, quantity: Number(it.quantity) || 1, price: Number(it.price) })),
        ivaPct: Number(form.ivaPct),
        irpfPct: Number(form.irpfPct),
        notes: form.notes,
      };
      if (editing) await api.patch(`/invoices/${editing._id}`, payload);
      else await api.post('/invoices', payload);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const emit = async (inv) => {
    if (!confirm(`Emitir esta factura le asignará el Nº ${settings?.nextInvoiceNumber ?? '…'} y ya no podrá editarse. ¿Seguro?`)) return;
    try {
      await api.post(`/invoices/${inv._id}/emit`, {});
      load();
      api.get('/settings').then(setSettings).catch(() => {});
    } catch (e) { setError(e.message); }
  };

  const markPaid = async (inv) => {
    try { await api.post(`/invoices/${inv._id}/paid`, {}); load(); } catch (e) { setError(e.message); }
  };

  const remove = async (inv) => {
    if (!confirm('¿Borrar este borrador?')) return;
    try { await api.del(`/invoices/${inv._id}`); load(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Facturas</h1>
          <p className="sub">Próximo número: {settings?.nextInvoiceNumber ?? '…'}</p>
        </div>
        <button className="btn terra" onClick={openNew}>+ Nueva factura</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {showForm && (
        <div className="card pad" style={{ marginBottom: 22 }}>
          <h3 style={{ marginBottom: 16 }}>{editing ? 'Editar borrador' : 'Nueva factura (borrador)'}</h3>
          <div className="field-row">
            <div className="field">
              <label>Cliente</label>
              <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">— elige cliente —</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>IVA %</label>
              <input type="number" value={form.ivaPct} onChange={(e) => setForm({ ...form, ivaPct: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>IRPF %</label>
              <input type="number" value={form.irpfPct} onChange={(e) => setForm({ ...form, irpfPct: e.target.value })} />
            </div>
          </div>

          <table className="list invoice-items-table">
            <thead>
              <tr><th>Concepto</th><th style={{ width: 90 }}>Cant.</th><th style={{ width: 130 }}>Precio €</th><th style={{ width: 40 }}></th></tr>
            </thead>
            <tbody>
              {form.items.map((it, i) => (
                <tr key={i}>
                  <td><input value={it.concept} placeholder="Descripción del servicio" onChange={(e) => setItem(i, 'concept', e.target.value)} /></td>
                  <td><input type="number" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} /></td>
                  <td><input type="number" step="0.01" value={it.price} placeholder="0,00" onChange={(e) => setItem(i, 'price', e.target.value)} /></td>
                  <td>
                    {form.items.length > 1 && (
                      <button className="btn ghost small" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}>
            + Añadir línea
          </button>

          <div className="invoice-totals">
            <div className="r"><span>Base</span><span>{euros(totals.base)}</span></div>
            <div className="r"><span>IVA {form.ivaPct}%</span><span>{euros(totals.iva)}</span></div>
            <div className="r"><span>IRPF −{form.irpfPct}%</span><span>−{euros(totals.irpf)}</span></div>
            <div className="r total"><span>Total</span><span>{euros(totals.total)}</span></div>
          </div>

          <div className="field" style={{ marginTop: 6 }}>
            <label>Notas (aparecen al pie del PDF)</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="btn" onClick={save} disabled={!form.clientId}>Guardar borrador</button>
            <button className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="card">
        <table className="list">
          <thead>
            <tr>
              <th>Nº</th><th>Cliente</th><th>Fecha</th><th className="num">Total</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((inv) => (
              <tr key={inv._id}>
                <td>{inv.number ? `Nº ${inv.number}` : '—'}</td>
                <td>{inv.clientSnapshot?.name || inv.client?.name}</td>
                <td>{fecha(inv.issueDate || inv.createdAt)}</td>
                <td className="num">{euros(inv.total)}</td>
                <td><span className={`chip ${inv.status}`}>{inv.status}</span></td>
                <td>
                  <div className="row-actions">
                    <a className="btn ghost small" href={`/api/invoices/${inv._id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                    {inv.status === 'borrador' && (
                      <>
                        <button className="btn ghost small" onClick={() => openEdit(inv)}>Editar</button>
                        <button className="btn terra small" onClick={() => emit(inv)}>Emitir</button>
                        <button className="btn ghost small" onClick={() => remove(inv)}>×</button>
                      </>
                    )}
                    {inv.status === 'enviada' && (
                      <button className="btn small" onClick={() => markPaid(inv)}>Cobrada ✓</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={6}><div className="empty"><span className="big">𓂃</span>Sin facturas aquí todavía</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
