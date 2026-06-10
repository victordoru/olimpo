import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, euros, fecha } from '../api';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    api.get('/invoices/summary').then(setSummary).catch(() => {});
    api.get('/tasks?when=pending').then(setTasks).catch(() => {});
  }, []);

  const year = new Date().getFullYear();
  const thisYear = summary?.porAño?.find((y) => y.año === year);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Panel</h1>
          <p className="sub">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="label">Pendiente de cobro</div>
          <div className="value terra">{euros(summary?.pendienteCobro?.total)}</div>
          <div className="hint">{summary?.pendienteCobro?.facturas ?? 0} facturas enviadas</div>
        </div>
        <div className="card stat">
          <div className="label">Facturado en {year}</div>
          <div className="value">{euros(thisYear?.total)}</div>
          <div className="hint">{thisYear?.facturas ?? 0} facturas emitidas</div>
        </div>
        <div className="card stat">
          <div className="label">Tareas pendientes</div>
          <div className="value">{tasks.length}</div>
          <div className="hint"><Link to="/tareas">ver tareas</Link></div>
        </div>
      </div>

      <div className="card">
        <table className="list">
          <thead>
            <tr><th>Próximas tareas</th><th className="num">Fecha</th></tr>
          </thead>
          <tbody>
            {tasks.slice(0, 6).map((t) => (
              <tr key={t._id}>
                <td>{t.text}</td>
                <td className="num">{fecha(t.due)}</td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr><td colSpan={2}><div className="empty">Nada pendiente. El Olimpo está en calma.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
