#!/bin/bash
# Se ejecuta EN el VPS: actualiza el código, reinstala deps si cambiaron,
# recompila el frontend y reinicia la API. La base de datos no se toca.
set -e
cd "$(dirname "$0")/.."

BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Sin cambios nuevos ($(git log -1 --format=%h))"
  exit 0
fi

echo "Desplegando $(git log -1 --format='%h %s')"

if git diff --name-only "$BEFORE" "$AFTER" | grep -q "^server/package"; then
  echo "→ dependencias del server cambiaron, npm install"
  (cd server && npm install --no-audit --no-fund)
fi
if git diff --name-only "$BEFORE" "$AFTER" | grep -q "^client/package"; then
  echo "→ dependencias del client cambiaron, npm install"
  (cd client && npm install --no-audit --no-fund)
fi

if git diff --name-only "$BEFORE" "$AFTER" | grep -q "^client/"; then
  echo "→ recompilando frontend"
  (cd client && npm run build)
fi

pm2 restart olimpo --update-env
sleep 2
curl -sf http://localhost:4000/api/health >/dev/null && echo "✓ API sana tras el despliegue" || { echo "✗ la API no responde, mira: pm2 logs olimpo"; exit 1; }
