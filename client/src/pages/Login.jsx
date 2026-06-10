import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/login', { password });
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>OLIMPO<span className="bolt">_</span></h1>
        <p className="sub">&gt; root@olimpo:/escritorio$ acceso_requerido</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="field">
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        <button className="btn terra" style={{ width: '100%', justifyContent: 'center' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}
