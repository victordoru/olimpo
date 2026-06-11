# Olimpo — guía para asistentes

Hub personal de Victor (autónomo en España): facturas, clientes, tareas por
proyectos, notas y gym. SPA Vite+React (`client/`) + API Express (`server/`)
+ MongoDB local. Producción en su VPS por Tailscale (`victor@100.93.76.49`,
puerto 4000, pm2 `olimpo`). En el VPS también vive el agente Hermes, que usa
esta API como sus herramientas.

## Regla de oro: la API tiene DOS consumidores documentados

Cada vez que cambies, añadas o elimines un endpoint, actualiza **las dos**
referencias en el mismo commit:

1. **`API.md`** — referencia técnica general.
2. **`hermes/SKILL.md`** — la skill que lee el agente Hermes en el VPS.
   Es la fuente de verdad: `scripts/deploy.sh` la copia automáticamente a
   `~/.hermes/skills/olimpo/SKILL.md` en cada despliegue, sustituyendo el
   placeholder `__AGENT_API_KEY__` por la clave real del `.env` del servidor.
   **Nunca pongas la clave real en este repo.**

Si un endpoint nuevo debe ser escribible por Hermes, añádelo también a la
lista blanca de `server/src/middleware/agentGuard.js` (y documenta en la
skill las reglas: campo `motivo` obligatorio, sin DELETE, borradores de
factura solamente).

## Flujo de trabajo

- Desarrollo local: Mongo local, `npm run dev` en server y client. La BD del
  VPS nunca se toca desde local.
- Desplegar: `./scripts/push-deploy.sh` (push + pull/build/restart/skill-sync
  en el VPS). Un `git push` a secas NO despliega.
- Las facturas emitidas son inmutables y la numeración correlativa se asigna
  al emitir: no cambies esa lógica sin hablarlo con Victor (requisito fiscal).

## Diseño

Brand kit SYSTEM_: negro #0A0A0A, blanco #F2F2F2, gris #525252, verde neón
#39FF14 como único acento (<5%), Anton + IBM Plex Mono, esquinas rectas,
labels uppercase. Las superficies claras (`.card.light`) señalan "aquí se
edita". El PDF de factura (`server/src/templates/invoice.html`) NO sigue este
kit: es el documento que reciben los clientes y se mantiene sobrio.
