import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Ajustes() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings').then(setS).catch((e) => setError(e.message));
  }, []);

  if (!s) return null;
  const set = (key) => (e) => { setS({ ...s, [key]: e.target.value }); setSaved(false); };

  const save = async () => {
    setError('');
    try {
      const updated = await api.patch('/settings', {
        ...s,
        ivaDefault: Number(s.ivaDefault),
        irpfDefault: Number(s.irpfDefault),
        nextInvoiceNumber: Number(s.nextInvoiceNumber),
      });
      setS(updated);
      setSaved(true);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="sub">Tus datos de facturación: aparecen en los PDF</p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="card pad" style={{ maxWidth: 640 }}>
        <div className="field-row">
          <div className="field"><label>Nombre / Razón social</label><input value={s.businessName} onChange={set('businessName')} /></div>
          <div className="field" style={{ maxWidth: 180 }}><label>NIF</label><input value={s.nif} onChange={set('nif')} /></div>
        </div>
        <div className="field"><label>Dirección</label><input value={s.address} onChange={set('address')} /></div>
        <div className="field-row">
          <div className="field"><label>Ciudad</label><input value={s.city} onChange={set('city')} /></div>
          <div className="field" style={{ maxWidth: 120 }}><label>CP</label><input value={s.zip} onChange={set('zip')} /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>Email</label><input value={s.email} onChange={set('email')} /></div>
          <div className="field"><label>Teléfono</label><input value={s.phone} onChange={set('phone')} /></div>
        </div>
        <div className="field"><label>IBAN (para el pie de la factura)</label><input value={s.iban} onChange={set('iban')} /></div>
        <div className="field-row">
          <div className="field"><label>IVA por defecto %</label><input type="number" value={s.ivaDefault} onChange={set('ivaDefault')} /></div>
          <div className="field"><label>IRPF por defecto %</label><input type="number" value={s.irpfDefault} onChange={set('irpfDefault')} /></div>
          <div className="field"><label>Próximo Nº de factura</label><input type="number" value={s.nextInvoiceNumber} onChange={set('nextInvoiceNumber')} /></div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn terra" onClick={save}>Guardar</button>
          {saved && <span style={{ color: 'var(--olive)', fontSize: 13.5, fontWeight: 600 }}>Guardado ✓</span>}
        </div>
      </div>
    </div>
  );
}
