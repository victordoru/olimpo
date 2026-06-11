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

# Sincroniza la skill de Hermes (hermes/SKILL.md es la fuente de verdad;
# la clave se inyecta desde server/.env y nunca se commitea).
if [ -d "$HOME/.hermes" ] && [ -f hermes/SKILL.md ]; then
  AGENT_KEY=$(grep '^AGENT_API_KEY=' server/.env | cut -d= -f2)
  mkdir -p "$HOME/.hermes/skills/olimpo"
  sed "s/__AGENT_API_KEY__/$AGENT_KEY/" hermes/SKILL.md > "$HOME/.hermes/skills/olimpo/SKILL.md"
  echo "→ skill de Hermes sincronizada"
fi

pm2 restart olimpo --update-env
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  curl -sf http://localhost:4000/api/health >/dev/null && { echo "✓ API sana tras el despliegue"; exit 0; }
done
echo "✗ la API no responde tras 10s, mira: pm2 logs olimpo"
exit 1
