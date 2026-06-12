import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
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
  { to: '/', glyph: '01', label: 'Panel', key: 'panel' },
  { to: '/facturas', glyph: '02', label: 'Facturas', key: 'facturas' },
  { to: '/clientes', glyph: '03', label: 'Clientes', key: 'clientes' },
  { to: '/tareas', glyph: '04', label: 'Tareas', key: 'tareas' },
  { to: '/notas', glyph: '05', label: 'Notas', key: 'notas' },
  { to: '/gym', glyph: '06', label: 'Gym', key: 'gym' },
  { to: '/finanzas', glyph: '07', label: 'Finanzas', key: 'finanzas' },
  { to: '/ajustes', glyph: '08', label: 'Ajustes', key: 'ajustes' },
];

const navFor = (pathname) =>
  NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))) || NAV[0];

function NavMenu({ open, setOpen, onLogout }) {
  const onClose = () => setOpen(false);
  const location = useLocation();
  const current = navFor(location.pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('menu-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('menu-open');
    };
  }, [open, onClose]);

  return (
    <>
      <div className={`nav-overlay ${open ? 'open' : ''}`} onClick={onClose}>
        <div className="nav-overlay-inner" onClick={(e) => e.stopPropagation()}>
          <div className="nav-overlay-head">
            <span className="nav-prompt">&gt; root@olimpo:~$ cd</span>
            <div className="wordmark">
              OLIMPO<span className="bolt">_</span>
            </div>
          </div>
          <nav className="nav-grid">
            {NAV.map((n, i) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                style={{ '--i': i }}
                onClick={onClose}
              >
                <span className="glyph">{n.glyph}</span>
                <span className="label">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <button className="logout-btn" onClick={onLogout}>Salir</button>
        </div>
      </div>
      <button
        className={`fab ${open ? 'open' : ''}`}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setOpen(!open)}
      >
        {open ? <span className="fab-x">×</span> : (
          <>
            <span className="fab-glyph">{current.glyph}</span>
            <span className="fab-label">{current.label}</span>
          </>
        )}
      </button>
    </>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null); // null = comprobando
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api.get('/auth/me').then((r) => setAuth(r.authenticated)).catch(() => setAuth(false));
  }, []);

  // Tema por página (Facturas vive en claro) y cierre del menú al navegar.
  useEffect(() => {
    document.body.dataset.page = navFor(location.pathname).key;
    setMenuOpen(false);
  }, [location.pathname]);

  if (auth === null) return null;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const logout = async () => {
    await api.post('/auth/logout');
    setAuth(false);
  };

  return (
    <div className="shell">
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
      <NavMenu open={menuOpen} setOpen={setMenuOpen} onLogout={logout} />
    </div>
  );
}
