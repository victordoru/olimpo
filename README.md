# ⚡ Olimpo

Hub personal autoalojado: facturación de autónomo, clientes, tareas, notas y gimnasio.
Diseñado para vivir en un VPS junto a un agente (Hermes) que usa la misma API — ver [API.md](API.md).

## Stack

- **client/** — Vite + React (SPA en español)
- **server/** — Express + Mongoose, genera PDFs de factura con Puppeteer
- **MongoDB** — en localhost, una colección por módulo

## Arranque en desarrollo

```bash
# 1. MongoDB corriendo en local (mongod)

# 2. API
cd server
cp .env.example .env   # rellena APP_PASSWORD, JWT_SECRET y AGENT_API_KEY
npm install
npm run dev            # http://localhost:4000

# 3. Frontend
cd ../client
npm install
npm run dev            # http://localhost:5173 (proxy /api → 4000)
```

## Desplegar

```bash
./scripts/push-deploy.sh   # push a GitHub + pull/build/restart en el VPS
```

El despliegue también sincroniza la skill de Hermes: edita `hermes/SKILL.md`
en este repo (no el archivo de `~/.hermes/` del servidor) y despliega.
Si cambias la API, actualiza `API.md` y `hermes/SKILL.md` en el mismo commit.

## Producción (VPS)

```bash
cd client && npm run build   # genera client/dist, que el server sirve estático
cd ../server && NODE_ENV=production npm start
```

Detrás de Caddy/Nginx con HTTPS. MongoDB solo en 127.0.0.1.
PDFs generados en `server/storage/invoices/` (incluir en backups junto a mongodump).

## Seguridad

- Sesión web: cookie httpOnly firmada (login con `APP_PASSWORD`).
- Agente: `Authorization: Bearer AGENT_API_KEY`. Escrituras solo en lista blanca
  (`server/src/middleware/agentGuard.js`), sin DELETE, con campo `motivo`
  obligatorio y auditoría en la colección `auditlogs`.
- Los borradores de factura no consumen número: la numeración correlativa se
  asigna al emitir y las facturas emitidas son inmutables.
