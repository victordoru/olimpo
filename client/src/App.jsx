import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Facturas from './pages/Facturas';
import Clientes from './pages/Clientes';
import Tareas from './pages/Tareas';
import Notas from './pages/Notas';
import Gym from './pages/Gym';
import Finanzas from './pages/Finanzas';
import Ajustes from './pages/Ajustes';

const NAV = [
  { to: '/', glyph: '01', label: 'Panel' },
  { to: '/facturas', glyph: '02', label: 'Facturas' },
  { to: '/clientes', glyph: '03', label: 'Clientes' },
  { to: '/tareas', glyph: '04', label: 'Tareas' },
  { to: '/notas', glyph: '05', label: 'Notas' },
  { to: '/gym', glyph: '06', label: 'Gym' },
  { to: '/finanzas', glyph: '07', label: 'Finanzas' },
  { to: '/ajustes', glyph: '08', label: 'Ajustes' },
];

export default function App() {
  const [auth, setAuth] = useState(null); // null = comprobando

  useEffect(() => {
    api.get('/auth/me').then((r) => setAuth(r.authenticated)).catch(() => setAuth(false));
  }, []);

  if (auth === null) return null;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const logout = async () => {
    await api.post('/auth/logout');
    setAuth(false);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="wordmark">
          OLIMPO<span className="bolt">_</span>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <span className="glyph">{n.glyph}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="logout-btn" onClick={logout}>Salir</button>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/facturas" element={<Facturas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/tareas" element={<Tareas />} />
          <Route path="/notas" element={<Notas />} />
          <Route path="/gym" element={<Gym />} />
          <Route path="/finanzas" element={<Finanzas />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
