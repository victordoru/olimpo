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
import Ajustes from './pages/Ajustes';

const NAV = [
  { to: '/', glyph: '◈', label: 'Panel' },
  { to: '/facturas', glyph: '𓂃', label: 'Facturas' },
  { to: '/clientes', glyph: '◉', label: 'Clientes' },
  { to: '/tareas', glyph: '✓', label: 'Tareas' },
  { to: '/notas', glyph: '✎', label: 'Notas' },
  { to: '/gym', glyph: '⚒', label: 'Gym' },
  { to: '/ajustes', glyph: '⚙', label: 'Ajustes' },
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
          <span className="bolt">⚡</span> Olimpo
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
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
