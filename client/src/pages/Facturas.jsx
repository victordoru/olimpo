import { useEffect, useMemo, useRef, useState } from 'react';
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

  const [form, setForm] = useState({ clientId: '', items: [emptyItem()], ivaPct: 21, irpfPct: 7, notes: '', subject: '' });

  // Dictado / texto libre → borrador vía IA
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  // Plantillas recurrentes
  const [recurring, setRecurring] = useState([]);

  const load = () => {
    api.get('/invoices').then(setInvoices).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    api.get('/clients').then(setClients).catch(() => {});
    api.get('/recurring').then(setRecurring).catch(() => {});
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
      subject: '',
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
      subject: inv.subject || '',
    });
    setShowForm(true);
    setError('');
  };

  const createFromText = async () => {
    if (!nlText.trim()) return;
    setError('');
    setNlBusy(true);
    try {
      const draft = await api.post('/invoices/nl', { text: nlText });
      setNlText('');
      load();
      openEdit(draft); // se abre el borrador para revisarlo antes de emitir
    } catch (e) {
      setError(e.message);
    } finally {
      setNlBusy(false);
    }
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Tu navegador no soporta dictado por voz (usa Chrome o Edge)');
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const chunk = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(' ');
      setNlText((t) => (t ? `${t} ${chunk}` : chunk).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const generateRecurring = async (r) => {
    setError('');
    try {
      const draft = await api.post(`/recurring/${r._id}/generate`, {});
      load();
      openEdit(draft);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveAsRecurring = async (inv) => {
    const name = prompt('Nombre de la recurrente (p. ej. "Teatro — mensual web"):');
    if (!name) return;
    try {
      await api.post('/recurring', {
        name,
        clientId: inv.client?._id,
        items: inv.items,
        subjectTemplate: (inv.subject || '').replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i, '{MES}').replace(/\b20\d\d\b/, '{AÑO}'),
        ivaPct: inv.ivaPct,
        irpfPct: inv.irpfPct,
        notes: inv.notes,
      });
      api.get('/recurring').then(setRecurring).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  };

  const removeRecurring = async (r) => {
    if (!confirm(`¿Borrar la recurrente "${r.name}"?`)) return;
    try {
      await api.del(`/recurring/${r._id}`);
      api.get('/recurring').then(setRecurring).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
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
        subject: form.subject,
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

      <div className="card pad nl-box">
        <div className="label-row">Dicta o escribe la factura y la preparo como borrador</div>
        <div className="nl-input-row">
          <textarea
            rows={2}
            placeholder='P. ej.: "Factura para el Teatro de 623 euros por la grabación con dron del 12 de abril, desglosada en vuelo, planificación y licencia"'
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
          />
          <div className="nl-buttons">
            <button className={`btn ghost mic ${listening ? 'on' : ''}`} onClick={toggleMic} title="Dictar por voz">
              {listening ? '◉ Grabando…' : '🎤'}
            </button>
            <button className="btn terra" onClick={createFromText} disabled={nlBusy || !nlText.trim()}>
              {nlBusy ? 'Preparando…' : 'Crear borrador'}
            </button>
          </div>
        </div>
        {recurring.length > 0 && (
          <div className="recurring-row">
            {recurring.map((r) => (
              <span key={r._id} className="recurring-chip">
                <button className="gen" onClick={() => generateRecurring(r)} title="Genera el borrador del mes anterior">
                  ⟳ {r.name}
                </button>
                <button className="del" onClick={() => removeRecurring(r)} title="Borrar recurrente">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

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

          <div className="field">
            <label>Asunto (línea bajo la fecha)</label>
            <input
              placeholder="P. ej. Servicios correspondientes al mes de mayo de 2026"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
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
                    <button className="btn ghost small" onClick={() => saveAsRecurring(inv)} title="Guardar como recurrente">⟳</button>
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
