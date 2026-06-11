import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, euros, fecha } from '../api';

const SUBTABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'cobros', label: 'Cobros pendientes' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PALETTE = ['#39FF14', '#7DD3FC', '#FBBF24', '#FB7185', '#A78BFA', '#34D399', '#F472B6', '#94A3B8'];
const hoy = () => new Date().toISOString().slice(0, 10);

// ───────── Gráfica de barras ingreso vs gasto, mes a mes (SVG inline).
function MonthlyBars({ data }) {
  if (!data || data.length === 0) return <div className="empty">Aún no hay movimientos que mostrar</div>;
  const W = 720, H = 220, padB = 26, padT = 12, padL = 4;
  const max = Math.max(1, ...data.map((d) => Math.max(d.ingreso, d.gasto)));
  const slot = (W - padL) / data.length;
  const barW = Math.min(16, slot / 3);
  const scale = (v) => (H - padB - padT) * (v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fin-chart" preserveAspectRatio="xMidYMid meet">
      <line x1={padL} y1={H - padB} x2={W} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const gH = scale(d.gasto), iH = scale(d.ingreso);
        return (
          <g key={i}>
            <rect x={cx - barW - 1} y={H - padB - iH} width={barW} height={iH} fill="var(--terra)" />
            <rect x={cx + 1} y={H - padB - gH} width={barW} height={gH} fill="var(--line-strong)" />
            <text x={cx} y={H - 9} textAnchor="middle" className="fin-axis">{MESES[d.mes - 1]}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ───────── Barras horizontales de gasto por categoría.
function CategoryBars({ data, fmt }) {
  if (!data || data.length === 0) return <div className="empty">Sin gastos categorizados en este periodo</div>;
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="cat-bars">
      {data.map((c) => (
        <div className="cat-bar-row" key={c.categoryId || 'none'}>
          <div className="cat-bar-label">
            <span className="dot" style={{ background: c.color }} />
            {c.emoji} {c.name}
          </div>
          <div className="cat-bar-track">
            <div className="cat-bar-fill" style={{ width: `${(c.total / max) * 100}%`, background: c.color }} />
          </div>
          <div className="cat-bar-val">{fmt(c.total)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Finanzas() {
  const [sub, setSub] = useState('resumen');
  // Modo discreto: oculta todos los importes de la página (persiste entre sesiones).
  const [hide, setHide] = useState(() => localStorage.getItem('fin-hide') === '1');
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pending, setPending] = useState([]);
  const [invoicesPend, setInvoicesPend] = useState([]);
  const [clients, setClients] = useState([]);
  const [bank, setBank] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filtros de movimientos
  const [filters, setFilters] = useState({ kind: '', category: '', q: '' });

  // Formularios
  const [txForm, setTxForm] = useState(null); // { date, amount, description, counterparty, category }
  const [penForm, setPenForm] = useState(null); // { concept, clientId, amount, expectedDate }
  const [showCats, setShowCats] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', kind: 'gasto', color: PALETTE[0], emoji: '', rules: '' });

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 6000); };

  const money = (n) => (hide ? '••••' : euros(n));
  const toggleHide = () => {
    setHide((h) => {
      localStorage.setItem('fin-hide', h ? '0' : '1');
      return !h;
    });
  };

  const loadSummary = () => api.get('/transactions/summary').then(setSummary).catch((e) => setError(e.message));
  const loadTxns = () => {
    const qs = new URLSearchParams();
    if (filters.kind) qs.set('kind', filters.kind);
    if (filters.category) qs.set('category', filters.category);
    if (filters.q) qs.set('q', filters.q);
    return api.get(`/transactions${qs.toString() ? `?${qs}` : ''}`).then(setTxns).catch((e) => setError(e.message));
  };
  const loadPending = () => api.get('/pending').then(setPending).catch(() => {});
  const loadInvoicesPend = () => api.get('/invoices?status=enviada').then(setInvoicesPend).catch(() => {});

  useEffect(() => {
    loadSummary();
    api.get('/categories').then(setCategories).catch(() => {});
    api.get('/clients').then(setClients).catch(() => {});
    api.get('/bank/status').then(setBank).catch(() => {});
    loadPending();
    loadInvoicesPend();
  }, []);

  useEffect(() => { if (sub === 'movimientos') loadTxns(); }, [sub, filters]);

  // ───────── Derivados del resumen
  const ahora = new Date();
  const mesActual = summary?.porMes?.find((m) => m.año === ahora.getFullYear() && m.mes === ahora.getMonth() + 1);
  const pendFacturas = summary?.pendienteCobro?.facturas?.total ?? 0;
  const pendNegro = summary?.pendienteCobro?.negro?.total ?? 0;
  const ingresoRealMes = mesActual?.ingreso ?? 0;

  // ───────── Cobros pendientes combinados (facturas enviadas + negro)
  const cobros = useMemo(() => {
    const fromInvoices = invoicesPend.map((inv) => ({
      _id: inv._id,
      origin: 'factura',
      concept: inv.subject || `Factura Nº ${inv.number}`,
      clientName: inv.clientSnapshot?.name || inv.client?.name || '—',
      amount: inv.total,
      date: inv.issueDate || inv.createdAt,
      ref: inv,
    }));
    const fromNegro = pending.filter((p) => p.status === 'pendiente').map((p) => ({
      _id: p._id,
      origin: 'negro',
      concept: p.concept,
      clientName: p.client?.name || '—',
      amount: p.amount,
      date: p.expectedDate || p.createdAt,
      ref: p,
    }));
    return [...fromInvoices, ...fromNegro].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [invoicesPend, pending]);
  const totalCobros = cobros.reduce((s, c) => s + c.amount, 0);

  // ───────── Acciones movimientos
  const saveTx = async () => {
    setError('');
    try {
      const res = await api.post('/transactions', {
        date: txForm.date,
        amount: Number(txForm.amount),
        description: txForm.description,
        counterparty: txForm.counterparty,
        category: txForm.category || undefined,
      });
      setTxForm(null);
      loadTxns(); loadSummary(); loadInvoicesPend(); loadPending();
      if (res.reconcile?.matched) {
        flash(res.reconcile.type === 'invoice'
          ? `✓ Conciliado con la factura Nº ${res.reconcile.invoice.number} (marcada cobrada)`
          : `✓ Conciliado con el cobro pendiente "${res.reconcile.pending.concept}"`);
      } else if (res.reconcile?.suggestions) {
        flash(`Hay ${res.reconcile.suggestions} cobros con ese importe: revísalo en el movimiento`);
      }
    } catch (e) { setError(e.message); }
  };

  const setCategory = async (txn, categoryId) => {
    try {
      await api.patch(`/transactions/${txn._id}`, { category: categoryId || null });
      loadTxns(); loadSummary();
    } catch (e) { setError(e.message); }
  };

  const toggleIgnore = async (txn) => {
    try { await api.patch(`/transactions/${txn._id}`, { ignored: !txn.ignored }); loadTxns(); loadSummary(); }
    catch (e) { setError(e.message); }
  };

  const unreconcile = async (txn) => {
    try { await api.post(`/transactions/${txn._id}/unreconcile`, {}); loadTxns(); loadSummary(); loadInvoicesPend(); loadPending(); }
    catch (e) { setError(e.message); }
  };

  const confirmSuggestion = async (txn, body) => {
    try { await api.post(`/transactions/${txn._id}/confirm`, body); loadTxns(); loadSummary(); loadInvoicesPend(); loadPending(); flash('✓ Conciliación confirmada'); }
    catch (e) { setError(e.message); }
  };

  const deleteTx = async (txn) => {
    if (!confirm('¿Borrar este movimiento?')) return;
    try { await api.del(`/transactions/${txn._id}`); loadTxns(); loadSummary(); }
    catch (e) { setError(e.message); }
  };

  // ───────── Acciones categorías
  const saveCat = async () => {
    try {
      await api.post('/categories', {
        name: catForm.name, kind: catForm.kind, color: catForm.color, emoji: catForm.emoji,
        rules: catForm.rules.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setCatForm({ name: '', kind: 'gasto', color: PALETTE[0], emoji: '', rules: '' });
      api.get('/categories').then(setCategories);
    } catch (e) { setError(e.message); }
  };
  const deleteCat = async (c) => {
    if (!confirm(`¿Borrar la categoría "${c.name}"? Los movimientos quedarán sin categoría.`)) return;
    try { await api.del(`/categories/${c._id}`); api.get('/categories').then(setCategories); loadTxns(); loadSummary(); }
    catch (e) { setError(e.message); }
  };

  // ───────── Acciones cobros pendientes
  const savePending = async () => {
    setError('');
    try {
      await api.post('/pending', {
        concept: penForm.concept,
        clientId: penForm.clientId || undefined,
        amount: Number(penForm.amount),
        expectedDate: penForm.expectedDate || undefined,
      });
      setPenForm(null);
      loadPending(); loadSummary();
    } catch (e) { setError(e.message); }
  };
  const markCobro = async (c) => {
    try {
      if (c.origin === 'factura') await api.post(`/invoices/${c._id}/paid`, {});
      else await api.post(`/pending/${c._id}/paid`, {});
      loadInvoicesPend(); loadPending(); loadSummary();
    } catch (e) { setError(e.message); }
  };
  const deletePending = async (c) => {
    if (!confirm('¿Borrar este cobro pendiente?')) return;
    try { await api.del(`/pending/${c._id}`); loadPending(); loadSummary(); } catch (e) { setError(e.message); }
  };

  // ───────── Banco (GoCardless)
  const syncBank = async () => {
    setError('');
    try { const r = await api.post('/bank/sync', {}); flash(`Sincronizado: ${r.nuevos} nuevos, ${r.conciliados} conciliados`); loadTxns(); loadSummary(); }
    catch (e) { setError(e.message); }
  };

  // ───────── Importar extracto (Excel/CSV de BBVA)
  const importFile = async (file) => {
    if (!file) return;
    setError('');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/transactions/import', fd);
      const parts = [`${r.nuevos} nuevos`, `${r.duplicados} ya estaban`];
      if (r.conciliados.length) parts.push(`${r.conciliados.length} cobros conciliados: ${r.conciliados.join(' · ')}`);
      if (r.saldo !== null && !hide) parts.push(`saldo ${euros(r.saldo)}`);
      flash(`✓ Extracto importado — ${parts.join(' · ')}`);
      loadTxns(); loadSummary(); loadInvoicesPend(); loadPending();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const expenseCats = categories.filter((c) => c.kind === 'gasto');

  return (
    <div className="page finanzas-page">
      <div className="page-head">
        <div>
          <h1>Finanzas</h1>
          <p className="sub">Gastos, banco y cobros · {ahora.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost eye-toggle" onClick={toggleHide} title={hide ? 'Mostrar importes' : 'Ocultar importes'}>
            {hide ? '◌ OCULTO' : '◉ VISIBLE'}
          </button>
          {sub === 'movimientos' && <button className="btn terra" onClick={() => setTxForm({ date: hoy(), amount: '', description: '', counterparty: '', category: '' })}>+ Movimiento</button>}
          {sub === 'cobros' && <button className="btn terra" onClick={() => setPenForm({ concept: '', clientId: '', amount: '', expectedDate: '' })}>+ Cobro pendiente</button>}
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {notice && <div className="notice-msg">{notice}</div>}

      <div className="tabs">
        {SUBTABS.map((t) => (
          <button key={t.key} className={sub === t.key ? 'on' : ''} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ───────────────────────── RESUMEN */}
      {sub === 'resumen' && (
        <>
          <div className="stat-grid fin-stats">
            <div className="card stat light">
              <div className="label">Saldo en cuenta</div>
              <div className="value">{summary?.saldo ? money(summary.saldo.amount) : '—'}</div>
              <div className="hint">{summary?.saldo ? `extracto del ${fecha(summary.saldo.date)}` : 'importa un extracto para verlo'}</div>
            </div>
            <div className="card stat light">
              <div className="label">Pendiente de cobro</div>
              <div className="value terra">{money(pendFacturas + pendNegro)}</div>
              <div className="hint">{money(pendFacturas)} facturas · {money(pendNegro)} negro</div>
            </div>
            <div className="card stat light">
              <div className="label">Proyección</div>
              <div className="value terra">{summary?.proyeccion !== null && summary?.proyeccion !== undefined ? money(summary.proyeccion) : '—'}</div>
              <div className="hint">saldo + todo lo pendiente cobrado</div>
            </div>
            <div className="card stat light">
              <div className="label">Ingresos del mes (real)</div>
              <div className="value">{money(ingresoRealMes)}</div>
              <div className="hint">facturas + cobros en negro</div>
            </div>
            <div className="card stat light">
              <div className="label">Gastos del mes</div>
              <div className="value">{money(mesActual?.gasto)}</div>
              <div className="hint">salidas de cuenta</div>
            </div>
            <div className="card stat light">
              <div className="label">Neto del mes</div>
              <div className="value" style={{ color: (mesActual?.neto ?? 0) < 0 ? '#bd1f1f' : undefined }}>{money(mesActual?.neto)}</div>
              <div className="hint">ingresos − gastos</div>
            </div>
          </div>

          <div className="fin-cols">
            <div className="card pad light">
              <div className="label-row">Ingresos vs gastos · últimos 12 meses</div>
              <MonthlyBars data={summary?.porMes} />
              <div className="fin-legend">
                <span><i style={{ background: 'var(--terra)' }} /> Ingresos</span>
                <span><i style={{ background: 'var(--line-strong)' }} /> Gastos</span>
              </div>
            </div>
            <div className="card pad light">
              <div className="label-row">Gasto por categoría</div>
              <CategoryBars data={summary?.porCategoria} fmt={money} />
            </div>
          </div>

          <div className="card pad light">
            <div className="label-row">Mes a mes</div>
            <table className="list">
              <thead><tr><th>Mes</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Neto</th></tr></thead>
              <tbody>
                {(summary?.porMes || []).slice().reverse().map((m) => (
                  <tr key={`${m.año}-${m.mes}`}>
                    <td>{MESES[m.mes - 1]} {m.año}</td>
                    <td className="num">{money(m.ingreso)}</td>
                    <td className="num">{money(m.gasto)}</td>
                    <td className="num" style={{ color: m.neto >= 0 ? '#169607' : '#bd1f1f' }}>{money(m.neto)}</td>
                  </tr>
                ))}
                {(!summary?.porMes || summary.porMes.length === 0) && (
                  <tr><td colSpan={4}><div className="empty">Sin movimientos todavía. Añade uno en «Movimientos» o conecta el banco.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ───────────────────────── MOVIMIENTOS */}
      {sub === 'movimientos' && (
        <>
          <div className="card pad light bank-bar">
            <div className="bank-state">
              <span className="label">Banco</span>
              {bank?.configured ? (
                bank.status === 'conectado'
                  ? <span className="chip cobrada">{bank.institutionName} · {bank.accounts} cuenta(s)</span>
                  : <span className="chip borrador">{bank.status === 'pendiente_autorizacion' ? 'pendiente de autorizar' : 'sin conectar'}</span>
              ) : <span className="chip borrador">sin sync automático</span>}
            </div>
            <div className="bank-actions">
              <label className={`btn small ${importing ? 'ghost' : ''}`} style={{ cursor: importing ? 'wait' : 'pointer' }}>
                {importing ? 'Importando…' : '⬆ Importar extracto (Excel/CSV)'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  disabled={importing}
                  onChange={(e) => { importFile(e.target.files[0]); e.target.value = ''; }}
                />
              </label>
              {bank?.configured && bank.status === 'conectado' && <button className="btn ghost small" onClick={syncBank}>↻ Sincronizar</button>}
            </div>
          </div>

          <div className="card pad light fin-filters">
            <select value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
              <option value="">Todo</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
            </select>
            <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>)}
            </select>
            <input placeholder="Buscar concepto…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <button className="btn ghost small" onClick={() => setShowCats((v) => !v)}>{showCats ? 'Ocultar categorías' : 'Categorías'}</button>
          </div>

          {showCats && (
            <div className="card pad light cat-manager">
              <div className="label-row">Categorías</div>
              <div className="cat-chips">
                {categories.map((c) => (
                  <span key={c._id} className="cat-chip" style={{ borderColor: c.color }}>
                    <span className="dot" style={{ background: c.color }} />{c.emoji} {c.name}
                    <span className="kind">{c.kind}</span>
                    <button className="del" onClick={() => deleteCat(c)} title="Borrar">×</button>
                  </span>
                ))}
              </div>
              <div className="field-row" style={{ marginTop: 12 }}>
                <div className="field"><label>Nombre</label><input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
                <div className="field" style={{ maxWidth: 130 }}><label>Tipo</label>
                  <select value={catForm.kind} onChange={(e) => setCatForm({ ...catForm, kind: e.target.value })}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select>
                </div>
                <div className="field" style={{ maxWidth: 90 }}><label>Emoji</label><input value={catForm.emoji} onChange={(e) => setCatForm({ ...catForm, emoji: e.target.value })} /></div>
                <div className="field" style={{ maxWidth: 110 }}><label>Color</label>
                  <select value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}>{PALETTE.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                </div>
              </div>
              <div className="field"><label>Reglas (separadas por comas — autocategorizan por la descripción)</label>
                <input placeholder="mercadona, carrefour, lidl" value={catForm.rules} onChange={(e) => setCatForm({ ...catForm, rules: e.target.value })} /></div>
              <button className="btn small" onClick={saveCat} disabled={!catForm.name}>+ Añadir categoría</button>
            </div>
          )}

          {txForm && (
            <div className="card pad light" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 14 }}>Nuevo movimiento</h3>
              <div className="field-row">
                <div className="field" style={{ maxWidth: 150 }}><label>Fecha</label><input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} /></div>
                <div className="field" style={{ maxWidth: 150 }}><label>Importe € (− gasto)</label><input type="number" step="0.01" placeholder="-49,99" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} /></div>
                <div className="field"><label>Categoría</label>
                  <select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}>
                    <option value="">— auto —</option>
                    {categories.map((c) => <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Concepto</label><input placeholder="Suscripción Adobe" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} /></div>
              <div className="field"><label>Contraparte (opcional)</label><input value={txForm.counterparty} onChange={(e) => setTxForm({ ...txForm, counterparty: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={saveTx} disabled={!txForm.amount || !txForm.date}>Guardar</button>
                <button className="btn ghost" onClick={() => setTxForm(null)}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="card light table-card">
            <table className="list fin-txns">
              <thead>
                <tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th className="num">Importe</th><th></th></tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const reconciled = t.reconciledInvoice || t.reconciledPending;
                  const suggestions = [...(t.suggestedInvoices || []), ...(t.suggestedPendings || [])];
                  return (
                    <tr key={t._id} className={t.ignored ? 'tx-ignored' : ''}>
                      <td className="num">{fecha(t.date)}</td>
                      <td>
                        <div className="tx-desc">{t.description || '(sin concepto)'}</div>
                        {t.counterparty && <div className="tx-sub">{t.counterparty}</div>}
                        {reconciled && (
                          <span className="chip cobrada tx-badge">
                            ✓ {t.reconciledInvoice ? `Factura Nº ${t.reconciledInvoice.number}` : `Cobro: ${t.reconciledPending.concept}`}
                            <button className="link-undo" onClick={() => unreconcile(t)} title="Deshacer">deshacer</button>
                          </span>
                        )}
                        {!reconciled && suggestions.length > 0 && (
                          <div className="tx-suggest">
                            ⚠ ¿Coincide con?{' '}
                            {(t.suggestedInvoices || []).map((inv) => (
                              <button key={inv._id} className="btn ghost small" onClick={() => confirmSuggestion(t, { invoiceId: inv._id })}>Factura Nº {inv.number}</button>
                            ))}
                            {(t.suggestedPendings || []).map((p) => (
                              <button key={p._id} className="btn ghost small" onClick={() => confirmSuggestion(t, { pendingId: p._id })}>{p.concept}</button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <select className="cat-select" value={t.category?._id || ''} onChange={(e) => setCategory(t, e.target.value)}>
                          <option value="">— sin categoría —</option>
                          {categories.filter((c) => c.kind === (t.amount < 0 ? 'gasto' : 'ingreso')).map((c) => (
                            <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className={`num tx-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>{money(t.amount)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost small" onClick={() => toggleIgnore(t)} title="Ignorar en estadísticas">{t.ignored ? 'incluir' : 'ignorar'}</button>
                          {t.source !== 'gocardless' && <button className="btn ghost small" onClick={() => deleteTx(t)}>×</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {txns.length === 0 && <tr><td colSpan={5}><div className="empty">Sin movimientos. Añade uno o conecta el banco.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ───────────────────────── COBROS PENDIENTES */}
      {sub === 'cobros' && (
        <>
          <div className="stat-grid fin-stats">
            <div className="card stat light">
              <div className="label">Total pendiente</div>
              <div className="value terra">{money(totalCobros)}</div>
              <div className="hint">{cobros.length} cobros</div>
            </div>
            <div className="card stat light">
              <div className="label">En facturas</div>
              <div className="value">{money(pendFacturas)}</div>
              <div className="hint">{summary?.pendienteCobro?.facturas?.count ?? 0} facturas enviadas</div>
            </div>
            <div className="card stat light">
              <div className="label">En negro</div>
              <div className="value">{money(pendNegro)}</div>
              <div className="hint">{summary?.pendienteCobro?.negro?.count ?? 0} cobros sin factura</div>
            </div>
          </div>

          {penForm && (
            <div className="card pad light" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 14 }}>Nuevo cobro pendiente (sin factura)</h3>
              <div className="field-row">
                <div className="field"><label>Concepto</label><input placeholder="Grabación boda Marcos" value={penForm.concept} onChange={(e) => setPenForm({ ...penForm, concept: e.target.value })} /></div>
                <div className="field" style={{ maxWidth: 140 }}><label>Importe €</label><input type="number" step="0.01" value={penForm.amount} onChange={(e) => setPenForm({ ...penForm, amount: e.target.value })} /></div>
                <div className="field" style={{ maxWidth: 160 }}><label>Fecha prevista</label><input type="date" value={penForm.expectedDate} onChange={(e) => setPenForm({ ...penForm, expectedDate: e.target.value })} /></div>
              </div>
              <div className="field"><label>Cliente (opcional)</label>
                <select value={penForm.clientId} onChange={(e) => setPenForm({ ...penForm, clientId: e.target.value })}>
                  <option value="">— sin cliente —</option>
                  {clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={savePending} disabled={!penForm.concept || !penForm.amount}>Guardar</button>
                <button className="btn ghost" onClick={() => setPenForm(null)}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="card light table-card">
            <table className="list">
              <thead><tr><th>Concepto</th><th>Cliente</th><th>Origen</th><th>Fecha</th><th className="num">Importe</th><th></th></tr></thead>
              <tbody>
                {cobros.map((c) => (
                  <tr key={`${c.origin}-${c._id}`}>
                    <td>{c.concept}</td>
                    <td>{c.clientName}</td>
                    <td>
                      {c.origin === 'factura'
                        ? <Link to="/facturas" className="chip enviada">Factura Nº {c.ref.number}</Link>
                        : <span className="chip negro">negro</span>}
                    </td>
                    <td className="num">{fecha(c.date)}</td>
                    <td className="num">{money(c.amount)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn paid small" onClick={() => markCobro(c)}>Cobrado ✓</button>
                        {c.origin === 'negro' && <button className="btn ghost small" onClick={() => deletePending(c)}>×</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {cobros.length === 0 && <tr><td colSpan={6}><div className="empty">No te deben nada ahora mismo. 🎉</div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
