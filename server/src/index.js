require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { connectDB } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { agentGuard } = require('./middleware/agentGuard');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));

// Todo lo demás requiere sesión (web) o API key (Hermes),
// y las escrituras del agente pasan por la lista blanca + auditoría.
const api = express.Router();
api.use(requireAuth, agentGuard);
api.use('/clients', require('./routes/clients'));
api.use('/invoices', require('./routes/invoices'));
api.use('/tasks', require('./routes/tasks'));
api.use('/projects', require('./routes/projects'));
api.use('/notes', require('./routes/notes'));
api.use('/workouts', require('./routes/workouts'));
api.use('/settings', require('./routes/settings'));
app.use('/api', api);

// En producción sirve el frontend compilado.
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

// Errores no capturados de las rutas.
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const PORT = process.env.PORT || 4000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`[api] escuchando en http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('[db] no se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  });
